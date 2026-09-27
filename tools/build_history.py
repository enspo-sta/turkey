#!/usr/bin/env python3
"""Build history.html, the long read "The Story of Türkiye", from content/history.json.

    python3 tools/build_history.py                 # writes history.html (uses turkey-animation.js)
    python3 tools/build_history.py --artifact OUT  # also writes a self-contained copy for publishing

The animation engine (turkey-animation.js) runs embedded in the page and plays the scene that
matches the section being read. All text, dates and sources live in content/history.json.
"""
import html
import json
import math
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WPM = 230  # reading speed used for the reading-time estimates

ERAS = [  # map filter groups, in time order
    ("prehistory", "Prehistory", ["land", "first-temples", "first-towns"]),
    ("bronze-iron", "Bronze and Iron Age", ["bronze-age", "troy", "iron-kingdoms"]),
    ("greek-roman", "Greek and Roman", ["alexander", "cilicia", "rome"]),
    ("byzantine-seljuk", "Byzantine and Seljuk", ["byzantium", "seljuks"]),
    ("ottoman", "Ottoman", ["ottoman-rise", "ottoman-height", "reform", "collapse"]),
    ("republic", "Republic", ["republic", "modern"]),
    ("visiting", "Visiting today", ["visiting"]),
]

ALLOWED = re.compile(r"</?(a|em|strong)(\s[^>]*)?>", re.I)


def clean_inline(text):
    """Keep only <a href>, <em> and <strong>; normalise links to open in a new tab."""
    def fix_tag(m):
        tag = m.group(0)
        if not ALLOWED.fullmatch(tag):
            raise ValueError(f"tag not allowed: {tag}")
        if tag.lower().startswith("<a"):
            href = re.search(r"href\s*=\s*['\"]([^'\"]+)['\"]", tag)
            if not href or not href.group(1).startswith("https://"):
                raise ValueError(f"bad link: {tag}")
            return f'<a href="{html.escape(href.group(1), quote=True)}" target="_blank" rel="noopener">'
        return tag.lower().split()[0].rstrip(">") + ">" if tag.startswith("</") else tag.lower()
    return re.sub(r"<[^>]+>", fix_tag, text)


def words(text):
    return len(re.findall(r"[\w’'-]+", re.sub(r"<[^>]+>", " ", text)))


def fmt_year(y):
    return f"{-y} BCE" if y < 0 else (f"{y} CE" if y < 1000 else str(y))


def esc(s):
    return html.escape(s, quote=True)


def build(sections):
    total_words = 0
    for s in sections:
        s["words"] = sum(words(p) for p in s["paragraphs"]) + words(s.get("lede", ""))
        s["minutes"] = max(1, round(s["words"] / WPM))
        total_words += s["words"]
    total_min = round(total_words / WPM)
    era_of = {sid: key for key, _, ids in ERAS for sid in ids}

    toc = "\n".join(
        f'<li><a href="#{s["id"]}" data-toc="{s["id"]}"><span class="toc-n">{i + 1}</span>'
        f'<span class="toc-t">{esc(s["title"])}<small>{esc(s["dates"])}</small></span>'
        f'<span class="toc-m">{s["minutes"]} min</span><span class="toc-c" aria-hidden="true"></span></a></li>'
        for i, s in enumerate(sections))

    blocks = []
    for i, s in enumerate(sections):
        paras = []
        for k, p in enumerate(s["paragraphs"]):
            scene = s.get("paragraph_scenes", {}).get(str(k))
            attr = f' data-scene="{scene}"' if scene is not None else ""
            paras.append(f"<p{attr}>{clean_inline(p)}</p>")
            if k == 1 and s.get("facts"):
                facts = "".join(f"<div><dt>{esc(f['label'])}</dt><dd>{esc(f['value'])}</dd></div>" for f in s["facts"])
                paras.append(f'<aside class="card glance" aria-label="At a glance"><div class="kicker">At a glance</div><dl>{facts}</dl></aside>')
        q = s.get("quiz")
        quiz = ""
        if q:
            opts = "".join(f'<button type="button" data-i="{j}">{esc(o)}</button>' for j, o in enumerate(q["options"]))
            quiz = (f'<div class="card quiz" data-quiz="{s["id"]}" data-answer="{int(q["answer"])}">'
                    f'<div class="kicker">Check yourself</div><p class="quiz-q">{esc(q["q"])}</p>'
                    f'<div class="quiz-opts">{opts}</div><p class="quiz-explain" hidden>{esc(q["explain"])}</p></div>')
        srcs = "".join(f'<li><a href="{esc(x["url"])}" target="_blank" rel="noopener">{esc(x["title"])}</a></li>' for x in s["sources"])
        blocks.append(f"""
<section class="chapter" id="{s['id']}" data-scene="{s['scene']}" data-i="{i}" data-era="{era_of.get(s['id'], '')}">
  <div class="kicker">{esc(s['dates'])} <span class="dot" aria-hidden="true">·</span> {s['minutes']} min read</div>
  <h2>{esc(s['title'])}</h2>
  <p class="lede">{esc(s['lede'])}</p>
  <div class="prose">
    {''.join(paras)}
  </div>
  {quiz}
  <details class="sources"><summary>Sources for this section ({len(s['sources'])})</summary><ol>{srcs}</ol></details>
</section>""")
        if s["id"] == "visiting":
            blocks[-1] = blocks[-1].replace("</section>", MAP_BLOCK + "\n</section>")
        if i < len(sections) - 1:
            blocks.append('<div class="divider" aria-hidden="true"><svg viewBox="-10 -10 20 20"><use href="#star8"/></svg></div>')

    page_data = {
        "wpm": WPM,
        "eras": [{"key": k, "label": l, "ids": ids} for k, l, ids in ERAS],
        "sections": [{
            "id": s["id"], "title": s["title"], "dates": s["dates"], "scene": s["scene"], "words": s["words"],
            "era": era_of.get(s["id"], ""), "bar": s.get("bar"),
            "timeline": s.get("timeline", []), "places": s.get("places", []),
        } for s in sections],
    }
    return total_words, total_min, toc, "\n".join(blocks), page_data


MAP_BLOCK = """
  <div class="card atlas" id="atlas">
    <div class="kicker">Map of the sites in this long read</div>
    <div class="chips" role="group" aria-label="Filter the map by era" id="atlas-filters"></div>
    <div class="atlas-map"><svg id="atlas-svg" viewBox="0 0 1000 470" role="img" aria-label="Map of Türkiye with the historical sites from every section"></svg></div>
    <div class="atlas-card" id="atlas-card" aria-live="polite"><p class="muted">Select a site on the map or in the list below.</p></div>
    <ul class="atlas-list" id="atlas-list" aria-label="Sites shown on the map"></ul>
  </div>"""


CSS = r"""
:root{
  color-scheme:dark;
  --bg:#101216;--surface:#181b21;--surface2:#1f232b;--border:#2a2f39;
  --text:#e7eaf0;--muted:#9aa3b1;--accent:#d9a441;--accent2:#56b6c2;--danger:#e06c75;--ok:#98c379;
  --serif:"Iowan Old Style","Charter","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --gut:clamp(16px,4vw,40px);
}
html{background:var(--bg);scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 var(--sans);-webkit-text-size-adjust:100%}
a{color:var(--accent2);text-underline-offset:.18em;text-decoration-thickness:1px}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px}
.kicker{font:600 .78rem/1.3 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.muted{color:var(--muted)}
.progress{position:fixed;top:0;left:0;right:0;height:3px;z-index:20;background:transparent;padding-top:env(safe-area-inset-top,0px);pointer-events:none}
.progress i{display:block;height:3px;width:0;background:var(--accent)}
.wrap{max-width:1280px;margin:0 auto;padding-inline:var(--gut);padding-block:28px 72px}
.masthead{border-top:4px double var(--accent);border-bottom:4px double var(--border);padding-block:28px 30px;margin-bottom:32px;display:grid;gap:14px}
.masthead h1{font:400 clamp(2.4rem,6vw,4.1rem)/1.04 var(--serif);margin:0;letter-spacing:-.01em;text-wrap:balance}
.masthead .lede{font:400 clamp(1.08rem,2.2vw,1.3rem)/1.55 var(--serif);color:var(--text);max-width:62ch;margin:0}
.meta{display:flex;flex-wrap:wrap;gap:8px 22px;color:var(--muted);font-size:.92rem}
.meta b{color:var(--text);font-weight:600;font-variant-numeric:tabular-nums}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:4px}
.btn,button{font:600 .9rem/1 var(--sans);color:var(--text);background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:.62rem .9rem;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:.45rem}
.btn:hover,button:hover{border-color:var(--muted)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#16130c}
.layout{display:grid;grid-template-columns:minmax(0,1fr);gap:28px}
.article{min-width:0}
.card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:18px 20px}
/* scene panel */
.panel{align-self:start;z-index:6}
.panel .card{padding:12px;display:grid;gap:10px}
.scene-wrap{position:relative;width:100%;aspect-ratio:16/9;border-radius:6px;overflow:hidden;background:#070b1c}
#scene{position:absolute;inset:0;width:100%;height:100%;display:block}
.scene-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.scene-bar button{padding:.5rem .7rem;font-size:.84rem}
.scene-bar button[aria-pressed="true"]{border-color:var(--accent);color:var(--accent)}
.scene-now{font:600 .74rem/1.35 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);flex:1 1 180px;min-width:0}
.scene-now b{color:var(--accent2);font-weight:600}
.readout{display:flex;justify-content:space-between;gap:12px;font-size:.84rem;color:var(--muted);font-variant-numeric:tabular-nums}
.readout b{color:var(--text);font-weight:600}
.panel.collapsed .scene-wrap,.panel.collapsed .tl-panel{display:none}
@media (min-width:1100px){
  .layout{grid-template-columns:minmax(0,700px) minmax(380px,1fr);gap:48px}
  .panel{position:sticky;top:calc(env(safe-area-inset-top,0px) + 14px);grid-column:2;grid-row:1}
  .article{grid-column:1;grid-row:1}
  .tl-flow{display:none}
}
@media (max-width:1099px){
  .panel{position:sticky;top:env(safe-area-inset-top,0px);margin-inline:calc(-1 * var(--gut));background:var(--bg);padding:6px var(--gut) 8px;border-bottom:1px solid var(--border)}
  .panel .card{padding:8px;border:0;background:transparent}
  .scene-wrap{max-height:28vh;aspect-ratio:auto;height:min(56.25vw,28vh)}
  .tl-panel,.readout .rt{display:none}
}
/* contents and timeline */
.intro-grid{display:grid;gap:18px;margin-bottom:12px}
.toc{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:2px}
.toc a{display:grid;grid-template-columns:2.1em 1fr auto 1.2em;align-items:baseline;gap:8px;padding:.42rem .5rem;border-radius:6px;color:var(--text);text-decoration:none}
.toc a:hover{background:var(--surface2)}
.toc a.active{background:var(--surface2);box-shadow:inset 3px 0 0 var(--accent)}
.toc-n{color:var(--muted);font-variant-numeric:tabular-nums;font-size:.85rem}
.toc-t{font:400 1.02rem/1.35 var(--serif)}
.toc-t small{display:block;font:400 .78rem/1.3 var(--sans);color:var(--muted);margin-top:2px}
.toc-m{color:var(--muted);font-size:.82rem;font-variant-numeric:tabular-nums;white-space:nowrap}
.toc-c{color:var(--ok);font-size:.9rem}
.toc a.read .toc-c::before{content:"✓"}
.tl{position:relative}
.tl svg{width:100%;height:auto;display:block;overflow:visible}
.tl-tip{position:absolute;pointer-events:none;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:6px 9px;font-size:.8rem;line-height:1.35;color:var(--text);max-width:240px;transform:translate(-50%,-100%);white-space:normal;z-index:3}
.tl-tip b{color:var(--accent);font-variant-numeric:tabular-nums}
.tl-note{font-size:.8rem;color:var(--muted);margin:6px 0 0}
/* sections */
.chapter{scroll-margin-top:calc(env(safe-area-inset-top,0px) + 16px);padding-block:8px}
@media (max-width:1099px){.chapter{scroll-margin-top:calc(env(safe-area-inset-top,0px) + min(56.25vw,28vh) + 80px)}}
.chapter h2{font:400 clamp(1.9rem,4.4vw,2.6rem)/1.12 var(--serif);margin:.35em 0 .3em;text-wrap:balance}
.chapter .lede{font:italic 400 1.18rem/1.55 var(--serif);color:var(--text);margin:0 0 1.2em;max-width:62ch}
.dot{color:var(--muted)}
.prose p{font:400 1.0625rem/1.72 var(--serif);margin:0 0 1.05em;max-width:68ch;hyphens:auto}
.prose p a{overflow-wrap:anywhere}
.glance{margin:1.4em 0 1.6em;max-width:62ch}
.glance dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px 22px;margin:10px 0 0}
.glance dt{font:600 .74rem/1.3 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.glance dd{margin:3px 0 0;font:400 1rem/1.4 var(--serif)}
.quiz{margin:1.6em 0 1em;max-width:62ch}
.quiz-q{font:400 1.08rem/1.5 var(--serif);margin:.5em 0 .8em}
.quiz-opts{display:grid;gap:8px}
.quiz-opts button{justify-content:flex-start;text-align:left;font-weight:500;line-height:1.35;padding:.7rem .85rem}
.quiz-opts button.right{border-color:var(--ok);color:var(--ok)}
.quiz-opts button.wrong{border-color:var(--danger);color:var(--danger)}
.quiz-opts button:disabled{cursor:default;opacity:1}
.quiz-explain{margin:.9em 0 0;color:var(--text);font-size:.95rem}
.quiz-explain b{color:var(--ok)}
.sources{margin:1em 0 .6em;max-width:68ch;font-size:.9rem}
.sources summary{cursor:pointer;color:var(--muted);font-weight:600;padding:.3rem 0}
.sources ol{margin:.5em 0 0;padding-left:1.4em;color:var(--muted);display:grid;gap:.35em}
.sources a{overflow-wrap:anywhere}
.divider{display:flex;justify-content:center;padding-block:34px}
.divider svg{width:22px;height:22px}
/* atlas */
.atlas{margin:1.8em 0 1em;display:grid;gap:12px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chips button{padding:.42rem .7rem;font-size:.8rem;border-radius:999px}
.chips button[aria-pressed="true"]{border-color:var(--accent);color:var(--accent)}
.atlas-map{overflow-x:auto}
.atlas-map svg{width:100%;min-width:520px;height:auto;display:block}
.atlas-card{background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:12px 14px;min-height:3.2em}
.atlas-card h3{font:400 1.2rem/1.3 var(--serif);margin:0 0 4px}
.atlas-card p{margin:.3em 0 0}
.atlas-list{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.atlas-list button{font-size:.8rem;padding:.38rem .6rem;font-weight:500}
.atlas-list button[aria-pressed="true"]{border-color:var(--accent);color:var(--accent)}
.pin{cursor:pointer}
footer.colophon{margin-top:56px;border-top:4px double var(--border);border-bottom:4px double var(--accent);padding-block:24px 28px;display:grid;gap:12px;color:var(--muted);font-size:.93rem}
footer.colophon p{margin:0;max-width:72ch}
footer.colophon b{color:var(--text)}
[hidden]{display:none!important}
.sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
"""

PAGE_JS = r"""
(() => {
'use strict';
const data = JSON.parse(document.getElementById('page-data').textContent);
const S = data.sections, WPM = data.wpm, A = window.turkeyAnimation;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem('turkey-history-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('turkey-history-' + k, JSON.stringify(v)); } catch (e) {} }
};
const chapters = $$('.chapter'), tocLinks = $$('[data-toc]');
const totalWords = S.reduce((a, s) => a + s.words, 0);
const read = new Set(store.get('read', []));
let current = -1, follow = true, sceneNow = -1;

/* ---------- the scene panel ---------- */
const panel = $('#panel'), btnPlay = $('#btn-play'), btnSound = $('#btn-sound'), btnMode = $('#btn-mode'), btnHide = $('#btn-hide');
const sceneNowEl = $('#scene-now');
function showScene(k) {
  if (k === sceneNow || !A) return;
  sceneNow = k;
  if (follow) A.goTo(k);
  const c = A.chapters[k]; sceneNowEl.innerHTML = 'Scene <b>' + (c.eyebrow || 'Türkiye') + '</b>';
}
if (A) {
  btnPlay.addEventListener('click', () => { if (A.isPaused()) A.play(); else A.pause(); syncButtons(); });
  btnSound.addEventListener('click', () => { A.toggleSound(); syncButtons(); });
  btnMode.addEventListener('click', () => {
    follow = !follow;
    if (follow) { const k = sceneNow; sceneNow = -1; A.follow(k < 0 ? 0 : k); showScene(k < 0 ? 0 : k); } else { A.film(); A.seek(0); A.play(); }
    syncButtons();
  });
  btnHide.addEventListener('click', () => { const hide = !panel.classList.contains('collapsed'); panel.classList.toggle('collapsed', hide); A.setVisible(!hide); if (!hide) A.resize(); syncButtons(); store.set('hidden', hide); });
  if (store.get('hidden', false)) { panel.classList.add('collapsed'); A.setVisible(false); }
}
function syncButtons() {
  if (!A) return;
  btnPlay.textContent = A.isPaused() ? 'Play' : 'Pause';
  btnSound.setAttribute('aria-pressed', A.soundOn()); btnSound.textContent = A.soundOn() ? 'Sound on' : 'Sound off';
  btnMode.textContent = follow ? 'Play the whole film' : 'Follow the text';
  const hidden = panel.classList.contains('collapsed'); btnHide.textContent = hidden ? 'Show scenes' : 'Hide scenes'; btnHide.setAttribute('aria-expanded', !hidden);
}
syncButtons();

/* ---------- reading position, progress, read marks ---------- */
function markRead(id) { if (read.has(id)) return; read.add(id); store.set('read', [...read]); paintToc(); }
function paintToc() { tocLinks.forEach(a => { const id = a.dataset.toc; a.classList.toggle('read', read.has(id)); a.classList.toggle('active', current >= 0 && S[current].id === id); }); }
function onScroll() {
  const vh = innerHeight, probe = vh * .38;
  let idx = -1;
  chapters.forEach((c, i) => { if (c.getBoundingClientRect().top <= probe) idx = i; });
  let wordsDone = 0, frac = 0;
  if (idx >= 0) {
    const r = chapters[idx].getBoundingClientRect();
    frac = Math.min(1, Math.max(0, (probe - r.top) / Math.max(1, r.height)));
    for (let i = 0; i < idx; i++) wordsDone += S[i].words;
    wordsDone += S[idx].words * frac;
    if (r.bottom < vh * .75) markRead(S[idx].id);
  }
  if (idx !== current) { current = idx; paintToc(); drawTimelines(); if (idx >= 0) store.set('last', S[idx].id); }
  // the scene: the section's own, or a paragraph that asks for another one
  if (idx >= 0) {
    let k = +chapters[idx].dataset.scene;
    chapters[idx].querySelectorAll('[data-scene]').forEach(p => { if (p.getBoundingClientRect().top <= vh * .5) k = +p.dataset.scene; });
    showScene(k);
  } else showScene(0);
  const pct = wordsDone / totalWords, left = Math.max(0, Math.round((totalWords - wordsDone) / WPM));
  $('#progress i').style.width = (pct * 100).toFixed(2) + '%';
  $('#readout-done').textContent = Math.round(pct * 100) + '% read';
  $('#readout-left').textContent = left + ' min left';
}
let ticking = false;
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; onScroll(); }); } }, { passive: true });
addEventListener('resize', onScroll);

/* ---------- continue where you left off ---------- */
const last = store.get('last', null), cont = $('#continue');
if (last && last !== S[0].id) { const s = S.find(x => x.id === last); if (s) { cont.hidden = false; cont.href = '#' + s.id; cont.textContent = 'Continue with “' + s.title + '”'; } }

/* ---------- the timeline: a compressed scale of years before today ---------- */
// x = 1 − (years ago / 12,000)^0.35: the deep past is squeezed, recent centuries get more room,
// and each era ends up with about as much width as the text gives it.
const NOW = 2026, POW = .35;
const xOf = (y, w) => (1 - Math.pow(Math.max(1, NOW - y) / 12000, POW)) * w;
const TICKS = [-9000, -3000, 1, 1000, 1500, 1900, 2000];
const tickLabel = y => y < 0 ? (-y) + ' BCE' : y === 1 ? '1 CE' : String(y);
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const timelines = $$('.tl');
function drawTimelines() {
  timelines.forEach(box => {
    const svg = box.querySelector('svg'), W = 1000, H = 118, y0 = 50;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = '';
    el('line', { x1: 0, x2: W, y1: y0, y2: y0, stroke: '#2a2f39', 'stroke-width': 2 }, svg);
    TICKS.forEach((y, j) => { const x = xOf(y, W); el('line', { x1: x, x2: x, y1: y0 + 8, y2: y0 + 16, stroke: '#9aa3b1', 'stroke-width': 1.5 }, svg); const t = el('text', { x, y: y0 + 42, 'text-anchor': j === 0 ? 'start' : 'middle', fill: '#9aa3b1', 'font-size': 22, 'font-family': 'system-ui,sans-serif' }, svg); t.textContent = tickLabel(y); });
    const hits = [];
    S.forEach((s, i) => {
      const on = i === current;
      if (s.bar) { const a = xOf(s.bar[0], W), b = xOf(s.bar[1], W); el('rect', { x: a, y: 22, width: Math.max(6, b - a), height: 14, rx: 4, fill: on ? '#d9a441' : '#2f3540' }, svg); }
      s.timeline.forEach(ev => { const x = xOf(ev.year, W); hits.push({ x, ev, i }); });
    });
    hits.sort((a, b) => (a.i === current) - (b.i === current));
    hits.forEach(h => { const on = h.i === current; el('circle', { cx: h.x, cy: y0, r: on ? 6 : 4.5, fill: on ? '#d9a441' : '#6c7584', stroke: '#181b21', 'stroke-width': 2 }, svg); });
    const cap = box.querySelector('.tl-note');
    if (cap) cap.textContent = (current >= 0 ? 'Highlighted: ' + S[current].title + ' (' + S[current].dates + '). ' : 'Each dot is an event from the text; select one to jump to its section. ') + 'The scale compresses the deep past, so recent centuries get more room.';
    box._hits = hits;
  });
}
timelines.forEach(box => {
  const tip = box.querySelector('.tl-tip'), svg = box.querySelector('svg');
  const nearest = e => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 1000; let best = null, d = 1e9; for (const h of box._hits || []) { const dd = Math.abs(h.x - x); if (dd < d) { d = dd; best = h; } } return d < 18 ? { h: best, r } : null; };
  svg.addEventListener('pointermove', e => { const n = nearest(e); if (!n) { tip.hidden = true; return; } const ev = n.h.ev; tip.hidden = false; tip.innerHTML = '<b>' + (ev.year < 0 ? (-ev.year) + ' BCE' : ev.year) + '</b> ' + ev.label + '<br><span class="muted">' + S[n.h.i].title + '</span>'; tip.style.left = (n.h.x / 1000 * n.r.width) + 'px'; tip.style.top = (50 / 118 * n.r.height - 10) + 'px'; });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
  svg.addEventListener('click', e => { const n = nearest(e); if (n) document.getElementById(S[n.h.i].id).scrollIntoView(); });
});

/* ---------- quizzes ---------- */
const answers = store.get('quiz', {}); // section id -> the option picked
function score() {
  const qs = $$('.quiz'), done = qs.filter(q => q.dataset.quiz in answers), right = done.filter(q => answers[q.dataset.quiz] === +q.dataset.answer);
  $('#quiz-score').textContent = done.length ? `${right.length} of ${done.length} answered correctly (${qs.length} questions in all)` : 'no questions answered yet';
}
$$('.quiz').forEach(q => {
  const ans = +q.dataset.answer, id = q.dataset.quiz, btns = [...q.querySelectorAll('button')], ex = q.querySelector('.quiz-explain');
  const reveal = pick => {
    btns.forEach((b, j) => { b.disabled = true; if (j === ans) b.classList.add('right'); else if (j === pick) b.classList.add('wrong'); });
    ex.hidden = false; ex.innerHTML = (pick === ans ? '<b>Correct.</b> ' : '<b>The answer is: ' + btns[ans].textContent.replace(/[<>&]/g, '') + '.</b> ') + ex.dataset.text;
  };
  ex.dataset.text = ex.textContent;
  btns.forEach((b, j) => b.addEventListener('click', () => { answers[id] = j; store.set('quiz', answers); reveal(j); score(); }));
  if (typeof answers[id] === 'number') reveal(answers[id]);
});
score();

/* ---------- the atlas ---------- */
const MAP = window.TURKEY_MAP, svgA = $('#atlas-svg');
if (MAP && svgA) {
  const proj = (lon, lat) => [(lon - 25.9) * Math.cos(39 * Math.PI / 180) / 14.77 * 960 + 20, (42.4 - lat) / 14.77 * 960 + 10];
  for (const poly of [MAP.asia, MAP.europe]) el('path', { d: 'M' + poly.map(p => proj(p[0], p[1]).map(v => v.toFixed(1)).join(',')).join('L') + 'Z', fill: '#1f232b', stroke: '#9aa3b1', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, svgA);
  const places = [];
  S.forEach((s, i) => s.places.forEach(p => places.push({ ...p, i, era: s.era })));
  const seen = {};
  places.forEach(p => { const key = p.lat.toFixed(1) + ',' + p.lon.toFixed(1), n = seen[key] = (seen[key] || 0) + 1; const [x, y] = proj(p.lon, p.lat); const a = n * 2.4; p.x = x + (n > 1 ? Math.cos(a) * 9 * Math.sqrt(n) : 0); p.y = y + (n > 1 ? Math.sin(a) * 9 * Math.sqrt(n) : 0); });
  let era = 'all', sel = null;
  const card = $('#atlas-card'), list = $('#atlas-list'), chips = $('#atlas-filters');
  const escH = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function select(p) {
    sel = p; draw();
    card.innerHTML = '<h3>' + escH(p.name) + '</h3><p>' + escH(p.note) + '</p>' + (p.visit ? '<p class="muted">Visiting: ' + escH(p.visit) + '</p>' : '') + '<p><a href="#' + S[p.i].id + '">Read: ' + escH(S[p.i].title) + '</a></p>';
  }
  function draw() {
    svgA.querySelectorAll('.pin').forEach(n => n.remove());
    list.innerHTML = '';
    const shown = places.filter(p => era === 'all' || p.era === era);
    shown.forEach(p => {
      const on = p === sel, g = el('g', { class: 'pin', tabindex: -1 }, svgA);
      el('circle', { cx: p.x, cy: p.y, r: 16, fill: 'transparent' }, g);
      el('circle', { cx: p.x, cy: p.y, r: on ? 8 : 6, fill: on ? '#d9a441' : '#56b6c2', stroke: '#181b21', 'stroke-width': 2 }, g);
      const t = el('title', {}, g); t.textContent = p.name;
      g.addEventListener('click', () => select(p));
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = p.name; b.setAttribute('aria-pressed', on); b.addEventListener('click', () => select(p));
      li.appendChild(b); list.appendChild(li);
    });
    if (sel) { const g = [...svgA.querySelectorAll('.pin')].find((n, j) => shown[j] === sel); if (g) svgA.appendChild(g); }
  }
  const eras = [{ key: 'all', label: 'All sites' }, ...data.eras];
  eras.forEach(e => { const b = document.createElement('button'); b.type = 'button'; b.textContent = e.label; b.setAttribute('aria-pressed', e.key === era); b.addEventListener('click', () => { era = e.key; chips.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); if (sel && era !== 'all' && sel.era !== era) { sel = null; card.innerHTML = '<p class="muted">Select a site on the map or in the list below.</p>'; } draw(); }); chips.appendChild(b); });
  draw();
}

paintToc(); drawTimelines(); onScroll();
})();
"""


def page(total_words, total_min, toc, body, page_data, map_data, engine_tag):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>The Story of Türkiye</title>
<meta name="description" content="A long read on the history of Türkiye, from Göbekli Tepe to today, with animated scenes, a timeline, a map of the sites and sources for every section.">
<style>{CSS}</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><g id="star8"><rect x="-6" y="-6" width="12" height="12" fill="#d9a441"/><rect x="-6" y="-6" width="12" height="12" fill="#d9a441" transform="rotate(45)"/><circle r="3.4" fill="#56b6c2"/></g></defs></svg>
<div class="progress" id="progress" aria-hidden="true"><i></i></div>
<div class="wrap">
  <header class="masthead">
    <div class="kicker">A long read · 11,600 years · {len(page_data['sections'])} sections</div>
    <h1>The Story of Türkiye</h1>
    <p class="lede">From the first temples at Göbekli Tepe to the Republic and the country today. The animated scenes follow your reading, and every section ends with its sources.</p>
    <div class="meta"><span><b>{total_min}</b> minutes to read</span><span><b>{total_words:,}</b> words</span><span>Sound is optional: the score is played live in your browser</span></div>
    <div class="actions"><a class="btn primary" href="#{page_data['sections'][0]['id']}">Start reading</a><a class="btn" id="continue" href="#" hidden>Continue</a></div>
  </header>
  <div class="layout">
    <aside class="panel" id="panel" aria-label="Animated scenes">
      <div class="card">
        <div class="scene-wrap"><canvas id="scene" role="img" aria-label="An animated scene for the section you are reading"></canvas></div>
        <div class="scene-bar">
          <span class="scene-now" id="scene-now">Scene</span>
          <button type="button" id="btn-play">Pause</button>
          <button type="button" id="btn-sound" aria-pressed="false">Sound off</button>
          <button type="button" id="btn-mode">Play the whole film</button>
          <button type="button" id="btn-hide" aria-expanded="true">Hide scenes</button>
        </div>
        <div class="readout"><span id="readout-done">0% read</span><span class="rt" id="readout-left">{total_min} min left</span></div>
        <div class="tl tl-panel"><svg role="img" aria-label="Timeline of the events in this long read, on a scale of years before today"></svg><div class="tl-tip" hidden></div><p class="tl-note"></p></div>
      </div>
    </aside>
    <main class="article">
      <div class="intro-grid">
        <nav class="card" aria-label="Contents"><div class="kicker">Contents</div><ol class="toc">{toc}</ol></nav>
        <div class="card tl tl-flow"><div class="kicker">Timeline</div><svg role="img" aria-label="Timeline of the events in this long read, on a scale of years before today"></svg><div class="tl-tip" hidden></div><p class="tl-note"></p></div>
      </div>
      {body}
      <footer class="colophon">
        <div class="kicker">About this long read</div>
        <p><b>Your quiz score:</b> <span id="quiz-score"></span>. Your answers, the sections you have finished and your place in the text are kept in this browser only.</p>
        <p>The scenes and the music come from the animation <b>Türkiye Through Time</b>, which is drawn and composed entirely in code. Press <b>Play the whole film</b> to watch it from the start.</p>
        <p>Every section lists its sources. Most were found with web searches; where the search allowance ran out, the text was written from facts already checked and from peer-reviewed papers found with the <a href="https://consensus.app/" target="_blank" rel="noopener">Consensus</a> academic search engine, which are linked individually. Where sources disagree on a date or a number, the text says so. Reading times count the main text at {WPM} words a minute.</p>
      </footer>
    </main>
  </div>
</div>
<script id="page-data" type="application/json">{json.dumps(page_data, ensure_ascii=False)}</script>
<script>window.TURKEY_MAP = {json.dumps(map_data)};
window.TURKEY_OPTIONS = {{ embedded: true, canvas: document.getElementById('scene'), focus: 0, startPaused: matchMedia('(prefers-reduced-motion: reduce)').matches }};</script>
{engine_tag}
<script>{PAGE_JS}</script>
</body>
</html>
"""


def main():
    content = json.loads((ROOT / "content" / "history.json").read_text())
    sections = content["sections"]
    total_words, total_min, toc, body, page_data = build(sections)
    engine = (ROOT / "turkey-animation.js").read_text()
    asia = json.loads(re.search(r"const MAP_ASIA = (\[.*?\]);", engine, re.S).group(1))
    europe = json.loads(re.search(r"const MAP_EUROPE = (\[.*?\]);", engine, re.S).group(1))
    map_data = {"asia": asia, "europe": europe}
    out = page(total_words, total_min, toc, body, page_data, map_data, '<script src="turkey-animation.js"></script>')
    (ROOT / "history.html").write_text(out)
    print(f"history.html: {total_words} words, about {total_min} minutes, {len(sections)} sections")
    if "--artifact" in sys.argv:
        dest = pathlib.Path(sys.argv[sys.argv.index("--artifact") + 1])
        art = page(total_words, total_min, toc, body, page_data, map_data, "<script>\n" + engine + "\n</script>")
        for tag in ('<!doctype html>\n', '<html lang="en">\n', '<head>\n', '</head>\n', '<body>\n', '</body>\n', '</html>\n',
                    '<meta charset="utf-8">\n', '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'):
            art = art.replace(tag, "", 1)
        dest.write_text(art)
        print(f"artifact copy: {dest}")


if __name__ == "__main__":
    main()
