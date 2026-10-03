// The scientists' busts: who they are, what they found, how they look and
// where they stand. Each stands by a place their work belongs to: the
// astronomers at the observatory, the aurora's physicists on the tundra,
// Faraday, Maxwell and Noether by the Tesla Memorial's hydro plant, the
// geologists by the granite, the climate scientists by the glacier, the
// chemists by the springs, Darwin and Franklin by the salmon, Archimedes by
// a lake, the opticians by the lighthouse, the ocean scientists by the
// pier, Curie, Linnaeus and Nobel by the Trading Post, Ross on the
// mosquito flats, Anning on the cove's beach and Maathai in the forest.
//
// look: see world/bustcore.js. finish: bronze, dark (bronze) or marble.
// at: the group (GROUPS) it stands in. note: what the plaque's full text
// says when you read it, a paragraph a string.

// Where each group stands: round a place (or a point), between r0 and r1
// metres from it, the busts facing it.
export const GROUPS = {
  observatory: { place: 'observatory', r0: 11, r1: 34, where: 'at the Tundra Observatory' },
  tundra: { place: 'tundra', r0: 9, r1: 30, where: 'on the Caribou Tundra, below the observatory' },
  sun: { point: 'sun', r0: 4, r1: 14, where: "by the Sun's sign at the start of the solar system walk, by the Trading Post" },
  neptune: { point: 'neptune', r0: 4, r1: 14, where: "by Neptune's sign at the far end of the solar system walk, on the Lighthouse Road" },
  tesla: { place: 'tesla', r0: 9, r1: 28, where: 'by the Tesla Memorial at Bear Falls' },
  tors: { place: 'tors', r0: 10, r1: 34, where: 'at the Granite Tors' },
  glacier: { place: 'glacier', r0: 7, r1: 30, where: 'by Glacier Lake' },
  springs: { place: 'springs', r0: 8, r1: 30, where: 'at Steaming Springs' },
  bend: { place: 'bend', r0: 8, r1: 30, where: 'at Salmon Bend' },
  moose: { place: 'moose', r0: 8, r1: 30, where: 'by Moose Lake' },
  lighthouse: { place: 'lighthouse', r0: 9, r1: 34, where: 'by Kachemak Light' },
  pier: { parking: 'pier', r0: 5, r1: 22, where: 'above Halibut Pier' },
  post: { place: 'post', r0: 12, r1: 36, where: 'round the Kenai Trading Post' },
  flats: { place: 'flats', r0: 7, r1: 28, where: 'on Mosquito Flats' },
  wreck: { parking: 'wreck', r0: 4, r1: 20, where: 'at Shipwreck Cove' },
  forest: { point: 'cabin', r0: 14, r1: 80, forest: true, where: "in the forest behind Ruben's cabin at Hotrod Landing" },
};

export const SCIENTISTS = [
  // ------------------------------------------------ the observatory
  {
    id: 'galileo',
    name: 'Galileo Galilei',
    years: '1564 – 1642',
    line: 'The sky through a telescope',
    at: 'observatory',
    look: { sex: 'm', age: 0.75, hair: 'bald', beard: 'full', dress: 'band', finish: 'marble' },
    note: [
      'In 1609 Galileo built a telescope of his own and turned it on the sky. He saw mountains and craters on the Moon, far more stars in the Milky Way than anyone could count by eye, and the phases of Venus, which only make sense if Venus goes round the Sun.',
      'In January 1610 he found four moons going round Jupiter: proof that not everything in the sky circles the Earth. They are still called the Galilean moons, and the observatory’s telescope shows them on a clear night.',
    ],
  },
  {
    id: 'kepler',
    name: 'Johannes Kepler',
    years: '1571 – 1630',
    line: 'The laws of the planets',
    at: 'observatory',
    look: { sex: 'm', age: 0.45, hair: 'short', beard: 'pointed', dress: 'ruff', finish: 'marble' },
    note: [
      'From years of careful measurements of Mars, Kepler worked out in 1609 that the planets move round the Sun in ellipses, not circles, with the Sun at one focus.',
      'A planet moves faster when it is nearer the Sun, sweeping out equal areas in equal times; and in 1619 he found that the square of a planet’s year grows as the cube of its distance from the Sun. Newton later showed why: gravity.',
    ],
  },
  {
    id: 'newton',
    name: 'Isaac Newton',
    years: '1643 – 1727',
    line: 'Gravity, motion and light',
    at: 'observatory',
    look: { sex: 'm', age: 0.6, hair: 'newton', dress: 'coat', finish: 'marble' },
    note: [
      'Newton’s Principia (1687) set out the laws of motion and showed that the same gravity that pulls an apple to the ground keeps the Moon in its orbit and the planets round the Sun.',
      'He split white light into a rainbow of colours with a prism, and in 1668 he built the first working reflecting telescope, with a curved mirror instead of a lens. Most of the world’s big telescopes since have been reflectors.',
    ],
  },
  {
    id: 'leavitt',
    name: 'Henrietta Swan Leavitt',
    years: '1868 – 1921',
    line: 'A ruler for the universe',
    at: 'observatory',
    look: { sex: 'f', age: 0.4, hair: 'bun', dress: 'gown', finish: 'bronze' },
    note: [
      'At Harvard College Observatory, Henrietta Leavitt measured stars on thousands of photographic plates. In the Small Magellanic Cloud she found that the brighter a Cepheid variable star really is, the slower it pulses (1908, 1912).',
      'So timing a Cepheid’s pulse tells how bright it truly is, and how faint it looks tells how far away it is. Her law became the first ruler for the distances to other galaxies.',
    ],
  },
  {
    id: 'hubble',
    name: 'Edwin Hubble',
    years: '1889 – 1953',
    line: 'Galaxies beyond our own',
    at: 'observatory',
    look: { sex: 'm', age: 0.5, hair: 'side', dress: 'suit', finish: 'dark' },
    note: [
      'In 1923 Edwin Hubble found a Cepheid star in the Andromeda “nebula” and, with Leavitt’s law, showed that it lies far outside the Milky Way: a whole galaxy of its own.',
      'By 1929 he had found that the further away a galaxy is, the faster it is moving away from us: the universe is expanding. The Hubble Space Telescope carries his name.',
    ],
  },
  {
    id: 'lovelace',
    name: 'Ada Lovelace',
    years: '1815 – 1852',
    line: 'Notes on the Analytical Engine',
    at: 'observatory',
    look: { sex: 'f', age: 0.25, hair: 'long', dress: 'shawl', finish: 'bronze' },
    note: [
      'Ada Lovelace translated an article about Charles Babbage’s Analytical Engine, a mechanical computer that was never finished, and added notes of her own about three times as long (1843).',
      'One of them set out step by step how the engine could work out the Bernoulli numbers, often called the first computer program. She also saw that such a machine could work with any symbols, music for example, and not only with numbers.',
    ],
  },
  // ------------------------------------------------ the aurora, on the tundra
  {
    id: 'angstrom',
    name: 'Anders Jonas Ångström',
    years: '1814 – 1874',
    line: 'The colour of the aurora',
    at: 'tundra',
    look: { sex: 'm', age: 0.6, hair: 'side', beard: 'sideburns', dress: 'coat', finish: 'bronze' },
    note: [
      'Ångström was a pioneer of spectroscopy: reading the light of the Sun and of glowing gases, line by line, to tell what they are made of. In 1867 he was the first to measure the spectrum of the aurora.',
      'He found its green glow at a wavelength of 557.7 nanometres, now known to come from oxygen atoms about 100 to 250 km up. The ångström, a unit of length for light a tenth of a nanometre long, carries his name.',
    ],
  },
  {
    id: 'birkeland',
    name: 'Kristian Birkeland',
    years: '1867 – 1917',
    line: 'Why the aurora glows',
    at: 'tundra',
    look: { sex: 'm', age: 0.4, hair: 'receding', beard: 'mustache', glasses: true, dress: 'suit', finish: 'bronze' },
    note: [
      'The Norwegian physicist Kristian Birkeland led expeditions to the far north in 1902 and 1903 and proposed that the aurora is made by charged particles from the Sun, steered down into the air by the Earth’s magnetic field.',
      'In his laboratory he hung a magnetised ball, his “terrella”, in a vacuum chamber, fired electrons at it and made little auroras glow round its poles. Satellites proved him right in the 1960s.',
    ],
  },
  {
    id: 'alfven',
    name: 'Hannes Alfvén',
    years: '1908 – 1995',
    line: 'Plasma and magnetic fields',
    at: 'tundra',
    look: { sex: 'm', age: 0.7, hair: 'receding', glasses: true, dress: 'suit', finish: 'dark' },
    note: [
      'The Swedish physicist Hannes Alfvén founded magnetohydrodynamics: how plasmas, gases of electrically charged particles, move together with magnetic fields. He found waves that run along magnetic field lines, now called Alfvén waves.',
      'Nearly all the visible matter in the universe is plasma: the Sun, the solar wind, the glowing aurora overhead. He won the Nobel Prize in Physics in 1970.',
    ],
  },
  // ------------------------------------------------ the solar system walk
  {
    id: 'einstein',
    name: 'Albert Einstein',
    years: '1879 – 1955',
    line: 'Relativity and quanta of light',
    at: 'sun',
    look: { sex: 'm', age: 0.8, hair: 'wild', beard: 'mustache', dress: 'cardigan', finish: 'dark' },
    note: [
      'In 1905 Albert Einstein showed that light comes in little packets of energy, which explains how light knocks electrons out of metal (the photoelectric effect), and set out special relativity, with E = mc²: mass is a store of energy.',
      'His general relativity (1915) explains gravity as the bending of space and time by mass. The Sun at the start of this walk shines with energy made from mass in its core. Nobel Prize in Physics, 1921.',
    ],
  },
  {
    id: 'sagan',
    name: 'Carl Sagan',
    years: '1934 – 1996',
    line: 'The pale blue dot',
    at: 'neptune',
    look: { sex: 'm', age: 0.45, hair: 'wavy', dress: 'turtleneck', finish: 'dark' },
    note: [
      'Astronomer and teacher, Carl Sagan brought the universe to millions of people with his television series Cosmos (1980).',
      'He asked NASA to turn the Voyager 1 probe’s camera back toward home. On 14 February 1990, from about 6 billion km away, further out than Neptune at the end of this walk, it photographed the Earth as a dot less than a pixel across: the Pale Blue Dot.',
    ],
  },
  // ------------------------------------------------ electricity, by the hydro plant
  {
    id: 'faraday',
    name: 'Michael Faraday',
    years: '1791 – 1867',
    line: 'Electricity from magnetism',
    at: 'tesla',
    look: { sex: 'm', age: 0.65, hair: 'curly', beard: 'sideburns', dress: 'coat', finish: 'bronze' },
    note: [
      'A bookbinder’s apprentice who became one of the greatest experimenters of all, Michael Faraday found in 1831 that a moving magnet makes an electric current flow in a wire: electromagnetic induction.',
      'Every generator works this way, the one in the little hydro plant below the falls included, and so does every transformer. He also began the Royal Institution’s Christmas Lectures for young people, still given every year.',
    ],
  },
  {
    id: 'maxwell',
    name: 'James Clerk Maxwell',
    years: '1831 – 1879',
    line: 'Light is an electromagnetic wave',
    at: 'tesla',
    look: { sex: 'm', age: 0.4, hair: 'wavy', part: 'middle', beard: 'full', dress: 'coat', finish: 'bronze' },
    note: [
      'James Clerk Maxwell gathered the laws of electricity and magnetism into one theory (1865) and found that it allows waves which travel at the speed of light. Light, he concluded, is an electromagnetic wave.',
      'Radio, radar, the microwaves the observatory’s dish listens to and the light you see by are all such waves. He also made the first colour photograph, of a tartan ribbon, in 1861.',
    ],
  },
  {
    id: 'noether',
    name: 'Emmy Noether',
    years: '1882 – 1935',
    line: 'Symmetry and conservation',
    at: 'tesla',
    look: { sex: 'f', age: 0.5, hair: 'bob', glasses: true, dress: 'blouse', finish: 'dark' },
    note: [
      'Emmy Noether proved one of the deepest results in physics (1915, published 1918): wherever the laws of nature have a symmetry, something is conserved.',
      'Because the laws are the same today as tomorrow, energy is conserved; because they are the same here as there, momentum is. The falling water’s energy becomes electricity in the plant below, and heat and sound: none of it is lost. She also founded much of modern algebra.',
    ],
  },
  // ------------------------------------------------ the granite
  {
    id: 'hutton',
    name: 'James Hutton',
    years: '1726 – 1797',
    line: 'Deep time',
    at: 'tors',
    look: { sex: 'm', age: 0.8, hair: 'receding', dress: 'coat', finish: 'marble' },
    note: [
      'James Hutton saw that rocks are made, worn down and made again in cycles so slow that the Earth must be unimaginably old: “no vestige of a beginning, no prospect of an end”.',
      'In Glen Tilt, in Scotland, he found in 1785 veins of granite cutting through older rock: the granite had pushed in as molten rock. The Granite Tors here formed the same way, deep underground, and were laid bare as the rock above them wore away.',
    ],
  },
  {
    id: 'lehmann',
    name: 'Inge Lehmann',
    years: '1888 – 1993',
    line: 'The Earth’s inner core',
    at: 'tors',
    look: { sex: 'f', age: 0.85, hair: 'curly', dress: 'cardigan', finish: 'dark' },
    note: [
      'The Danish seismologist Inge Lehmann studied the waves of earthquakes that pass through the Earth. In 1936 she showed that faint waves arriving where none were expected must bounce off a solid inner core inside the liquid outer core.',
      'Nobody can drill there: the inner core begins about 5,100 km down. Earthquake waves are how we know what is inside the planet. She worked into her nineties and lived to be 104.',
    ],
  },
  // ------------------------------------------------ the climate, by the glacier
  {
    id: 'wegener',
    name: 'Alfred Wegener',
    years: '1880 – 1930',
    line: 'Drifting continents',
    at: 'glacier',
    look: { sex: 'm', age: 0.4, hair: 'short', dress: 'turtleneck', finish: 'bronze' },
    note: [
      'Alfred Wegener noticed that the coasts of South America and Africa fit together like puzzle pieces, with the same fossils and rocks on both sides, and proposed in 1912 that the continents drift.',
      'Few believed him until the ocean floor was mapped decades later (see Marie Tharp above Halibut Pier). He was a polar scientist too, who crossed the ice of Greenland; he died there on an expedition in 1930.',
    ],
  },
  {
    id: 'arrhenius',
    name: 'Svante Arrhenius',
    years: '1859 – 1927',
    line: 'Carbon dioxide warms the Earth',
    at: 'glacier',
    look: { sex: 'm', age: 0.6, hair: 'receding', beard: 'mustache', glasses: true, dress: 'suit', finish: 'bronze' },
    note: [
      'In 1896 the Swedish chemist Svante Arrhenius calculated how much the carbon dioxide in the air warms the Earth. Doubling it, he estimated, would warm the planet by five to six degrees.',
      'Today’s best estimate is about three degrees, and glaciers like this one are shrinking as the climate warms. His Nobel Prize in Chemistry (1903) was for a different discovery: how salts split into charged particles in water.',
    ],
  },
  {
    id: 'foote',
    name: 'Eunice Newton Foote',
    years: '1819 – 1888',
    line: 'The heat-trapping gas',
    at: 'glacier',
    look: { sex: 'f', age: 0.4, hair: 'bun', bunY: 0.0, dress: 'gown', finish: 'bronze' },
    note: [
      'In 1856 the American scientist Eunice Foote put thermometers in glass cylinders filled with different gases and set them in the sun. The one with carbon dioxide grew hottest, and stayed hot longest.',
      '“An atmosphere of that gas would give to our earth a high temperature,” she wrote: the first known link between carbon dioxide and the climate, three years before John Tyndall’s better-known experiments.',
    ],
  },
  // ------------------------------------------------ the springs
  {
    id: 'celsius',
    name: 'Anders Celsius',
    years: '1701 – 1744',
    line: 'A hundred degrees',
    at: 'springs',
    look: { sex: 'm', age: 0.35, hair: 'wig', dress: 'coat', finish: 'marble' },
    note: [
      'The Swedish astronomer Anders Celsius proposed in 1742 a temperature scale with a hundred steps between the freezing and the boiling of water. At first it ran backwards, 0 for boiling and 100 for freezing; it was turned round after his death.',
      'Water boils at 100 degrees on his scale at sea level; the springs here are fed by water heated deep underground. With his assistant he also noticed that a compass needle trembles when the northern lights are out.',
    ],
  },
  {
    id: 'mendeleev',
    name: 'Dmitri Mendeleev',
    years: '1834 – 1907',
    line: 'The periodic table',
    at: 'springs',
    look: { sex: 'm', age: 0.8, hair: 'long', beard: 'long', dress: 'coat', finish: 'bronze' },
    note: [
      'In 1869 Dmitri Mendeleev arranged the known chemical elements by weight and saw their properties repeat in a pattern. He left gaps in his table, and predicted the elements that would fill them.',
      'Gallium (found in 1875), scandium (1879) and germanium (1886) turned out to have the properties he had foreseen. The minerals dissolved in the springs’ water, the iron, the calcium, the silica, all have their places on his table.',
    ],
  },
  // ------------------------------------------------ life, by the salmon
  {
    id: 'darwin',
    name: 'Charles Darwin',
    years: '1809 – 1882',
    line: 'Evolution by natural selection',
    at: 'bend',
    look: { sex: 'm', age: 0.9, hair: 'bald', beard: 'long', dress: 'coat', finish: 'bronze' },
    note: [
      'Charles Darwin’s On the Origin of Species (24 November 1859) explained how living things change over the generations: those whose inherited traits suit their surroundings leave more young, and the traits spread.',
      'The salmon here show it: each run comes back to the river where it hatched, and over many generations the fish of each river have become suited to its own water, in their size and in the timing of their run.',
    ],
  },
  {
    id: 'franklin',
    name: 'Rosalind Franklin',
    years: '1920 – 1958',
    line: 'Photograph 51',
    at: 'bend',
    look: { sex: 'f', age: 0.3, hair: 'bob', part: 'side', dress: 'blouse', finish: 'dark' },
    note: [
      'Rosalind Franklin made X-ray pictures of DNA. Photograph 51, taken in 1952 with her student Raymond Gosling, showed a pattern only a helix could make.',
      'Her pictures and measurements were key to the double helix that James Watson and Francis Crick published in 1953. Every salmon in the bend carries its instructions in that molecule.',
    ],
  },
  // ------------------------------------------------ a lake
  {
    id: 'archimedes',
    name: 'Archimedes',
    years: 'about 287 – 212 BC',
    line: 'Why things float',
    at: 'moose',
    look: { sex: 'm', age: 0.8, hair: 'curly', beard: 'full', dress: 'robe', finish: 'marble' },
    note: [
      'Archimedes of Syracuse found that anything in water is pushed up by a force equal to the weight of the water it pushes aside. A boat floats because it pushes aside its own weight of water before it sits too deep.',
      'The story that he ran from his bath shouting “Eureka!” (I have found it) may be a legend, but his principle is not. He also worked out the law of the lever and closely estimated pi.',
    ],
  },
  // ------------------------------------------------ light, by the lighthouse
  {
    id: 'fresnel',
    name: 'Augustin-Jean Fresnel',
    years: '1788 – 1827',
    line: 'The lighthouse lens',
    at: 'lighthouse',
    look: { sex: 'm', age: 0.35, hair: 'curly', beard: 'sideburns', dress: 'coat', finish: 'bronze' },
    note: [
      'Augustin-Jean Fresnel showed that light is a wave, and designed a new lens for lighthouses: rings of glass prisms in place of one thick lens, thin enough to make and light enough to turn.',
      'The first was lit in the Cordouan lighthouse in France on 25 July 1823 and could be seen more than 37 km away. Most of the world’s lighthouses came to use his lenses.',
    ],
  },
  {
    id: 'alhaytham',
    name: 'Ibn al-Haytham',
    years: 'about 965 – 1040',
    line: 'How we see',
    at: 'lighthouse',
    look: { sex: 'm', age: 0.7, hair: 'turban', beard: 'full', dress: 'eastern', finish: 'marble' },
    note: [
      'Working in Cairo, Ibn al-Haytham wrote the Book of Optics (about 1011 to 1021). He showed that we see because light from things enters the eye, and not because the eye sends out rays.',
      'He tested his ideas by experiment, with darkened rooms where light through a small hole casts a picture of the world outside (the camera obscura): an early model of the scientific method.',
    ],
  },
  // ------------------------------------------------ the ocean, above the pier
  {
    id: 'carson',
    name: 'Rachel Carson',
    years: '1907 – 1964',
    line: 'The sea around us',
    at: 'pier',
    look: { sex: 'f', age: 0.5, hair: 'bob', dress: 'cardigan', finish: 'dark' },
    note: [
      'The marine biologist Rachel Carson wrote about the ocean in The Sea Around Us (1951), a best seller.',
      'Her book Silent Spring (1962) showed how pesticides like DDT build up through food chains and kill birds and fish. It changed laws and began the modern environmental movement; bald eagles, nearly gone from the lower 48 states, came back after DDT was banned.',
    ],
  },
  {
    id: 'tharp',
    name: 'Marie Tharp',
    years: '1920 – 2006',
    line: 'Mapping the ocean floor',
    at: 'pier',
    look: { sex: 'f', age: 0.35, hair: 'bob', part: 'side', dress: 'blouse', finish: 'bronze' },
    note: [
      'From thousands of echo soundings, Marie Tharp drew maps of the sea floor. In 1952 she found a deep valley running down the middle of the Mid-Atlantic Ridge, where the sea floor is splitting apart.',
      'It was strong evidence that the continents move (see Wegener by Glacier Lake). Her map of the whole ocean floor, made with Bruce Heezen, was published in 1977.',
    ],
  },
  // ------------------------------------------------ round the Trading Post
  {
    id: 'curie',
    name: 'Marie Curie',
    years: '1867 – 1934',
    line: 'Radioactivity',
    at: 'post',
    look: { sex: 'f', age: 0.6, hair: 'bun', dress: 'gown', finish: 'bronze' },
    note: [
      'Marie Curie and her husband Pierre discovered two new elements, polonium and radium, in 1898, studying the rays that some minerals give off. She called the effect radioactivity.',
      'She was the first person to win two Nobel Prizes, in Physics (1903, with Pierre Curie and Henri Becquerel) and in Chemistry (1911), and she is still the only person to have won in two different sciences.',
    ],
  },
  {
    id: 'linnaeus',
    name: 'Carl Linnaeus',
    years: '1707 – 1778',
    line: 'A name for every living thing',
    at: 'post',
    look: { sex: 'm', age: 0.5, hair: 'wig', dress: 'coat', finish: 'marble' },
    note: [
      'The Swedish botanist Carl Linnaeus gave every plant and animal a two-part Latin name, its genus and its species, like Homo sapiens. His Species Plantarum (1753) began the naming of plants as it is done today.',
      'He named fireweed, the tall pink flower all over Kenai Country, in that book. Botanists have since moved it to another genus, but the “(L.)” in its full name, Chamaenerion angustifolium (L.), still stands for Linnaeus.',
    ],
  },
  {
    id: 'nobel',
    name: 'Alfred Nobel',
    years: '1833 – 1896',
    line: 'Dynamite and the prizes',
    at: 'post',
    look: { sex: 'm', age: 0.6, hair: 'receding', beard: 'full', dress: 'suit', finish: 'dark' },
    note: [
      'The Swedish chemist Alfred Nobel invented dynamite (patented in 1867), making nitroglycerine safe enough to handle. It blasted the tunnels, railways, mines and roads of the world, roads like the ones here.',
      'In his will (1895) he left his fortune for prizes “to those who, during the preceding year, shall have conferred the greatest benefit to mankind”. The first Nobel Prizes were given in 1901; many of the people on these plinths won one.',
    ],
  },
  // ------------------------------------------------ the mosquito flats
  {
    id: 'ross',
    name: 'Ronald Ross',
    years: '1857 – 1932',
    line: 'Mosquitoes and malaria',
    at: 'flats',
    look: { sex: 'm', age: 0.5, hair: 'short', beard: 'mustache', dress: 'suit', finish: 'bronze' },
    note: [
      'On 20 August 1897, in India, Ronald Ross found malaria parasites in the stomach of an Anopheles mosquito that had fed on a patient: proof that mosquitoes carry the disease.',
      'Working with malaria in birds, he went on to trace the parasite’s whole cycle, from bird to mosquito and back. Nobel Prize in Medicine, 1902. Alaska’s mosquitoes do not carry malaria, but they do bite: bug dope helps.',
    ],
  },
  // ------------------------------------------------ the cove
  {
    id: 'anning',
    name: 'Mary Anning',
    years: '1799 – 1847',
    line: 'Fossils from the cliffs',
    at: 'wreck',
    look: { sex: 'f', age: 0.4, hair: 'bonnet', dress: 'shawl', finish: 'bronze' },
    note: [
      'Mary Anning searched the crumbling sea cliffs at Lyme Regis in England for fossils. With her brother she found the first ichthyosaur skeleton to be correctly identified (about 1811 to 1812), then the first complete plesiosaur (1823) and a flying reptile, a pterosaur (1828).',
      'Her finds showed that animals had lived and died out long before people, though as a woman she could not join the scientific societies of her day. Cliffs worn by the sea, like the ones round this cove, are still where fossils come to light.',
    ],
  },
  // ------------------------------------------------ the forest
  {
    id: 'maathai',
    name: 'Wangari Maathai',
    years: '1940 – 2011',
    line: 'Planting trees',
    at: 'forest',
    look: { sex: 'f', age: 0.6, hair: 'wrap', dress: 'dashiki', finish: 'dark' },
    note: [
      'The Kenyan biologist Wangari Maathai founded the Green Belt Movement in 1977, paying women to plant trees to stop the soil washing away and to bring back firewood and clean water. It has planted tens of millions of trees.',
      'In 2004 she became the first African woman to win the Nobel Peace Prize. Forests like this one hold the soil, store carbon and shelter wildlife.',
    ],
  },
];

export const SCIENTIST = Object.fromEntries(SCIENTISTS.map((s) => [s.id, s]));
