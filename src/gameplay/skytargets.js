// What the Tundra Observatory's telescope can show you, and what the
// observatory's notes say about each. Deep-sky positions are J2000 right
// ascension and declination in degrees; the Sun, the Moon and the planets
// come from world/astro.js. Distances in light-years are the usual modern
// estimates.
export const TARGETS = [
  {
    id: 'sun',
    name: 'The Sun',
    kind: 'Our star',
    solar: true,
    when: 'day',
    facts: [
      'Through the solar filter only: an unfiltered telescope pointed at the Sun blinds you in an instant.',
      'A ball of hot hydrogen and helium 1.39 million km across, 109 Earths side by side. Its light takes 8 minutes 20 seconds to get here.',
      'The dark spots are sunspots: patches about 1,500 °C cooler than the 5,500 °C surface, where knots of magnetic field hold back the heat. Their number rises and falls over an 11-year cycle.',
    ],
  },
  {
    id: 'moon',
    name: 'The Moon',
    kind: 'Our moon',
    when: 'any',
    facts: [
      'About 384,400 km away on average: light from it takes 1.3 seconds. It is 3,474 km across.',
      'The dark grey seas (maria) are lava that flooded huge impact basins over three billion years ago. The craters are scars of impacts; with no air or rain they last for ages.',
      'It always turns the same face to us: its spin was slowed by Earth’s tides until a day there matched its month. The terminator, the line between day and night on it, is where the craters cast the longest shadows.',
    ],
  },
  {
    id: 'mercury',
    name: 'Mercury',
    kind: 'Planet',
    planet: 'mercury',
    when: 'twilight',
    facts: [
      'The smallest planet and the closest to the Sun, 58 million km from it on average. Its year is 88 days.',
      'It never strays far from the Sun in our sky, so it is only ever seen low in twilight. Like the Moon and Venus it shows phases.',
    ],
  },
  {
    id: 'venus',
    name: 'Venus',
    kind: 'Planet',
    planet: 'venus',
    when: 'twilight',
    facts: [
      'The brightest thing in the sky after the Sun and the Moon. Its clouds of sulphuric acid reflect three quarters of the sunlight that falls on them.',
      'Under them the air is almost all carbon dioxide, 90 times our pressure, and the ground is at 465 °C: hotter than Mercury.',
      'Galileo saw its phases in 1610, the first proof that a planet goes round the Sun, not the Earth.',
    ],
  },
  {
    id: 'mars',
    name: 'Mars',
    kind: 'Planet',
    planet: 'mars',
    when: 'twilight',
    facts: [
      'Red from iron oxide, rust, in its dust. Its white polar caps are water ice with a winter frost of frozen carbon dioxide.',
      'Home of Olympus Mons, a volcano 22 km high, and of two little moons, Phobos and Deimos.',
    ],
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    kind: 'Planet',
    planet: 'jupiter',
    when: 'twilight',
    facts: [
      'The biggest planet: 11 Earths across and 318 times as heavy. The stripes are cloud belts, stretched round it by a spin of less than 10 hours.',
      'The Great Red Spot is a storm wider than the Earth that has been watched for at least 190 years.',
      'The four dots in a line are the moons Galileo found in 1610. They change places night to night: Io with its volcanoes, Europa with an ocean under its ice, Ganymede, the largest moon in the solar system, and Callisto.',
    ],
  },
  {
    id: 'saturn',
    name: 'Saturn',
    kind: 'Planet',
    planet: 'saturn',
    when: 'twilight',
    facts: [
      'Its rings are billions of chunks of water ice, from dust to the size of a house, in a sheet about 280,000 km across but mostly only tens of metres thick.',
      'We saw them edge-on in March 2025, when they all but vanished; they are tilting open again toward 2032.',
      'The bright dot near it is Titan, a moon with thicker air than Earth’s and lakes of liquid methane. Saturn itself is so light it would float in a big enough bath.',
    ],
  },
  {
    id: 'm31',
    name: 'The Andromeda Galaxy',
    kind: 'Galaxy · Messier 31',
    ra: 10.684,
    dec: 41.269,
    when: 'dark',
    facts: [
      'A spiral galaxy of about a trillion stars, 2.5 million light-years away: the light you see left it before there were humans.',
      'The farthest thing you can see without a telescope, as a faint smudge. It is falling toward our Milky Way and the two will merge in about 4.5 billion years.',
      'The two smaller smudges are its satellite galaxies, Messier 32 and Messier 110.',
    ],
  },
  {
    id: 'm45',
    name: 'The Pleiades',
    kind: 'Star cluster · Messier 45',
    ra: 56.85,
    dec: 24.117,
    when: 'dark',
    facts: [
      'The Seven Sisters: a family of young blue-white stars born together about 100 million years ago, 444 light-years away. A telescope shows dozens more.',
      'The blue haze round the brightest is a dust cloud the cluster happens to be passing through, lit by the stars.',
    ],
  },
  {
    id: 'm42',
    name: 'The Orion Nebula',
    kind: 'Nebula · Messier 42',
    ra: 83.82,
    dec: -5.391,
    when: 'dark',
    facts: [
      'A stellar nursery 1,344 light-years away: a cloud of hydrogen where new stars and planets are forming right now.',
      'The four stars at its heart, the Trapezium, are young and hot enough to make the whole cloud glow.',
    ],
  },
  {
    id: 'm57',
    name: 'The Ring Nebula',
    kind: 'Planetary nebula · Messier 57',
    ra: 283.396,
    dec: 33.029,
    when: 'dark',
    facts: [
      'A smoke ring of gas thrown off by a dying star like the Sun, about 2,500 light-years away, lit by the white dwarf left at its centre.',
      'Our Sun will do the same in about five billion years.',
    ],
  },
  {
    id: 'albireo',
    name: 'Albireo',
    kind: 'Double star · beak of the Swan',
    ra: 292.68,
    dec: 27.96,
    when: 'dark',
    facts: [
      'One star to the eye, two in a telescope: one gold, one blue, about 430 light-years away.',
      'The colours are temperatures: the gold star is about 4,400 °C, the blue one about 13,000 °C. Hotter stars are bluer.',
    ],
  },
  {
    id: 'mizar',
    name: 'Mizar and Alcor',
    kind: 'Multiple star · handle of the Big Dipper',
    ra: 200.98,
    dec: 54.925,
    when: 'dark',
    facts: [
      'Seeing Alcor beside Mizar without a telescope was an old eyesight test. The telescope splits Mizar itself into two.',
      'Each of those is a pair too, too close for any telescope: with Alcor and its own companion, six stars in all, about 83 light-years away.',
    ],
  },
  {
    id: 'double',
    name: 'The Double Cluster',
    kind: 'Two star clusters · Perseus',
    ra: 35.0,
    dec: 57.14,
    when: 'dark',
    facts: [
      'Two clusters of young stars side by side, about 7,500 light-years away and only about 13 million years old.',
      'The few orange stars among the white ones are supergiants, already swelling toward the end of their short lives.',
    ],
  },
  {
    id: 'm13',
    name: 'The Hercules Cluster',
    kind: 'Globular cluster · Messier 13',
    ra: 250.42,
    dec: 36.46,
    when: 'dark',
    facts: [
      'A ball of several hundred thousand stars about 22,000 light-years away, 145 light-years across.',
      'Its stars are among the oldest in the galaxy, about 12 billion years old. In 1974 a radio message was beamed at it; it will arrive in about 25,000 years.',
    ],
  },
  {
    id: 'm27',
    name: 'The Dumbbell Nebula',
    kind: 'Planetary nebula · Messier 27',
    ra: 299.9,
    dec: 22.72,
    when: 'dark',
    facts: [
      'The first planetary nebula ever found, by Charles Messier in 1764: the outer layers of a dying star, blown off into space about 1,300 light-years away.',
      'Its shape, like an apple core, comes from the gas leaving faster at the star’s poles.',
    ],
  },
  {
    id: 'polaris',
    name: 'Polaris',
    kind: 'The pole star',
    ra: 37.95,
    dec: 89.264,
    when: 'dark',
    facts: [
      'It stands almost exactly over Earth’s north pole, so the whole sky turns round it. Its height above the horizon is your latitude: here about 60 degrees.',
      'A yellow supergiant about 430 light-years away; the telescope shows a faint companion beside it.',
      'Earth’s axis wobbles slowly: about 4,700 years ago the pole star was Thuban in the Dragon, and in some 12,000 years it will be Vega.',
    ],
  },
  {
    id: 'm81',
    name: 'Bode’s Galaxy and the Cigar',
    kind: 'Galaxies · Messier 81 and 82',
    ra: 148.89,
    dec: 69.065,
    when: 'dark',
    facts: [
      'Two galaxies 12 million light-years away that passed close to each other some 200 million years ago.',
      'The spiral, Messier 81, is calm; the cigar, Messier 82, was set off into a burst of star birth by the encounter. From Alaska they never set.',
    ],
  },
];

// The radio telescope's sources: what you hear, and why.
export const RADIO = [
  { id: 'pulsar', name: 'Pulsar B0329+54', sub: 'A tick every 0.714 seconds', facts: 'The brightest pulsar in the northern sky: a dead star’s core, a city-sized ball of neutrons spinning 1.4 times a second. Its magnetic poles sweep a radio beam past us like a lighthouse, 3,500 light-years away. The first pulsar, found in 1967, was nicknamed LGM-1, for little green men.' },
  { id: 'crab', name: 'The Crab pulsar', sub: 'A buzz, 30 ticks a second', facts: 'The core of a star that exploded in the year 1054, a supernova Chinese astronomers saw in daylight. It spins 30 times a second, 6,500 light-years away.' },
  { id: 'jupiter', name: 'Jupiter', sub: 'Waves on a pebble beach', facts: 'Jupiter’s moon Io pours charged gas into the planet’s magnetic field, and the field answers with storms of radio noise at about 20 megahertz: whooshes and pops like surf.' },
  { id: 'sun', name: 'The Sun', sub: 'Hiss, and the odd roar', facts: 'The quiet Sun hisses in radio; a solar flare sends bursts sweeping down the dial as shock waves climb out through its corona.' },
  { id: 'hydrogen', name: 'The hydrogen line', sub: 'Faint hiss at 1,420 megahertz', facts: 'Cold hydrogen gas, the most common stuff in the universe, gives off radio waves 21 cm long. Mapping it showed the spiral arms of our own galaxy.' },
  { id: 'cmb', name: 'The Big Bang’s afterglow', sub: 'Static from every direction', facts: 'The cosmic microwave background: light from 380,000 years after the Big Bang, cooled to 2.7 degrees above absolute zero. About one per cent of the snow on an old untuned television was this.' },
];

// The Sweden Solar System inspired walk on the Lighthouse Road: the Sun at
// the Trading Post end, the planets at their scaled distances (1 to 7.5
// billion: Neptune 600 m away). size_mm is each model's true scale size.
export const SCALE = 7.5e9;
export const WALK = [
  { id: 'sun', name: 'The Sun', au: 0, km: 1392700, fact: 'At this scale the Sun is a ball 19 cm across. The Sweden Solar System, the world’s largest model, makes Avicii Arena in Stockholm the Sun at 1 to 20 million: there Earth is 7.6 km away.' },
  { id: 'mercury', name: 'Mercury', au: 0.387, km: 4879, fact: 'A speck under a millimetre wide, 7.7 m from the Sun. Sunlight takes 3.2 minutes to get there.' },
  { id: 'venus', name: 'Venus', au: 0.723, km: 12104, fact: 'A grain of sand 1.6 mm wide, 14 m from the Sun.' },
  { id: 'earth', name: 'Earth', au: 1.0, km: 12742, fact: 'You are here: a grain of sand 1.7 mm wide, 20 m from the Sun. Sunlight takes 8 minutes 20 seconds; you walked it in 20 metres. The Moon would be a dust mote 5 cm away.' },
  { id: 'mars', name: 'Mars', au: 1.524, km: 6779, fact: 'Under a millimetre, 30 m from the Sun. Radio messages to rovers there take 3 to 22 minutes each way.' },
  { id: 'jupiter', name: 'Jupiter', au: 5.203, km: 139820, fact: 'A peppercorn-sized ball of 1.9 cm, 104 m from the Sun. Light takes 43 minutes.' },
  { id: 'saturn', name: 'Saturn', au: 9.537, km: 116460, fact: '1.6 cm across, 3.7 cm with its rings, 190 m from the Sun. Light takes 79 minutes.' },
  { id: 'uranus', name: 'Uranus', au: 19.19, km: 50724, fact: '7 mm across, 383 m from the Sun, rolling round its orbit on its side. Light takes 2 hours 40 minutes.' },
  { id: 'neptune', name: 'Neptune', au: 30.07, km: 49244, fact: '7 mm across, 600 m from the Sun. Light takes 4 hours 10 minutes. The nearest star would be another 5,400 km down the road.' },
];
