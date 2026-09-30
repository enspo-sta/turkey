# Fills the performance table in graphics-report.json from the perf runs.
# Usage: python3 tools/report/fill-perf.py <perf-high.txt> <perf-medium.txt>
import json, re, sys
base = {}
for line in open('tools/out/perf-baseline.txt'):
    m = re.match(r'(\w+): calls (\d+), triangles (\d+)', line)
    if m: base[m.group(1)] = (int(m.group(2)), int(m.group(3)))
def parse(path):
    out = {}
    txt = open(path, encoding='utf-8', errors='ignore').read()
    for m in re.finditer(r'(\w+): calls (\d+), triangles (\d+), frame', txt):
        out[m.group(1)] = (int(m.group(2)), int(m.group(3)))
    return out
high = parse(sys.argv[1]); med = parse(sys.argv[2])
names = {'landing': 'Hotrod Landing', 'bend': 'Salmon Bend', 'falls': 'Bear Falls', 'glacier': 'Glacier Lake', 'moose': 'Moose Lake', 'pier': 'Halibut Pier', 'tundra': 'Caribou Tundra', 'forest': 'Deep forest'}
fmt = lambda n: f'{n:,}'.replace(',', ' ')
rows = ''
for k, label in names.items():
    b = base.get(k); h = high.get(k); m = med.get(k)
    if not (b and h and m): raise SystemExit('missing ' + k)
    rows += f'<tr><td>{label}</td><td class="n">{b[0]}</td><td class="n">{fmt(b[1])}</td><td class="n">{h[0]}</td><td class="n">{fmt(h[1])}</td><td class="n">{m[0]}</td><td class="n">{fmt(m[1])}</td></tr>'
p = 'tools/report/graphics-report.json'
d = json.load(open(p))
for s in d['sections']:
    if s['id'] == 'performance':
        s['html'] = s['html'].replace('<!--ROWS-->', rows)
json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False)
print('filled', len(names), 'rows')
