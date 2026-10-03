// Builds docs/graphics-update.html: a self-contained dark report of the
// graphics update with downscaled screenshots embedded as data URLs.
// Usage: node tools/report/make-graphics-report.cjs [data.json] [out.html]
// (by default graphics-report.json into docs/graphics-update.html)
const fs = require('fs');
const path = require('path');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'tools/out');
const data = JSON.parse(fs.readFileSync(path.resolve(process.argv[2] || path.join(__dirname, 'graphics-report.json')), 'utf8'));
const destFile = path.resolve(process.argv[3] || path.join(root, 'docs/graphics-update.html'));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shrink = async (file, w = 720) => {
    const buf = fs.readFileSync(path.join(out, file));
    const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return page.evaluate(
      async ({ src, w }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const h = Math.round((img.height / img.width) * w);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, w, h);
        return c.toDataURL('image/jpeg', 0.78);
      },
      { src: `data:${mime};base64,${buf.toString('base64')}`, w }
    );
  };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fig = async (f) => `<figure><img src="${await shrink(f.file, f.w || 720)}" alt="${esc(f.caption)}" loading="lazy"><figcaption>${esc(f.caption)}</figcaption></figure>`;

  let sections = '';
  for (const sec of data.sections) {
    let body = sec.html || '';
    if (sec.pairs) {
      for (const p of sec.pairs) {
        body += `<div class="pair"><div><span class="tag before">Before</span>${await fig(p.before)}</div><div><span class="tag after">After</span>${await fig(p.after)}</div></div>`;
      }
    }
    if (sec.figs) {
      body += '<div class="grid">';
      for (const f of sec.figs) body += await fig(f);
      body += '</div>';
    }
    // recordings to listen to: MP3 or WAV files from tools/out, embedded
    if (sec.audio) {
      body += '<div class="sounds">';
      for (const a of sec.audio) {
        const b64 = fs.readFileSync(path.join(out, a.file)).toString('base64');
        const mime = a.file.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';
        body += `<figure class="sound"><figcaption><b>${esc(a.title)}</b> ${esc(a.caption || '')}</figcaption><audio controls preload="none" src="data:${mime};base64,${b64}"></audio></figure>`;
      }
      body += '</div>';
    }
    if (sec.after) body += sec.after;
    sections += `<section class="card ${sec.cls || ""}" id="${sec.id}"><div class="kicker">${esc(sec.kicker)}</div><h2>${esc(sec.title)}</h2>${body}</section>\n`;
  }
  await browser.close();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(data.title)}</title>
<style>
:root{color-scheme:dark;--bg:#101216;--surface:#181b21;--surface2:#1f232b;--border:#2a2f39;--text:#e7eaf0;--muted:#9aa3b1;--accent:#d9a441;--accent2:#56b6c2;--danger:#e06c75;--ok:#98c379}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text)}
body{font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding:28px 16px 56px}
header{margin-bottom:22px}
.kicker{text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:700;color:var(--accent2);margin-bottom:6px}
h1{font-size:30px;line-height:1.2;margin:0 0 10px}
h2{font-size:22px;line-height:1.25;margin:0 0 12px}
h3{font-size:17px;margin:18px 0 8px}
p,li{max-width:72ch}
.lede{color:var(--text);font-size:18px;margin:0 0 12px}
.links{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0 0}
.links a{display:inline-block;padding:8px 14px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);color:var(--accent2);text-decoration:none;font-weight:600}
a{color:var(--accent2)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:20px;margin:0 0 18px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin-top:12px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}
@media (max-width:700px){.pair{grid-template-columns:1fr}}
figure{margin:0;background:var(--surface2);border:1px solid var(--border);border-radius:8px;overflow:hidden}
figure img{display:block;width:100%;height:auto}
figcaption{padding:8px 10px;font-size:14px;color:var(--muted)}
.sounds{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:12px}
figure.sound{padding:0 0 10px}
figure.sound figcaption b{color:var(--text)}
figure.sound audio{display:block;width:calc(100% - 20px);margin:0 10px}
.tag{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 6px;padding:2px 8px;border-radius:6px}
.tag.before{background:#2a2f39;color:var(--muted)}
.tag.after{background:#1d3a2a;color:var(--ok)}
.tablewrap{overflow-x:auto;margin-top:10px}
table{border-collapse:collapse;width:100%;min-width:560px;font-size:15px}
th,td{border-bottom:1px solid var(--border);padding:8px 10px;text-align:left}
th{color:var(--muted);font-weight:600}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
table.text{min-width:0}
td code{overflow-wrap:anywhere}
@media (max-width:640px){table.text,table.text tbody,table.text tr,table.text td{display:block;width:auto}table.text thead{display:none}table.text tr{border-bottom:1px solid var(--border);padding:10px 0}table.text td{border:0;padding:2px 0;text-align:left}table.text td:first-child{font-weight:700}table.text td[data-label]::before{content:attr(data-label);display:block;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600}}
.muted{color:var(--muted)}
.note{color:var(--muted);font-size:14px;margin:6px 0 0}
code{font-family:ui-monospace,Menlo,monospace;background:var(--surface2);padding:1px 5px;border-radius:5px;font-size:14px}
ul{padding-left:20px}
.conclusion{border-color:#3a3322}
.conclusion .kicker{color:var(--accent)}
footer{color:var(--muted);font-size:14px;border-top:1px solid var(--border);padding-top:14px;margin-top:24px}
footer a{word-break:break-all}
</style>
</head>
<body><div class="wrap">
<header>
<div class="kicker">${esc(data.kicker)}</div>
<h1>${esc(data.title)}</h1>
<p class="lede">${data.lede}</p>
<div class="links">${data.links.map((l) => `<a href="${l.href}">${esc(l.label)}</a>`).join('')}</div>
</header>
${sections}
<footer>${data.footer}</footer>
</div></body></html>
`;
  const dest = destFile;
  fs.writeFileSync(dest, html);
  console.log('wrote', dest, Math.round(html.length / 1024), 'KB');
})();
