// Hand-authored world layout: the river, coast, lakes, glacier, roads and the
// named places. Coordinates are meters; x points east, z points south
// (north is -z). The playable square spans -1200..1200 on both axes.

export const RIVER_POINTS = [
  [-150, -712],
  [-128, -640],
  [-78, -560],
  [-44, -470],
  [-46, -400],
  [-92, -318],
  [-176, -226],
  [-236, -128],
  [-214, -38],
  [-140, 38],
  [-150, 132],
  [-236, 214],
  [-330, 290],
  [-396, 400],
  [-424, 520],
  [-436, 640],
  [-452, 760],
  [-480, 880],
];

// Water-surface elevation keyframes along the river, keyed by the control point
// nearest to where they apply. `falls` marks the waterfall step at Bear Falls.
export const RIVER_LEVELS = [
  { at: [-150, -712], level: 76.0 },
  { at: [-78, -560], level: 61.0 },
  { at: [-45, -438], level: 50.0, falls: 13.0 },
  { at: [-92, -318], level: 34.0 },
  { at: [-236, -128], level: 22.5 },
  { at: [-140, 38], level: 15.0 },
  { at: [-330, 290], level: 6.0 },
  { at: [-424, 520], level: 2.0 },
  { at: [-452, 760], level: 0.15 },
  { at: [-480, 880], level: -0.6 },
];

// Half-width of the river channel (meters) keyed the same way.
export const RIVER_WIDTHS = [
  { at: [-150, -712], w: 7 },
  { at: [-44, -470], w: 9 },
  { at: [-92, -318], w: 12 },
  { at: [-214, -38], w: 15 },
  { at: [-330, 290], w: 18 },
  { at: [-424, 520], w: 22 },
  { at: [-452, 760], w: 34 },
  { at: [-480, 880], w: 44 },
];

// Coastline, ordered so that land lies on the left (north-east) side.
export const COAST_POINTS = [
  [-1500, 260],
  [-1150, 330],
  [-900, 430],
  [-720, 540],
  [-560, 640],
  [-470, 720],
  [-380, 790],
  [-250, 850],
  [-80, 920],
  [120, 975],
  [260, 1040],
  [330, 1130],
  [360, 1260],
  [390, 1500],
];

export const LAKES = [
  {
    id: 'moose',
    name: 'Moose Lake',
    x: 430,
    z: 90,
    r: 150,
    level: 22.0,
    depth: 9,
    seed: 11,
    tint: 'lake',
  },
  {
    id: 'glacier',
    name: 'Glacier Lake',
    x: -150,
    z: -832,
    r: 128,
    level: 70.0,
    depth: 16,
    seed: 23,
    tint: 'glacial',
  },
  // Steaming Springs: a warm green pond in a geothermal basin, and a hot
  // pool too hot for fish (but just right for a soak)
  {
    id: 'springs',
    name: 'Steaming Springs',
    x: 846,
    z: 52,
    r: 36,
    level: 24.0,
    depth: 4.5,
    seed: 31,
    tint: 'glacial',
    warm: true,
  },
  {
    id: 'hotpool',
    name: 'the hot pool',
    x: 884,
    z: 8,
    r: 9,
    level: 30.0,
    depth: 1.2,
    seed: 37,
    tint: 'glacial',
    hot: true,
  },
  // Mosquito Flats: tea-dark sloughs in the coastal muskeg
  {
    id: 'slough',
    name: 'Big Slough',
    x: 272,
    z: 628,
    r: 46,
    level: 16.0,
    depth: 3.2,
    seed: 41,
    tint: 'lake',
    bog: true,
  },
  {
    id: 'slough2',
    name: 'Little Slough',
    x: 214,
    z: 700,
    r: 26,
    level: 11.0,
    depth: 2.4,
    seed: 43,
    tint: 'lake',
    bog: true,
  },
];

// The geyser at Steaming Springs: a sinter cone that blows every minute or two.
export const GEYSER = { x: 834, z: -4 };

// Glacier tongue flowing from the north mountains into Glacier Lake.
export const GLACIER_POINTS = [
  [-120, -1260],
  [-128, -1140],
  [-146, -1040],
  [-152, -948],
];

// Big mountain masses inside the map (in addition to the ring at the edges).
export const MASSIFS = [
  { x: -780, z: -420, r: 460, h: 300 }, // Mount Ruben
  { x: 230, z: -560, r: 300, h: 150 }, // Sawtooth Ridge
  { x: 760, z: 560, r: 420, h: 180 }, // Kenai Hills
  { x: -760, z: 180, r: 330, h: 120 }, // West Hills
];

// Roads as control-point lists. Road ids are referenced by bridges and props.
export const ROADS = [
  {
    id: 'coast',
    name: 'Coast Road',
    points: [
      [-660, 574],
      [-590, 566],
      [-512, 548],
      [-446, 532],
      [-380, 520],
      [-300, 494],
      [-214, 462],
      [-128, 440],
      [-60, 428],
    ],
  },
  {
    id: 'river',
    name: 'River Road',
    points: [
      [-60, 428],
      [-128, 384],
      [-214, 344],
      [-270, 322],
      [-226, 296],
      [-160, 262],
      [-100, 196],
      [-70, 120],
      [-64, 40],
      [-130, -50],
      [-150, -120],
      [-110, -210],
      [-24, -300],
      [16, -384],
      [20, -470],
      [-4, -560],
      [-34, -640],
      [-48, -700],
      [-44, -728],
    ],
  },
  {
    id: 'tundra',
    name: 'Tundra Road',
    points: [
      [-60, 428],
      [40, 380],
      [150, 290],
      [214, 200],
      [210, 110],
      [232, 20],
      [300, -120],
      [420, -220],
      [520, -320],
      [600, -420],
      [672, -500],
    ],
  },
  {
    id: 'springs',
    name: 'Springs Road',
    points: [
      [300, -120],
      [420, -112],
      [540, -84],
      [650, -46],
      [740, -16],
      [800, 4],
    ],
  },
  {
    id: 'flats',
    name: 'Muskeg Road',
    points: [
      [120, 660],
      [160, 652],
      [204, 640],
      [230, 626],
    ],
  },
  {
    id: 'wreck',
    name: 'Wreck Road',
    points: [
      [-660, 574],
      [-700, 540],
      [-746, 514],
      [-790, 488],
      [-830, 460],
    ],
  },
  {
    id: 'light',
    name: 'Lighthouse Road',
    points: [
      [-60, 428],
      [40, 520],
      [120, 660],
      [190, 800],
      [240, 920],
      [262, 1000],
    ],
  },
];

// Named places. `kind` decides behaviour: fishing spots offer hotspots and
// species pools, hunting grounds spawn game, services are buildings.
export const PLACES = [
  {
    id: 'landing',
    name: 'Hotrod Landing',
    kind: 'fishing',
    x: -300,
    z: 300,
    water: 'river',
    blurb: "Ruben's cabin on the lower river. Pinks, Dollies and the odd silver.",
    bearRisk: 0.25,
  },
  {
    id: 'post',
    name: 'Kenai Trading Post',
    kind: 'service',
    x: -60,
    z: 440,
    blurb: 'Sell your catch and trophies. Buy rods, lures, arrows and hot rod parts.',
  },
  {
    id: 'bend',
    name: 'Salmon Bend',
    kind: 'fishing',
    x: -196,
    z: -60,
    water: 'river',
    blurb: 'A wide gravel bend where sockeye and silvers stack up.',
    bearRisk: 0.5,
  },
  {
    id: 'falls',
    name: 'Bear Falls',
    kind: 'fishing',
    x: -20,
    z: -410,
    water: 'river',
    blurb: 'Kings leap the falls here. So do the bears. Keep your bow close.',
    bearRisk: 0.95,
  },
  {
    id: 'glacier',
    name: 'Glacier Lake',
    kind: 'fishing',
    x: -44,
    z: -728,
    water: 'glacier',
    blurb: 'Milky blue meltwater under a calving glacier. Char and lakers.',
    bearRisk: 0.3,
  },
  {
    id: 'moose',
    name: 'Moose Lake',
    kind: 'fishing',
    x: 240,
    z: 100,
    water: 'moose',
    blurb: 'Weedy shallows full of pike. Moose wade here at dawn.',
    bearRisk: 0.35,
  },
  {
    id: 'pier',
    name: 'Halibut Pier',
    kind: 'fishing',
    x: -650,
    z: 600,
    water: 'ocean',
    blurb: 'Deep water off the pier. Halibut the size of barn doors.',
    bearRisk: 0.1,
  },
  {
    id: 'tundra',
    name: 'Caribou Tundra',
    kind: 'hunting',
    x: 672,
    z: -505,
    blurb: 'Open tundra above the treeline. Caribou herds and Dall sheep on the ridges.',
    bearRisk: 0.3,
  },
  {
    id: 'springs',
    name: 'Steaming Springs',
    kind: 'fishing',
    x: 812,
    z: 40,
    water: 'springs',
    blurb: 'A warm green pond in a steaming basin. Rainbows grow fat in the warm water. Mind the geyser, and soak in the hot pool.',
    bearRisk: 0.3,
  },
  {
    id: 'flats',
    name: 'Mosquito Flats',
    kind: 'fishing',
    x: 236,
    z: 612,
    water: 'slough',
    blurb: "Muskeg, a boardwalk and the World's Largest Mosquito. Pike, sheefish and blackfish in the sloughs. Bring bug dope.",
    bearRisk: 0.2,
  },
  {
    id: 'wreck',
    name: 'Shipwreck Cove',
    kind: 'fishing',
    x: -856,
    z: 446,
    water: 'ocean',
    wreck: true,
    blurb: 'The Unsinkable II has sat on this beach since 1987. Rockfish and lingcod live in her shadow; walk the gangplank and fish from her deck.',
    bearRisk: 0.15,
  },
  {
    id: 'lighthouse',
    name: 'Kachemak Light',
    kind: 'landmark',
    x: 290,
    z: 1050,
    blurb: 'An old lighthouse on the point. Whales pass close to shore.',
    bearRisk: 0.1,
  },
];
