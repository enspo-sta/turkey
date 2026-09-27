"""Illustrations and maps for the long read, drawn as inline SVG.

Every picture is drawn in code, like the animation: there are no photographs
or image files. Each figure is placed after the first paragraph of its section
that matches `anchor`, and its caption only repeats facts stated in that
section's text.
"""
import html
import math
import re

W = 800  # every figure is drawn in an 800-unit-wide view box


def esc(s):
    return html.escape(s, quote=True)


def svg(h, body, label):
    return (f'<svg viewBox="0 0 {W} {h}" role="img" aria-label="{esc(label)}" '
            f'xmlns="http://www.w3.org/2000/svg">{body}</svg>')


def text(x, y, s, cls="t", anchor="start", size=None):
    fs = f' font-size="{size}"' if size else ""
    return f'<text class="{cls}" x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}"{fs}>{esc(s)}</text>'


# ---------------------------------------------------------------- maps

class Map:
    """An equirectangular map of part of Türkiye, fitted to the figure width."""

    def __init__(self, outline, lon0, lon1, lat0, lat1, pad=24):
        self.lon0, self.lat1, self.pad = lon0, lat1, pad
        self.kx = math.cos(math.radians((lat0 + lat1) / 2))
        self.k = (W - 2 * pad) / ((lon1 - lon0) * self.kx)
        self.h = round((lat1 - lat0) * self.k + 2 * pad)
        self.outline = outline
        self.parts = []

    def xy(self, lat, lon):
        return (self.pad + (lon - self.lon0) * self.kx * self.k, self.pad + (self.lat1 - lat) * self.k)

    def land(self, europe_cls="land"):
        for key, cls in (("asia", "land"), ("europe", europe_cls)):
            pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in (self.xy(lat, lon) for lon, lat in self.outline[key]))
            self.parts.append(f'<polygon class="{cls}" points="{pts}"/>')

    def route(self, stops, cls="route", arrow=True):
        pts = [self.xy(la, lo) for la, lo in stops]
        d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        end = ' marker-end="url(#arr)"' if arrow else ""
        self.parts.append(f'<path class="{cls}" d="{d}"{end}/>')

    def dot(self, lat, lon, label, dx=10, dy=-10, anchor="start", cls="pt", sub=None, lead=False):
        x, y = self.xy(lat, lon)
        out = f'<circle class="{cls}" cx="{x:.1f}" cy="{y:.1f}" r="6.5"/>'
        tx, ty = x + dx, y + dy
        if lead:
            out += f'<line class="lead" x1="{x:.1f}" y1="{y:.1f}" x2="{tx - (4 if anchor == "start" else -4 if anchor == "end" else 0):.1f}" y2="{ty - 8:.1f}"/>'
        out += text(tx, ty, label, "t", anchor)
        if sub:
            out += text(tx, ty + 24, sub, "ts", anchor)
        self.parts.append(out)

    def label(self, lat, lon, s, cls="sea", anchor="middle", size=None):
        x, y = self.xy(lat, lon)
        self.parts.append(text(x, y, s, cls, anchor, size))

    _n = 0

    def render(self, label):
        Map._n += 1
        mid = f"arr{Map._n}"
        self.parts = [x.replace("url(#arr)", f"url(#{mid})") for x in self.parts]
        defs = (f'<defs><marker id="{mid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
                '<path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker></defs>')
        return svg(self.h, defs + f'<rect class="water" width="{W}" height="{self.h}"/>' + "".join(self.parts), label)


def map_land(o):
    m = Map(o, 25.6, 45.0, 35.7, 42.3)
    m.land("land-eu")
    m.label(42.0, 35.6, "Black Sea")
    m.label(35.95, 31.5, "Mediterranean Sea")
    m.label(37.4, 25.75, "Aegean", anchor="start", size=22)
    m.dot(41.01, 28.98, "Istanbul", 12, 24, "start")
    m.dot(39.93, 32.86, "Ankara", 12, -10)
    m.dot(39.70, 44.30, "Mount Ararat", -12, -30, "end", cls="pt2", sub="5,137 m")
    m.label(38.1, 42.9, "Lake Van", cls="ts")
    m.label(42.12, 25.75, "Europe: Eastern Thrace, about 3%", cls="ts", anchor="start")
    m.label(38.9, 35.8, "Asia: Anatolia", cls="big")
    m.label(38.45, 35.8, "about 97% of the land", cls="ts")
    x, y = m.xy(40.2, 26.35)
    m.parts.append(f'<line class="lead" x1="{x:.1f}" y1="{y:.1f}" x2="{x - 6:.1f}" y2="{y + 50:.1f}"/>' + text(x - 20, y + 72, "Dardanelles", "ts", "start"))
    x, y = m.xy(41.1, 29.06)
    m.parts.append(f'<line class="lead" x1="{x:.1f}" y1="{y:.1f}" x2="{x + 26:.1f}" y2="{y - 4:.1f}"/>' + text(x + 30, y + 2, "Bosphorus", "ts", "start"))
    return m.render("Map of Türkiye showing the European part, Eastern Thrace, and the Asian part, Anatolia, divided by the Bosphorus, the Sea of Marmara and the Dardanelles")

def map_alexander(o):
    m = Map(o, 25.6, 37.4, 35.9, 41.4)
    m.land("land")
    stops = [(40.15, 26.4), (40.2, 27.25), (39.65, 31.98), (37.3, 34.75), (36.92, 34.9), (36.77, 36.21)]
    m.route(stops)
    m.dot(40.15, 26.4, "Crosses the Hellespont", 0, 56, "start", sub="spring 334 BCE")
    m.dot(40.2, 27.25, "Granicus, May 334 BCE", 0, -18, "start")
    m.dot(39.65, 31.98, "Gordium", 0, -18, "middle", sub=None)
    m.label(39.2, 31.98, "333 BCE, the Gordian knot", cls="ts")
    m.dot(37.3, 34.75, "Cilician Gates", -12, -14, "end")
    m.dot(36.92, 34.9, "Tarsus", -10, 30, "end")
    m.dot(36.77, 36.21, "Issus", -8, 34, "middle", cls="pt2", sub="333 BCE")
    m.label(41.1, 33.5, "Black Sea")
    m.label(36.2, 30.2, "Mediterranean Sea")
    return m.render("Map of Alexander's route through Anatolia in 334 and 333 BCE, from the Hellespont by the Granicus and Gordium to the Cilician Gates, Tarsus and Issus")

def map_paul(o):
    m = Map(o, 25.9, 35.4, 36.4, 41.4)
    m.land("land")
    m.route([(36.96, 30.85), (38.30, 31.19), (37.87, 32.49), (37.58, 32.45), (37.35, 33.27)])
    m.dot(36.96, 30.85, "Perga", 0, 32, "middle")
    m.dot(38.30, 31.19, "Antioch in Pisidia", 10, -16, "start")
    m.dot(37.87, 32.49, "Iconium (Konya)", 12, 4)
    m.dot(37.58, 32.45, "Lystra", -12, 8, "end")
    m.dot(37.35, 33.27, "Derbe", 10, 26)
    m.dot(36.92, 34.89, "Tarsus", 0, 32, "middle", sub=None)
    for la, lo, name, dx, dy, an in [(39.13, 27.18, "Pergamum", 12, -10, "start"), (38.92, 27.84, "Thyatira", 12, -2, "start"),
                                     (38.42, 27.14, "Smyrna", -12, 6, "end"), (38.49, 28.04, "Sardis", 12, 6, "start"),
                                     (38.35, 28.52, "Philadelphia", 12, 26, "start"), (37.94, 27.34, "Ephesus", -12, 10, "end"),
                                     (37.84, 29.11, "Laodicea", 10, 26, "start")]:
        m.dot(la, lo, name, dx, dy, an, cls="pt2")
    m.dot(40.43, 29.72, "Nicaea, council of 325", 12, 26, "start", cls="star")
    m.dot(40.99, 29.03, "Chalcedon, council of 451", 12, -12, "start", cls="star")
    m.parts.append('<g class="key">' + '<circle class="pt" cx="600" cy="200" r="6.5"/>' + text(614, 207, "Paul's first journey", "ts")
                   + '<circle class="pt2" cx="600" cy="230" r="6.5"/>' + text(614, 237, "Seven churches", "ts")
                   + '<circle class="star" cx="600" cy="260" r="6.5"/>' + text(614, 267, "Church councils", "ts") + '</g>')
    return m.render("Map of western and southern Anatolia showing Paul's first journey from Perga to Derbe, the seven churches of Revelation, and Nicaea and Chalcedon")

def map_ottoman(o):
    m = Map(o, 25.6, 33.6, 39.3, 42.4)
    m.land("land")
    m.route([(40.02, 30.18), (40.19, 29.06), (40.41, 26.67), (41.68, 26.56)], cls="route")
    m.dot(40.02, 30.18, "Söğüt", 0, 34, "middle", sub="Osman's base")
    m.dot(40.19, 29.06, "Bursa", -12, 30, "end", sub="1326")
    m.dot(40.43, 29.72, "İznik, 1331", 10, -14, "start")
    m.dot(40.41, 26.67, "Gallipoli", -12, 30, "end", sub="1354")
    m.dot(41.68, 26.56, "Edirne", 12, -4, "start", sub="1361 or 1362")
    m.dot(41.01, 28.98, "Constantinople, 29 May 1453", 10, -16, "start", cls="star")
    m.dot(39.93, 32.86, "Ankara", -10, -14, "end", cls="pt2")
    m.label(40.25, 33.5, "Timur defeats Bayezid, 1402", cls="ts", anchor="end")
    x, y = m.xy(42.0, 26.9)
    m.parts.append(f'<path class="route" d="M{x:.1f},{y:.1f} L{x - 10:.1f},{y - 44:.1f}" marker-end="url(#arr)"/>'
                   + text(x + 6, y - 44, "To the Balkans: Kosovo 1389,", "ts") + text(x + 6, y - 20, "Nicopolis 1396, Varna 1444", "ts"))
    m.label(42.15, 31.6, "Black Sea")
    return m.render("Map of north-western Anatolia and Thrace showing the early Ottoman advance from Söğüt to Bursa, Gallipoli and Edirne, the battle of Ankara in 1402 and Constantinople in 1453")

def map_independence(o):
    m = Map(o, 25.6, 45.0, 35.7, 42.3)
    m.land("land")
    m.route([(38.42, 27.2), (39.35, 30.2), (39.55, 31.85)], cls="route2")
    m.route([(38.85, 29.98), (38.45, 27.35)], cls="route")
    events = [(41.29, 36.33, "Samsun: landing, 19 May 1919"), (39.90, 41.27, "Erzurum: congress, 1919"),
              (39.75, 37.02, "Sivas: congress, 1919"), (39.93, 32.86, "Ankara: assembly, April 1920"),
              (40.60, 43.10, "Kars: treaty, 1921"), (39.82, 30.15, "İnönü: battles, 1921"),
              (37.00, 35.32, "Adana: French leave, 1921"), (39.55, 31.85, "Sakarya: battle, 1921"),
              (38.85, 29.98, "Dumlupınar: 30 August 1922"), (38.42, 27.14, "İzmir: 9 September 1922"),
              (40.38, 28.88, "Mudanya: armistice, 1922")]
    mh = m.h
    rows = (len(events) + 1) // 2
    for i, (la, lo, s) in enumerate(events):
        x, y = m.xy(la, lo)
        m.parts.append(f'<circle class="num" cx="{x:.1f}" cy="{y:.1f}" r="13"/>' + text(x, y + 6, str(i + 1), "numt", "middle"))
        col, row = divmod(i, rows)
        lx, ly = 30 + col * 390, mh + 26 + row * 32
        m.parts.append(f'<circle class="num" cx="{lx + 12}" cy="{ly - 6}" r="12"/>' + text(lx + 12, ly, str(i + 1), "numt", "middle") + text(lx + 34, ly, s, "ts"))
    ky = mh + 26 + rows * 32 + 10
    m.parts.append(f'<path class="route2" d="M30,{ky} h50" marker-end="url(#arr)"/>' + text(92, ky + 7, "Greek advance, 1921", "ts")
                   + f'<path class="route" d="M420,{ky} h50" marker-end="url(#arr)"/>' + text(482, ky + 7, "Great Offensive, 1922", "ts"))
    m.h = ky + 30
    return m.render("Map of the War of Independence, 1919 to 1922, with numbered places in order: Samsun, Erzurum, Sivas, Ankara, Kars, İnönü, Adana, Sakarya, Dumlupınar, İzmir and Mudanya")

def fig_pillars():
    # three T-shaped pillars; the tallest is 5.5 m, a 1.7 m person gives the scale
    g = ['<rect class="water" width="800" height="520"/>',
         '<path class="stonewall" d="M20,470 Q400,330 780,470 L780,500 L20,500 Z"/>',
         '<line class="ground" x1="20" y1="470" x2="780" y2="470"/>']
    # central pillar: 5.5 m = 380 px
    g.append('<path class="stone" d="M350,470 L350,160 L262,160 Q250,160 250,148 L250,104 Q250,90 264,90 L536,90 Q550,90 550,104 L550,148 Q550,160 538,160 L450,160 L450,470 Z"/>')
    # arms carved down the sides, hands meeting above the belt
    g.append('<path class="relief" d="M356,190 Q352,300 372,352 Q392,364 400,356 M444,190 Q448,300 428,352 Q408,364 400,356"/>')
    g.append('<path class="relief" d="M390,352 l-3,10 m9,-8 l-1,11 m9,-12 l2,11"/>')
    g.append('<rect class="relief" x="352" y="372" width="96" height="16" rx="3"/>')
    g.append('<path class="relief" d="M380,388 Q378,420 392,446 L408,446 Q422,420 420,388"/>')  # loincloth
    # fox leaping on the upper shaft
    g.append('<path class="reliefA" d="M368,236 q16,-18 40,-14 l14,-12 l2,12 q10,2 12,10 l-10,4 q-8,12 -26,12 l-10,16 m6,-18 l-18,12 m-2,-18 q-14,6 -22,-4"/>')
    # left pillar with a boar
    g.append('<path class="stone2" d="M120,470 L120,236 L66,236 Q58,236 58,228 L58,200 Q58,192 66,192 L230,192 Q238,192 238,200 L238,228 Q238,236 230,236 L176,236 L176,470 Z"/>')
    g.append('<path class="reliefA" d="M128,300 q10,-20 34,-16 l8,-8 l2,10 q6,6 4,14 l-6,2 q-4,10 -18,12 l0,14 m-12,-14 l-2,14 m-10,-22 q-8,0 -12,-6"/>')
    g.append('<path class="reliefA" d="M130,360 q14,-10 8,-22 q-8,-12 6,-20 M170,370 q-14,-10 -8,-22 q8,-12 -6,-20"/>')  # snakes
    # right pillar with a vulture and a scorpion
    g.append('<path class="stone2" d="M626,470 L626,236 L572,236 Q564,236 564,228 L564,200 Q564,192 572,192 L736,192 Q744,192 744,200 L744,228 Q744,236 736,236 L682,236 L682,470 Z"/>')
    g.append('<path class="reliefA" d="M636,286 q10,-12 22,-10 q12,-12 22,-4 l-8,6 q-4,14 -16,16 l-8,22 m-6,-22 l-12,10 m24,-26 l4,-8"/>')
    g.append('<path class="reliefA" d="M640,380 q14,-6 26,0 m-13,-3 l0,24 m-13,-14 l-8,-6 m34,6 l8,-6 m-21,14 q10,12 0,22 l-6,-4"/>')
    # person for scale, 1.7 m = 117 px
    g.append('<path class="person" d="M506,470 l8,-50 l-10,-34 q0,-12 12,-14 l16,0 q12,2 12,14 l-10,34 l8,50 z"/><circle class="person" cx="524" cy="358" r="12"/>')
    g.append(text(540, 470 - 60, "1.7 m", "ts") + text(560, 130, "up to 5.5 m", "ts"))
    g.append('<line class="lead" x1="556" y1="92" x2="556" y2="468"/>')
    g.append(text(400, 505, "fox", "tsA", "middle"))
    g.append(text(148, 505, "boar and snakes", "tsA", "middle") + text(654, 505, "vulture and scorpion", "tsA", "middle"))
    return svg(520, "".join(g), "Drawing of three T-shaped stone pillars with carved arms, a belt and animals, beside a person for scale")


def fig_catalhoyuk():
    g = ['<rect class="water" width="800" height="440"/>',
         '<path class="mound" d="M0,440 L0,330 Q400,300 800,330 L800,440 Z"/>']
    houses = [(40, 150, 190), (150, 125, 210), (270, 140, 180), (380, 120, 200), (500, 150, 170), (610, 130, 200), (720, 60, 220)]
    for i, (x, w, top) in enumerate(houses):
        g.append(f'<rect class="house" x="{x}" y="{top}" width="{w}" height="{330 - top + 4}"/>')
        g.append(f'<rect class="hatch" x="{x + w / 2 - 14}" y="{top - 4}" width="28" height="8"/>')
        g.append(f'<path class="ladder" d="M{x + w / 2 - 8},{top - 40} L{x + w / 2 - 8},{top + 30} M{x + w / 2 + 8},{top - 40} L{x + w / 2 + 8},{top + 30} '
                 + " ".join(f"M{x + w / 2 - 8},{top - 30 + 14 * k} h16" for k in range(5)) + '"/>')
    # cutaway of one house: platform, hearth, a wall painting and the ladder inside
    x, w, top = 380, 120, 200
    g.append(f'<rect class="inside" x="{x + 6}" y="{top + 8}" width="{w - 12}" height="{330 - top - 8}"/>')
    g.append(f'<rect class="platform" x="{x + 10}" y="300" width="44" height="30"/><path class="fire" d="M{x + 88},330 q-8,-16 4,-26 q2,12 10,6 q6,12 -2,20 z"/>')
    g.append(f'<path class="paint" d="M{x + 20},240 h26 l-6,10 h16 l-6,-10 h26 M{x + 30},262 l10,-10 l10,10 l10,-10 l10,10"/>')
    g.append(f'<path class="ladder" d="M{x + 52},{top} L{x + 70},330 M{x + 68},{top} L{x + 86},330 ' + " ".join(f"M{x + 55 + 2.6 * k},{top + 18 * k + 12} h16" for k in range(7)) + '"/>')
    # people on the roofs
    for px, top in [(118, 190), (320, 180), (668, 200)]:
        g.append(f'<path class="person" d="M{px},{top} l4,-26 l-5,-16 q0,-6 6,-7 l8,0 q6,1 6,7 l-5,16 l4,26 z"/><circle class="person" cx="{px + 9}" cy="{top - 54}" r="6"/>')
    g.append(text(120, 40, "Entrance through the roof", "t") + '<line class="lead" x1="240" y1="48" x2="210" y2="118"/>')
    g.append(text(470, 60, "Rooftops used as streets", "t", "start") + '<line class="lead" x1="520" y1="68" x2="330" y2="170"/>')
    g.append(text(780, 400, "Inside: platform, hearth, wall painting", "ts", "end") + '<line class="lead" x1="560" y1="384" x2="470" y2="320"/>')
    g.append(text(20, 420, "No streets: houses built back to back", "ts"))
    return svg(440, "".join(g), "Cutaway drawing of Çatalhöyük: flat-roofed houses built wall to wall, with ladders through roof openings and people walking on the roofs")


def fig_lions_gate():
    g = ['<rect class="water" width="800" height="460"/>',
         '<path class="stonewall" d="M0,150 L220,150 L220,430 L0,430 Z M580,150 L800,150 L800,430 L580,430 Z"/>']
    for y in range(170, 430, 42):
        g.append(f'<path class="joints" d="M0,{y} H220 M580,{y} H800"/>')
    # one mass of stone with a tall parabolic opening; lintel-less, as at Hattusa
    g.append('<path class="stone" d="M220,430 L228,110 Q400,60 572,110 L580,430 Z"/>')
    g.append('<path class="joints" d="M228,180 H572 M228,250 H330 M470,250 H572"/>')
    g.append('<path class="opening" d="M318,430 L318,300 Q326,150 400,118 Q474,150 482,300 L482,430 Z"/>')
    # lion foreparts projecting from the gateposts, facing outwards
    for side in (-1, 1):
        cx = 400 + side * 128
        g.append(f'<g transform="translate({cx},0) scale({side},1)">'
                 '<path class="lionmane" d="M-6,196 q30,-26 58,-4 q20,18 12,50 q-6,26 -30,34 q-30,6 -44,-20 q-10,-24 4,-60 z"/>'
                 '<path class="lionface" d="M22,206 q24,-4 34,14 l14,6 q6,10 -2,16 l-12,2 q2,8 -6,12 l-16,-2 q-14,-6 -16,-24 q-2,-18 4,-24 z"/>'
                 '<circle class="eye" cx="40" cy="218" r="3.5"/><path class="lionline" d="M58,244 q-6,4 -14,2 M66,228 h6"/>'
                 '<path class="lionmane" d="M-2,280 l6,110 l24,0 l4,-60 l10,60 l22,0 l-8,-120 z"/></g>')
    g.append('<line class="ground" x1="0" y1="430" x2="800" y2="430"/>')
    g.append(text(400, 452, "Lions carved on the gateposts, one on each side of the opening", "tsA", "middle"))
    return svg(460, "".join(g), "Drawing of the Lions' Gate at Hattusa: a tall pointed opening between two stone gateposts, with a lion carved on each")

def fig_troy():
    layers = [("I", ["c. 3000–2550 BCE,", "the first walled village"], 44), ("II", ["burnt layer:", "'Priam's Treasure'"], 44), ("III–V", [], 40),
              ("VI", ["c. 1750–1300 BCE,", "walls up to 5 m thick"], 60), ("VIIa", ["to c. 1180 BCE,", "destroyed by war"], 44),
              ("VIII", [], 28), ("IX", ["Roman Ilion"], 40)]
    g = ['<rect class="water" width="800" height="480"/>']
    y = 440
    for i, (name, note, h) in enumerate(layers):
        top = y - h
        l0, l1 = 30 + (440 - y) * 0.5, 30 + (440 - top) * 0.5
        r0, r1 = 420 - (440 - y) * 0.18, 420 - (440 - top) * 0.18
        cls = "layerA" if name in ("VI", "VIIa") else ("layer" if i % 2 == 0 else "layer2")
        g.append(f'<path class="{cls}" d="M{l0:.0f},{y} L{l1:.0f},{top} L{r1:.0f},{top} L{r0:.0f},{y} Z"/>')
        g.append(text(l1 + 16, top + h / 2 + 9, name, "t"))
        if note:
            mid = top + h / 2
            g.append(f'<line class="lead" x1="{r1 - 14:.0f}" y1="{mid:.0f}" x2="450" y2="{mid:.0f}"/>')
            g.append(text(460, mid + (7 if len(note) == 1 else -3), note[0], "ts"))
            if len(note) > 1:
                g.append(text(460, mid + 19, note[1], "ts"))
        y = top
    g.append('<line class="ground" x1="20" y1="440" x2="780" y2="440"/>')
    g.append(text(20, 470, "Oldest at the bottom: each town was levelled and built over", "tsA"))
    return svg(480, "".join(g), "Diagram of the layers of the Troy mound, from Troy I at the bottom to Roman Ilion, Troy IX, at the top")

def fig_coins():
    g = ['<rect class="water" width="800" height="360"/>']

    def coin(cx, cy, r):
        pts = []
        for k in range(36):
            a = k / 36 * 2 * math.pi
            rr = r * (1 + 0.06 * math.sin(3 * a) + 0.04 * math.cos(5 * a))
            pts.append(f"{cx + rr * math.cos(a):.1f},{cy + rr * math.sin(a):.1f}")
        return f'<polygon class="coin" points="{" ".join(pts)}"/>'

    def lion(tx, ty, sc, flip=1):
        # a lion's head in profile facing right: shaggy mane, heavy brow, open jaws
        rays = " ".join(f"M{-10 + 44 * math.cos(a):.1f},{4 + 50 * math.sin(a):.1f} L{-10 + 64 * math.cos(a):.1f},{4 + 70 * math.sin(a):.1f}"
                        for a in [math.radians(d) for d in range(110, 260, 18)])
        return (f'<g transform="translate({tx},{ty}) scale({sc * flip},{sc})">'
                f'<path class="coinline" d="{rays}"/>'
                '<path class="coinrelief" d="M-40,-36 q30,-34 70,-16 q18,8 24,24 l30,4 q10,8 4,18 l-30,6 l24,10 q0,16 -24,14 l-28,-8 q-10,28 -44,24 q-34,-6 -40,-36 q-4,-24 14,-44 z"/>'
                '<circle class="coinA" cx="30" cy="-10" r="6"/><path class="coinline" d="M10,-30 q20,-8 36,6 M58,30 l18,-2"/></g>')

    g.append(coin(200, 160, 112))
    g.append(lion(196, 150, 1.0))
    g.append('<circle class="coinA" cx="206" cy="104" r="8"/>')
    g.append(coin(590, 160, 112))
    g.append(lion(528, 166, 0.62))
    # bull forepart facing left, towards the lion
    g.append('<g transform="translate(652,166) scale(-0.62,0.62)"><path class="coinrelief" d="M-40,-30 q30,-26 64,-10 l26,12 q12,8 6,22 l-18,10 q-12,24 -40,24 q-34,-2 -46,-26 q-8,-20 8,-32 z"/>'
             '<path class="coinline" d="M-4,-36 q-10,-34 20,-44 M20,-30 q14,-30 44,-26"/><circle class="coinA" cx="30" cy="-6" r="6"/></g>')
    g.append(text(200, 310, "Electrum coin, 7th century BCE", "t", "middle") + text(200, 336, "lion's head", "ts", "middle"))
    g.append(text(590, 310, "Croeseid, gold or silver", "t", "middle") + text(590, 336, "lion and bull facing each other", "ts", "middle"))
    return svg(360, "".join(g), "Drawing of two Lydian coins: an early electrum coin with a lion's head, and a croeseid with the heads of a lion and a bull facing each other")

def fig_bridge():
    spans = [22, 26, 30, 34, 40, 46, 52, 52, 46, 40, 34, 30, 26, 22]
    total = sum(spans) + 6 * (len(spans) + 1)
    k = 700 / total
    g = ['<rect class="water" width="800" height="300"/>',
         '<rect class="river" x="0" y="196" width="800" height="104"/>']
    x = 50
    deck_y = 110
    path = [f"M{x},{deck_y} L{50 + 700},{deck_y} L{750},{190}"]
    cur = 750
    arches = []
    xx = 50 + 6 * k
    for s in spans:
        w = s * k
        rise = w * 0.55
        arches.append((xx, w, rise))
        xx += w + 6 * k
    d = f"M50,{deck_y} L750,{deck_y} L750,196 "
    for ax, w, rise in reversed(arches):
        d += f"L{ax + w:.1f},196 Q{ax + w:.1f},{196 - rise:.1f} {ax + w / 2:.1f},{196 - rise:.1f} Q{ax:.1f},{196 - rise:.1f} {ax:.1f},196 "
    d += "L50,196 Z"
    g.append(f'<path class="stone" d="{d}"/>')
    for ax, w, rise in arches:
        g.append(f'<path class="reflect" d="M{ax:.1f},200 Q{ax + w / 2:.1f},{200 + rise * 0.6:.1f} {ax + w:.1f},200"/>')
    g.append('<path class="parapet" d="M50,104 H750"/>')
    for wx in range(30, 800, 90):
        g.append(f'<path class="wave" d="M{wx},250 q10,-6 20,0 t20,0"/>')
    g.append('<line class="lead" x1="50" y1="70" x2="750" y2="70"/><line class="lead" x1="50" y1="62" x2="50" y2="78"/><line class="lead" x1="750" y1="62" x2="750" y2="78"/>')
    g.append(text(400, 58, "310 metres", "t", "middle"))
    g.append(text(400, 286, "Seyhan river · 14 arches visible today", "tsA", "middle"))
    return svg(300, "".join(g), "Elevation drawing of the Roman Stone Bridge at Adana: a 310-metre stone deck on 14 arches over the Seyhan")


def fig_hagia_sophia():
    g = ['<rect class="water" width="800" height="460"/>']
    # section through the nave: two semidomes and the central dome on piers
    g.append('<path class="stone" d="M110,420 L110,300 Q110,210 200,196 L260,196 L260,170 Q260,150 280,146 L520,146 Q540,150 540,170 L540,196 L600,196 Q690,210 690,300 L690,420 Z"/>')
    g.append('<path class="dome" d="M260,170 Q400,40 540,170 Z"/>')
    for k in range(9):
        x = 290 + k * 27.5
        g.append(f'<rect class="win" x="{x:.1f}" y="152" width="12" height="16" rx="6"/>')
    g.append('<path class="inside" d="M150,420 L150,310 Q150,240 214,232 L292,232 L292,206 Q400,110 508,206 L508,232 L586,232 Q650,240 650,310 L650,420 Z"/>')
    g.append('<path class="stone" d="M292,420 V300 h28 v120 z M480,420 V300 h28 v120 z"/>')
    g.append('<line class="ground" x1="40" y1="420" x2="760" y2="420"/>')
    g.append(text(400, 60, "central dome", "t", "middle") + '<line class="lead" x1="400" y1="68" x2="400" y2="96"/>')
    g.append(text(120, 180, "semidome", "ts", "middle") + '<line class="lead" x1="140" y1="188" x2="180" y2="222"/>')
    g.append(text(680, 180, "semidome", "ts", "middle") + '<line class="lead" x1="660" y1="188" x2="620" y2="222"/>')
    g.append(text(400, 448, "Opened for worship on 27 December 537", "tsA", "middle"))
    return svg(460, "".join(g), "Simplified section of Hagia Sophia: a central dome ringed by windows, flanked by two semidomes over the long nave")


def fig_caravanserai():
    g = ['<rect class="water" width="800" height="470"/>']
    # outer walls with towers
    g.append('<rect class="stone" x="140" y="40" width="520" height="400"/>')
    for x in (140, 660):
        for y in (40, 170, 300, 440):
            g.append(f'<rect class="tower" x="{x - 12}" y="{y - 12}" width="24" height="24"/>')
    # covered hall at the back: nave and aisles
    g.append('<rect class="inside" x="160" y="60" width="480" height="140"/>')
    for x in range(200, 640, 40):
        for y in (95, 130, 165):
            g.append(f'<rect class="pier" x="{x - 5}" y="{y - 5}" width="10" height="10"/>')
    g.append('<rect class="nave" x="380" y="60" width="40" height="140"/>')
    # open courtyard with arcades and rooms along both sides
    g.append('<rect class="yard" x="240" y="220" width="320" height="200"/>')
    for y in range(230, 420, 38):
        g.append(f'<rect class="room" x="162" y="{y}" width="60" height="30"/><rect class="room" x="578" y="{y}" width="60" height="30"/>')
    g.append('<rect class="kiosk" x="378" y="300" width="44" height="44"/>')
    # portal
    g.append('<rect class="portal" x="360" y="428" width="80" height="28"/>')
    g.append('<rect class="tag" x="320" y="112" width="160" height="30" rx="4"/>' + text(400, 134, "covered hall", "t", "middle"))
    g.append(text(400, 262, "open courtyard", "t", "middle"))
    g.append(text(470, 466, "monumental portal", "tsA", "start"))
    g.append(text(20, 250, "rooms", "ts") + '<line class="lead" x1="70" y1="244" x2="160" y2="250"/>')
    g.append(text(20, 30, "about 4,900 m² in all", "tsA"))
    return svg(470, "".join(g), "Simplified plan of a Seljuk caravanserai such as Sultanhanı: walls with towers, a portal, an open courtyard lined with rooms, and a covered hall at the back")


def fig_suleymaniye():
    g = ['<defs><linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2a44"/><stop offset=".72" stop-color="#6b4a3a"/><stop offset="1" stop-color="#d9a441"/></linearGradient></defs>',
         '<rect fill="url(#dusk)" width="800" height="420"/>',
         '<path class="hill" d="M0,420 L0,335 Q400,285 800,335 L800,420 Z"/>']
    g.append('<path class="silh" d="M250,330 L250,250 Q250,236 266,236 L300,236 Q310,210 340,206 L350,206 L350,190 Q400,110 450,190 L450,206 L460,206 Q490,210 500,236 L534,236 Q550,236 550,250 L550,330 Z"/>')
    for cx, r in [(285, 20), (515, 20), (325, 16), (475, 16)]:
        g.append(f'<path class="silh" d="M{cx - r},236 Q{cx},{236 - r * 1.3} {cx + r},236 Z"/>')
    g.append('<path class="silh" d="M397,114 h6 v-18 h-6 z"/>')
    for x, h in [(212, 200), (236, 170), (564, 170), (588, 200)]:
        top = 330 - h
        g.append(f'<path class="silh" d="M{x - 6},330 L{x - 6},{top + 20} L{x},{top} L{x + 6},{top + 20} L{x + 6},330 Z"/>')
        for b in range(2 if h < 190 else 3):
            g.append(f'<rect class="silh" x="{x - 10}" y="{top + 40 + b * 36}" width="20" height="5"/>')
    for x, w in [(100, 90), (620, 90), (50, 40), (720, 50)]:
        g.append(f'<path class="silh2" d="M{x},332 v-26 h{w} v26 z M{x + w / 2 - 14},306 q14,-20 28,0 z"/>')
    g.append(text(400, 404, "Süleymaniye, Istanbul, 1550–1557", "t", "middle"))
    return svg(420, "".join(g), "Silhouette of the Süleymaniye mosque on its hill at dusk, with its great central dome, cascading smaller domes and four minarets")

def fig_alphabet():
    letters = "A B C Ç D E F G Ğ H I İ J K L M N O Ö P R S Ş T U Ü V Y Z".split()
    special = set("Ç Ğ I İ Ö Ş Ü".split())
    g = ['<rect class="water" width="800" height="300"/>']
    per = 15
    for i, L in enumerate(letters):
        row, col = divmod(i, per)
        x = 40 + col * 48
        y = 70 + row * 92
        cls = "letA" if L in special else "let"
        g.append(f'<rect class="tile{"A" if L in special else ""}" x="{x}" y="{y - 46}" width="42" height="60" rx="5"/>')
        g.append(text(x + 21, y + 2, L, cls, "middle"))
    g.append(text(40, 256, "Highlighted: letters that differ from English. Turkish keeps a dotted İ", "tsA"))
    g.append(text(40, 282, "and a dotless I apart, and does not use Q, W or X.", "tsA"))
    return svg(300, "".join(g), "The letters of the Turkish alphabet introduced in 1928, with Ç, Ğ, I, İ, Ö, Ş and Ü highlighted")

def fig_bosphorus():
    g = ['<rect class="landbg" width="800" height="520"/>']
    g.append('<path class="water" d="M250,0 C260,60 220,110 250,170 C280,230 340,250 320,320 C300,390 360,430 340,520 L470,520 C490,430 430,390 450,320 C470,250 410,220 385,170 C360,110 400,60 390,0 Z"/>')
    g.append(text(320, 30, "Black Sea", "sea", "middle") + text(405, 506, "Sea of Marmara", "sea", "middle"))
    g.append(text(80, 330, "Europe", "big", "middle") + text(700, 140, "Asia", "big", "middle"))
    for y, name, date, cls in [(70, "Yavuz Sultan Selim Bridge", "2016", "br3"), (200, "Fatih Sultan Mehmet Bridge", "1988", "br2"), (300, "15 July Martyrs' Bridge", "1973, the first", "br1")]:
        g.append(f'<line class="{cls}" x1="170" y1="{y}" x2="500" y2="{y}"/><rect class="pylon" x="226" y="{y - 22}" width="8" height="30"/><rect class="pylon" x="440" y="{y - 22}" width="8" height="30"/>')
        g.append(text(518, y + 7, name, "ts") + text(518, y + 30, date, "tsA"))
    g.append('<path class="tunnel" d="M200,440 C290,462 390,462 500,440"/>' + text(518, 452, "Marmaray rail tunnel", "ts") + text(518, 475, "2013", "tsA"))
    g.append('<rect class="fort" x="196" y="170" width="22" height="22"/>' + text(20, 162, "Rumeli Hisarı, 1452", "ts", "start"))
    g.append(text(20, 506, "Not to scale", "ts"))
    return svg(520, "".join(g), "Schematic of the Bosphorus with its three bridges of 1973, 1988 and 2016, the Marmaray rail tunnel of 2013 and the fortress of Rumeli Hisarı")

def figures(outline):
    """Returns {section id: [(anchor regex, html)]}."""
    def fig(kind, caption, body):
        return f'<figure class="fig"><div class="fig-art">{body}</div><figcaption><b>{kind}</b>{esc(caption)}</figcaption></figure>'

    F = {
        "land": [(r"Anatolia or Asia Minor", fig("Map", "The two parts of Türkiye. Eastern Thrace in Europe, about 3 per cent of the land, is divided from Anatolia by the Bosphorus, the Sea of Marmara and the Dardanelles.", map_land(outline)))],
        "first-temples": [(r"Vulture Stone", fig("Drawing", "T-shaped pillars of the kind found at Göbekli Tepe, up to 5.5 metres tall, with arms, a belt and a loincloth carved in relief, and animals such as foxes, boars, snakes, scorpions and vultures. A person is shown for scale.", fig_pillars()))],
        "first-towns": [(r"eighteen levels", fig("Drawing", "How Çatalhöyük worked: houses built back to back without doors or streets, entered by ladders through openings in their roofs. The rooftops served as streets and plazas.", fig_catalhoyuk()))],
        "bronze-age": [(r"Lions' Gate", fig("Drawing", "The Lions' Gate of Hattusa, one of the carved gates in more than 8 kilometres of city walls. Simplified.", fig_lions_gate()))],
        "troy": [(r"Troy I, dates from", fig("Diagram", "The mound of Hisarlık as a stack of cities, from the first walled village of Troy I to Roman Ilion, Troy IX. Layer thicknesses are not to scale.", fig_troy()))],
        "iron-kingdoms": [(r"electrum", fig("Drawing", "Lydia's coins. The first were made of electrum, a natural alloy of gold and silver; under Croesus came croeseids with the foreparts of a lion and a bull. Simplified.", fig_coins()))],
        "alexander": [(r"near Issus", fig("Map", "Alexander's route through Anatolia in 334 and 333 BCE, simplified: across the Hellespont, victory at the Granicus, Gordium, the Cilician Gates and Tarsus, and the battle of Issus.", map_alexander(outline)))],
        "cilicia": [(r"14 are visible today", fig("Drawing", "The Stone Bridge over the Seyhan in Adana: 310 metres long and 11.4 metres wide, with 14 of its arches still visible. Arch sizes are simplified.", fig_bridge()))],
        "rome": [(r"seven churches", fig("Map", "Paul's first journey, from Perga to Antioch in Pisidia, Iconium, Lystra and Derbe; the seven churches named in the Book of Revelation; and the council cities of Nicaea (325) and Chalcedon (451). Positions are approximate.", map_paul(outline)))],
        "byzantium": [(r"Anthemius of Tralles", fig("Drawing", "A simplified section through Justinian's Hagia Sophia: the vast central dome, ringed by windows, with a semidome on each side over the nave.", fig_hagia_sophia()))],
        "seljuks": [(r"Sultanhanı", fig("Plan", "A Seljuk caravanserai in plan, simplified from Sultanhanı: a fortified enclosure with a monumental portal, an open courtyard lined with rooms, and a covered hall for winter.", fig_caravanserai()))],
        "ottoman-rise": [(r"Battle of Ankara", fig("Map", "The early Ottoman advance, simplified: from Söğüt to Bursa, İznik, Gallipoli and Edirne; the defeat by Timur at Ankara in 1402; and Constantinople, taken on 29 May 1453.", map_ottoman(outline)))],
        "ottoman-height": [(r"Süleymaniye complex", fig("Drawing", "The Süleymaniye on Istanbul's Third Hill, built for Süleyman by Sinan between 1550 and 1557, with the smaller buildings of its complex.", fig_suleymaniye()))],
        "collapse": [(r"Great Offensive", fig("Map", "The War of Independence, 1919–1922: from Samsun and the congresses of Erzurum and Sivas to the assembly in Ankara, the battles of İnönü, Sakarya and Dumlupınar, and the entry into İzmir. Positions are approximate.", map_independence(outline)))],
        "republic": [(r"Law No\. 1353", fig("Drawing", "The Latin-based Turkish alphabet introduced by Law No. 1353 in November 1928.", fig_alphabet()))],
        "modern": [(r"Engineering changed the Bosphorus", fig("Diagram", "The crossings of the Bosphorus with their opening years, and the fortress of Rumeli Hisarı from 1452. Not to scale.", fig_bosphorus()))],
    }
    return F


def place(paragraph_html_list, raw_paragraphs, items):
    """Inserts each figure after the first paragraph whose text matches its anchor."""
    out = list(paragraph_html_list)
    extra = {}
    for anchor, block in items:
        for k, p in enumerate(raw_paragraphs):
            if re.search(anchor, re.sub(r"<[^>]+>", "", p)):
                extra.setdefault(k, []).append(block)
                break
        else:
            raise ValueError(f"figure anchor not found: {anchor}")
    return extra


CSS = r"""
.fig{margin:1.5em 0 1.9em;max-width:68ch}
.fig-art{background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden}
.fig svg{display:block;width:100%;height:auto}
.fig figcaption{font:400 .88rem/1.5 var(--sans);color:var(--muted);margin-top:8px}
.fig figcaption b{font:600 .7rem/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin-right:8px}
.fig .water{fill:#141d27}.fig .landbg{fill:#1f232b}
.fig .land{fill:#262b34;stroke:#4a5261;stroke-width:1.5}.fig .land-eu{fill:#20343a;stroke:#56b6c2;stroke-width:1.5}
.fig .t{fill:#e7eaf0;font:500 25px system-ui,sans-serif}.fig .ts{fill:#9aa3b1;font:400 20px system-ui,sans-serif}
.fig .tsA{fill:#d9a441;font:500 20px system-ui,sans-serif}.fig .sea{fill:#56b6c2;font:italic 400 22px Georgia,serif;opacity:.85}
.fig .big{fill:#e7eaf0;font:600 30px Georgia,serif;letter-spacing:.04em}
.fig .pt{fill:#d9a441;stroke:#101216;stroke-width:2}.fig .pt2{fill:#56b6c2;stroke:#101216;stroke-width:2}.fig .star{fill:#e06c75;stroke:#101216;stroke-width:2}
.fig .route{fill:none;stroke:#d9a441;stroke-width:3;stroke-dasharray:10 7}.fig .route2{fill:none;stroke:#56b6c2;stroke-width:3;stroke-dasharray:4 6}
.fig .arrowhead{fill:#d9a441}.fig .lead{stroke:#9aa3b1;stroke-width:1.2;fill:none}
.fig .ground{stroke:#6b7280;stroke-width:2}
.fig .stone{fill:#8a7c66;stroke:#5c513f;stroke-width:2}.fig .stone2{fill:#76695a;stroke:#51483b;stroke-width:2}
.fig .stonewall{fill:#2c2a27;stroke:#3b3833}.fig .joints{stroke:#3b3833;stroke-width:2}
.fig .relief{fill:none;stroke:#4e4436;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
.fig .reliefA{fill:none;stroke:#3f362a;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
.fig .person{fill:#56b6c2}
.fig .mound{fill:#3a3025}.fig .house{fill:#b39a78;stroke:#7a6548;stroke-width:2}.fig .hatch{fill:#2a2118}
.fig .ladder{stroke:#5a4128;stroke-width:3;fill:none}.fig .inside{fill:#4a3d2e}.fig .platform{fill:#8f7657}
.fig .fire{fill:#e06c75}.fig .paint{stroke:#e06c75;stroke-width:3;fill:none}
.fig .opening{fill:#141d27}
.fig .layer{fill:#6e604d}.fig .layer2{fill:#5a4f40}.fig .layerA{fill:#a8844a}
.fig .coin{fill:#c9a24a;stroke:#8a6d2a;stroke-width:3}.fig .coinrelief{fill:#b08a36;stroke:#6f5520;stroke-width:3;stroke-linejoin:round}.fig .coinA{fill:#6f5520}
.fig .river{fill:#1b3440}.fig .reflect{fill:none;stroke:#3a6474;stroke-width:3}.fig .wave{fill:none;stroke:#3a6474;stroke-width:2}
.fig .parapet{stroke:#5c513f;stroke-width:6}
.fig .dome{fill:#9a8a70;stroke:#5c513f;stroke-width:2}.fig .win{fill:#d9a441;opacity:.8}
.fig .tower{fill:#6a5e4c}.fig .pier{fill:#8a7c66}.fig .nave{fill:#5a4d3b}.fig .yard{fill:#2a2723}.fig .room{fill:#5a4d3b}
.fig .kiosk{fill:#8a7c66}.fig .portal{fill:#d9a441}
.fig .hill{fill:#171a22}.fig .silh{fill:#0c0e13}.fig .silh2{fill:#12151c}
.fig .num{fill:#d9a441;stroke:#101216;stroke-width:2}.fig .numt{fill:#101216;font:700 16px system-ui,sans-serif}.fig .tag{fill:#2a2723}
.fig .lionmane{fill:#a08b6c;stroke:#5c513f;stroke-width:2}.fig .lionface{fill:#b8a282;stroke:#5c513f;stroke-width:2}.fig .eye{fill:#3f362a}.fig .lionline{stroke:#3f362a;stroke-width:3;fill:none}
.fig .coinline{stroke:#6f5520;stroke-width:4;fill:none;stroke-linecap:round}
.fig .tile{fill:#1f232b;stroke:#2a2f39}.fig .tileA{fill:#2c2616;stroke:#d9a441}
.fig .let{fill:#e7eaf0;font:500 36px Georgia,serif}.fig .letA{fill:#d9a441;font:600 36px Georgia,serif}
.fig .br1{stroke:#d9a441;stroke-width:6}.fig .br2{stroke:#c9ccd3;stroke-width:5}.fig .br3{stroke:#56b6c2;stroke-width:5}
.fig .pylon{fill:#9aa3b1}.fig .tunnel{fill:none;stroke:#e06c75;stroke-width:4;stroke-dasharray:12 8}.fig .fort{fill:#8a7c66}
"""
