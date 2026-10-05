# Hotrod Outdoor Alaska Fishing

A first-person fishing and hunting adventure in Alaska, made for iPhone and iPad.
Drive Ruben's flame-painted hot rod between fifteen places on a wild Alaskan
peninsula, tow a fishing boat to any lake, river or the bay, cast with a timing
bar, fight salmon and halibut, hunt caribou and moose with a longbow, climb the
Granite Tors on a top rope, take pictures of the wildlife, and keep your bow
close: grizzlies smell the fish in your cooler. After dark the real night sky
comes out over the Kenai Peninsula: look through the telescope at the Tundra
Observatory, listen to pulsars with its radio dish, watch the northern lights
and the space station, and go after the meteorites the fireballs drop.
Twenty-three science objectives, from the craters of the Moon to Nikola Tesla's
coil at Bear Falls, keep what you find out in the Journal. One clear night a
meteor outburst brings something down in the forest, and someone small and
friendly climbs out. And something very fast is hidden in the woods.

![Title screen](docs/screenshots/title.jpg)

Everything you see and hear is generated in code at start-up: the terrain,
rivers, glacier, forests, animals, the cars, the fish, the sky, the weather,
the sound effects and the music. The night sky comes from real data packed
into the game: a star catalogue and the planets' and the Moon's motions.
There are no downloaded models, textures or audio files, so the whole game is
a single 1.9 MB HTML file (about 690 KB compressed).

| | |
|---|---|
| ![Casting meter](docs/screenshots/cast.jpg) | ![Fighting a fish](docs/screenshots/fight.jpg) |
| ![Driving the hot rod](docs/screenshots/drive.jpg) | ![Grizzly charge](docs/screenshots/grizzly.jpg) |
| ![Drawing the longbow on the tundra](docs/screenshots/bow.jpg) | ![Glacier calving into Glacier Lake](docs/screenshots/calving.jpg) |
| ![Bear Falls](docs/screenshots/falls.jpg) | ![Northern lights](docs/screenshots/aurora.jpg) |
| ![The steaming volcano across the inlet](docs/screenshots/volcano.jpg) | ![Snow on the high peaks](docs/screenshots/peaks.jpg) |
| ![Butterflies over a fireweed meadow](docs/screenshots/meadow.jpg) | ![Yellow pond lilies on Moose Lake](docs/screenshots/lilies.jpg) |
| ![Driftwood riding the river](docs/screenshots/driftwood.jpg) | ![A cascade down the cliffs](docs/screenshots/cascade.jpg) |
| ![A rainbow over Ruben's cabin as an evening shower passes](docs/screenshots/rainbow.jpg) | ![Morning mist over the river at Hotrod Landing](docs/screenshots/mist.jpg) |
| ![Puddles and wet ground after rain by the Trading Post](docs/screenshots/puddles.jpg) | ![An epic salmon shark landed at Halibut Pier, with the small map in the corner](docs/screenshots/shark.jpg) |
| ![The rebuilt hot rod at Hotrod Landing](docs/screenshots/hotrod.jpg) | ![The first-person hands on the rod, in a flannel shirt](docs/screenshots/arms.jpg) |
| ![The Tundra Observatory by Caribou Tundra](docs/screenshots/observatory.jpg) | ![Saturn through the observatory's telescope](docs/screenshots/telescope.jpg) |
| ![Stargazing from a deck chair with the sky guide](docs/screenshots/stargaze.jpg) | ![A fireball coming down over the tundra](docs/screenshots/fireball.jpg) |
| ![The Granite Tors and their top ropes](docs/screenshots/tors.jpg) | ![A hand on a hold under the overhang of Raven's Roof](docs/screenshots/climbing.jpg) |
| ![Nikola Tesla's statue on the rim of the gorge at Bear Falls](docs/screenshots/tesla.jpg) | ![The Tesla coil running in the coil house](docs/screenshots/coil.jpg) |
| ![Bear Falls Hydro: the penstock and the powerhouse at the foot of the falls](docs/screenshots/hydro.jpg) | ![The Journal's Science page](docs/screenshots/science.jpg) |
| ![The meteor outburst through the telescope, and something slower](docs/screenshots/outburst.jpg) | ![The craft coming down, seen from the observatory](docs/screenshots/craft.jpg) |
| ![Starfall Clearing: the pod and the trees laid flat round it](docs/screenshots/crash.jpg) | ![Zib comes out from behind the pod](docs/screenshots/zib.jpg) |
| ![Isaac Newton's bust in marble at the Tundra Observatory](docs/screenshots/newton.jpg) | ![The Journal's Scientists page](docs/screenshots/scientists.jpg) |

What changed in the latest round (every family of assets looks better for
the same work: rounder animals with paler bellies, tree crowns lit as one
volume, bark that keeps its colour, clear car glass, a truer tone curve and
softer light under cloud), with before and after pictures, what it costs and
the audit: [docs/asset-quality-update.html](docs/asset-quality-update.html).
Since then the hand on the rod holds it as an angler holds a spinning rod,
and every first-person sleeve is the right way out:
[docs/rod-hand-fix.html](docs/rod-hand-fix.html). And the card that shows a
catch no longer covers the fish you hold up: on a phone on its side or
upright, the fish is held up whole in the part of the screen the card leaves
free: [docs/catch-card-fix.html](docs/catch-card-fix.html). After it, a
river boulder that looked like glass under the water now reads as wet stone,
with what comes next and the options for the next round:
[docs/next-steps.html](docs/next-steps.html).
The step before the latest round, a fair check of the voice's frame cost and a map check
that really taps Bear Falls:
[docs/voice-cost-check.html](docs/voice-cost-check.html).
Earlier rounds: [docs/fullscreen-voice-update.html](docs/fullscreen-voice-update.html),
[docs/sound-scientists-update.html](docs/sound-scientists-update.html),
[docs/science-update.html](docs/science-update.html),
[docs/cars-sky-update.html](docs/cars-sky-update.html),
[docs/hotrod-buildings.html](docs/hotrod-buildings.html),
[docs/hotrod-update.html](docs/hotrod-update.html) and
[docs/graphics-update.html](docs/graphics-update.html).

## What is in the game

**Fishing**

- A three-tap cast: tap **CAST** to start, tap to set the power (blue on the
  meter shows where the water is, gold marks a fish hotspot), then tap the
  timing. While you cast, a dashed line on the water marks out the throw and a
  ring shows where the lure will land. The timing bar has red ends, orange,
  green and a dark green line in the middle, and a white marker sweeps back and
  forth across it: tap on the dark green line for a **PERFECT CAST** and better
  bites; anywhere in the green the lure lands in the ring; in the orange, left
  of the line hooks it left and right of it slices it right, and it falls
  short; red gives you a backlash to untangle.
- The bite follows the time and the weather: fish feed hardest at dawn and
  dusk, when a front rolls in and with rain on the water, sulk deep under a
  bright midday sun and go quiet at night; on the sea the tide matters (it
  follows the real Moon: high water a few hours after the Moon crosses the
  sky, the strongest currents at spring tides after new and full Moon), and
  every species keeps its own hours (kings at dawn, pike in the midday sun,
  halibut on a running tide, burbot at night). The **BITE** readout under the
  map button says SLOW, FAIR, GOOD or HOT; tap it to hear why. The map shows
  the bite at each place and when each fish bites best.
- An announcer calls the big moments, in a voice and in big arcade letters:
  **FISH ON!**, **IT THREW THE HOOK!**, **OH NO, THE HOOK CAME OFF!**, **SNAP!
  THE LINE BROKE!**, **NEW SPECIES! NORTHERN PIKE!**, **PERSONAL BEST!**,
  **LEGENDARY!** and **THE BITE IS ON!** The voice is the game's own: every
  line, fish, legend, star and place name it says was recorded with a natural
  neural voice ([Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), see the credits) and ships
  with the game, so it sounds the same on every phone with nothing to
  download, and the wind, water and music dip while it talks. Settings,
  Voice can switch to one of the device's own voices, or turn the announcer
  off.
- Watch the float: nibbles are twitches, a real bite pulls it under and you have
  a moment to tap **HOOK!** The line only comes in when you reel: the current
  carries the float along but never back to your feet, and a lure that lands on
  the bank stays there until you hold **REEL**.
- The fight: hold **REEL** while keeping the tension needle in the green, let
  go when the fish runs, steer the rod against its runs, and stop reeling when
  it jumps or it throws the hook. Lines snap, go slack and get spooled. Only
  reeling brings a fish closer: let go and it stays out, and a tired fish is
  landed when you reel it in to your feet.
- 31 species in four tiers of rarity. Common: Pink and Sockeye Salmon, Dolly
  Varden, Arctic Grayling, Northern Pike, Pacific Cod, Round Whitefish, Black
  Rockfish, Kelp Greenling, Pacific Staghorn Sculpin and the Alaska Blackfish
  of the bog. Uncommon: Coho and Chum Salmon, Rainbow Trout, Arctic Char, Lake
  Trout, Burbot (at night), Pacific Halibut, Lingcod, Coastal Cutthroat Trout,
  Kokanee, Starry Flounder and Spiny Dogfish. Rare: King Salmon, Steelhead,
  Yelloweye and Quillback Rockfish, and the Sheefish of Mosquito Flats. Epic:
  Big Skate and Salmon Shark off Halibut Pier, and the Wolf Eel that lives in
  the wreck at Shipwreck Cove. Each has its own
  waters, lure preferences and fighting style. Rarer fish bite less often and
  are worth more, and a cast to a hotspot or a perfect cast raises the odds.
- The fish you land look wet and alive in your hands and in the catch photo:
  rounded bodies on each species' own outline with the step of the gill cover,
  fine scales, the lateral line and the species' own marks painted on, fins of
  rays with clear membrane between, eyes with a coloured iris and a pupil,
  barbels on the cod and the burbot, and a wet clear coat with a rainbow sheen
  on the salmon, the trout and the whitefish.
- Nine legendary fish, each at its own spot and only on the right lure: Miss
  Dolly, Rusty the Leopard, Old Chrome, The Ice Ghost, Big Bertha, Barn Door,
  Old Steamy, Sheezilla and Davy Jones.
- Twelve lures: Hotrod Spinner, Glo Bead, Mosquito Dry Fly, Egg-Sucking Leech,
  Woolly Bugger, Flash Spoon, Paddle-tail Swimbait, Pike Popper, Octopus
  Hoochie, Circle Hook and Squid, Diving Plug and Herring Jig. Nine rods, each
  with its own colours and a perk: Hotrod Classic, Willow Wand (a longer moment
  to hook), Glass Noodle (forgives slack line), Hotrod Pro, Fly Whisperer
  (tempts rarer fish), Surf Cannon (casts furthest), Hotrod Big Block (tempts
  legends), Gus's Antler Special and the Golden Hotrod (a wider perfect line and
  the strongest line of all). You need a heavy rod, and a light touch on
  **REEL** while it runs, for a salmon shark.
- A Fish Journal sorted by rarity with personal records, and a bald eagle that
  sometimes dives in and steals a small fish right as you land it.

**The hot rod, the boat and the places**

- The buildings in detail. Ruben's log cabin stands on its own levelled yard
  above the landing: chinked logs with their ends showing at the corners, four-
  pane windows with green shutters, a shingled roof running out over an open
  porch with a rocking chair, steps down to the yard, a stone chimney, a
  woodpile under a lean-to, a canoe upside down on sawhorses, salmon drying on
  a rack and a bear cache on stilts. The Kenai Trading Post has a false front
  under its big sign, display windows and double doors onto a covered porch
  with rocking chairs, barrels, a live bait cooler and a notice board, two fuel
  pumps on their island, a weigh station with the day's halibut, an ice chest,
  propane, tires and a stone basement where the ground drops away at the back.
  Kachemak Light has a door, windows and a railed gallery, and the keeper's
  house beside it a picket fence and the wash out on the line; the bait shack
  on Halibut Pier sells through its service window. Wood, shingles, stone,
  concrete and corrugated metal have real surfaces (board joints, bark,
  shingle rows, mortar, ridges and rust) that cost no extra draws.
- The hot rod, rebuilt in detail: a 1932 Ford roadster body with smooth
  curved panels and flames edged in pinstripes (Ruben's name in script on the
  deck lid), a chrome grille shell, headlamp buckets on a light bar, a dropped
  I-beam front axle on hairpins with a transverse spring and shocks, a blown
  big-block with finned valve covers, heat-tinted headers, side pipes and a
  6-71 blower under a bug-catcher scoop, a quick-change rear end on ladder
  bars, steel wheels with whitewalls, trim rings and baby moons, a rolled and
  pleated interior, gauges whose needles follow the speed and the revs, an
  8-ball shift knob, and a steering wheel that turns with the front wheels.
  Ruben sits at the wheel in your wardrobe's clothes, his hands on the rim. It
  runs 0 to 100 km/h in 3.2 seconds and tops out at 166 km/h with the best
  engine.
- Fifteen places joined by gravel roads and truss bridges: Hotrod Landing
  (Ruben's cabin), Kenai Trading Post, Salmon Bend, Bear Falls, Glacier Lake,
  Moose Lake, Halibut Pier, Caribou Tundra, Kachemak Light, the Tundra
  Observatory (see The night sky below), the Granite Tors (see Climbing), the
  Tesla Memorial at Bear Falls (see Science) and three newer ones:
  - Steaming Springs: a warm green trout pond in a basin of white and orange
    sinter, steam vents, bubbling mud pots, a hot pool to **SOAK** in (it heals
    you and passes an hour) and Old Faceful, a geyser that rumbles and blows
    every minute or two.
  - Mosquito Flats: tea-dark sloughs in the coastal muskeg with pike, sheefish
    and blackfish, a boardwalk over the bog, dead snags, the World's Largest
    Mosquito (Alaska's unofficial state bird) and a machine that sells bug dope,
    which keeps the swarms and their opinions away for a while.
  - Shipwreck Cove: the Unsinkable II, a rusty trawler aground off the beach
    since 1987. Walk the gangplank onto her deck and fish the deep water off
    her stern for rockfish, lingcod and the wolf eel, open the sea chest in her
    wheelhouse, and look out at the sea stacks.
- A fishing boat on a trailer (at the garage): a sixteen-foot aluminium skiff
  with an outboard. It hitches to the hot rod and follows it round the map. Stop
  near any lake, the river or the bay and tap **LAUNCH**; walk up and **BOARD**
  it; **GAS** and steer to run the water with a seat view or a chase camera;
  **FISH** drops anchor so you can cast all round the boat (bears cannot reach
  you out there); **ASHORE** steps off where the water meets the land, and
  **LOAD BOAT** winches it back onto the trailer. A bigger outboard makes it
  half again as fast. The boat bumps off piers, docks, the bridge pier and the
  wreck, the river carries it along, and it will not go over Bear Falls.
- Arcade driving with cockpit and chase cameras, a horn, engine sound that
  follows the revs, and upgrades: Flathead V8, Small-block 350 and a blown
  big-block, all-terrain tires, and four paint jobs.
- A small map in the top left corner that turns as you do and shows the land
  around you, the places you know, the hot rod, the boat, your next goal and a
  charging grizzly. It zooms out while you drive, and a tap opens the full map.
  **RUN** sits right by it, high up on the left, where the thumb that walks
  does not reach.
- A full-screen button, first in the row at the top right and in the corner of
  the title screen. It fills the screen through the browser's
  [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API)
  and changes to a leave button while it does. Safari on iPhone lets only
  videos fill the screen, so there the button says what works instead: added
  to the Home Screen and started from its icon, the game opens full screen.
  Started that way, or in the iOS app, it already fills the screen and the
  button stays out of the way.
- The full map fills the screen: drag it, pinch or use the buttons to zoom,
  and tap a place, or the lake, river or sea it fishes, to see what lives there
  (only at places you have been to), the bite there right now and when each
  fish bites best.
- A wardrobe behind the T-shirt button at the top: shirts (flannels, denim, a
  hoodie, camo, hi-vis, a Hawaiian shirt and a Hotrod racing jacket), hats
  (caps, a beanie, a bucket hat, a cowboy hat and a moose antler hat), beards
  and moustaches, hair colour, skin tone and gloves. You see your sleeves and
  gloves in first person, and Ruben at the wheel wears it all.
- Your arms in first person, rebuilt: hands with jointed fingers, knuckles and
  nails, a thumb that wraps the grip, posed for the rod, the bow hand, the
  three-finger draw on the string and a fish cradled in both hands; sleeves
  with folds, a turned-back cuff and a button, in the shirt's own cloth
  (flannel checks, denim twill, camo, hi-vis tape, Hawaiian flowers), with a
  bare wrist above the glove.
- Fast travel from the map to any place you have already discovered (the trip
  costs in-game time), and sleep at the cabin to skip the night.

**The night sky**

- The real sky over the Kenai Peninsula for the game's date (day 1 is
  20 August 2026) and hour: 2,560 stars to magnitude 5.6 from the Extended
  Hipparcos Compilation, in their true colours and places, turning with the
  sidereal clock round Polaris, which stands 60 degrees up in the north. The
  Milky Way from its real outline. Faint stars drown in moonlight and twilight,
  stars dim and twinkle near the horizon, and clouds hide what is behind them.
- The five planets you can see without a telescope where they really are, as
  bright as they really are, and the Moon with its real phase, lit from the
  Sun's side, with earthshine on a thin crescent. Moonlit nights are brighter
  than moonless ones, and the Moon drives the tide on the coast, with spring
  tides after new and full Moon and neap tides after the quarters.
- The northern lights follow each night's space weather. Every night has its
  own planetary K index, Kp, from 0 (quiet) to 9 (a great storm): the stronger
  the storm, the further south and higher the curtains reach, red at the top in
  big storms, flaring in substorms through the night. An aurora alert comes at
  dusk when a storm is due.
- Shooting stars after dark, about one every half minute. Some nights a
  fireball lights up the land, its sonic boom arriving long after the light,
  and drops a meteorite in the woods: the map circles where to look, the stone
  glints when you are close, and the Trading Post pays by the kilogram (iron,
  stony or a rare pallasite with olive-green crystals).
- Some evenings and mornings the International Space Station passes over: a
  bright, steady light crossing low through the southern sky from west to east
  in about a minute (its orbit never takes it further north than 51.6
  degrees, so from here it never climbs above about 20 degrees), fading orange
  into Earth's shadow. Fainter satellites drift over too.
- The Tundra Observatory on the open tundra by Caribou Tundra, where the sky is
  darkest: a white dome that turns and opens its shutter at night, a control
  hut, a six-metre radio dish that points at what it listens to, a weather mast,
  an all-sky meteor camera, red lamps (as at real observatories, to keep eyes
  used to the dark), a notice board and a deck with two reclining chairs
  facing north-west, where the skyline is lowest.
  - **TELESCOPE**: eighteen targets, each drawn in a round eyepiece view from
    the real sky at that moment, with what the observatory's notes say about
    it: the Sun through the solar filter with the day's sunspots, the Moon at
    its real phase, Mercury and Venus showing their phases, Mars with its polar
    cap, Jupiter with its belts, the Great Red Spot and its four big moons where
    they really are that night, Saturn with its rings at their true tilt, the
    Andromeda Galaxy, the Pleiades, the Orion Nebula, the Ring Nebula, Albireo,
    Mizar and Alcor, the Double Cluster, the Hercules Cluster, the Dumbbell
    Nebula, Polaris and Bode's Galaxy with the Cigar. The telescope finds the
    bright planets in daylight too, never points within 12 degrees of the Sun,
    and galaxies need a dark sky. Each new object goes in the sky log and pays
    $20.
  - **RADIO DISH**: six sources to listen to, with a chart recorder trace: the
    pulsar B0329+54 ticking every 0.714 seconds, the Crab pulsar's buzz of 30
    pulses a second, Jupiter's radio storms, the Sun's bursts, the hydrogen
    line at 1,420 megahertz, and the hiss of the Big Bang's afterglow. Radio
    passes through cloud, so it works in any weather.
  - **TONIGHT**: the night's almanac on the board and in the observatory's
    screen: the Moon's phase and when it is up, which planets are up and where,
    the aurora forecast, the space station's pass and what is out right now.
  - **STARGAZE** from a deck chair: the night slows to a game hour every two
    minutes so you can watch the sky turn, and the sky guide draws the
    constellations and names them, the bright stars and the planets. In the
    day the chairs offer **WAIT FOR DARK**. The sky guide also shows whenever
    you look up at a dark sky (Settings > Sky guide).
- A scale model of the solar system along the Lighthouse Road at one to 7.5
  billion, after the Sweden Solar System: the Sun a glowing ball 19 cm across
  at the Trading Post end, Earth a grain of sand 20 m down the road, Jupiter
  104 m, Neptune 600 m. Each body has a sign with its distance, its size at
  this scale and how long sunlight takes to reach it, and its model at true
  scale on a post: most of them are specks, which is the point.
- The camera's album has a Night sky page: the Moon, the northern lights, the
  Milky Way, the space station, a shooting star and a fireball, each with how
  far away or how high it really is (the Moon at its true distance that
  night, the space station about 1,200 km off when it is low). Five
  challenges belong to the sky: five objects through the telescope, the solar
  system walk, the space station, a meteorite and four planets.

**Hunting and wildlife**

- A longbow: hold to draw, release to loose. Arrows fly in an arc, so aim a
  little high for distance, and a full draw held too long starts to shake.
  Head and vital-zone hits, arrows you can walk over to pick up again, and at
  the Trading Post a bow sight with a stabiliser, a faster yew longbow and five
  kinds of arrow, each with its own colour: cedar, fast and flat carbon, heavy
  broadheads, glow-nock arrows you can follow in flight, and bear whistlers that
  shriek and send any bear they pass running. Tap the arrows chip to switch.
- A camera with a zoom lens (at the Trading Post): the tool button brings it
  up, **ZOOM** steps from 1x to 8x and **SNAP** takes the picture. The
  viewfinder names what it is on and rates the shot from one to three stars
  (close and centred is best). The photo album in the Journal keeps your best
  picture of every animal, bird and sea mammal, the geyser blowing, and the
  fish you photograph from the catch card; the first good picture of each
  animal sells to Alaska Outdoors magazine.
- Put the rod away when you are not fishing: the tool button cycles the rod,
  the longbow, the camera (once you have one) and empty hands.
- Game to hunt: caribou, moose, Sitka black-tailed deer, Dall sheep, black
  bears in the forests and mountain goats on the cliffs of Mount Ruben. Walk up
  and **CLAIM** what you shoot, then sell it at the Trading Post.
- Grizzly bears that fish at Bear Falls and wander the river, and black bears in
  the forests. They only come for you when there is fish in your cooler: then
  they follow the smell, bluff and charge (a black bear bluffs more and swipes
  softer). Loose arrows, use bear spray up close, or get knocked down and wake
  up at the cabin. With an empty cooler they leave you be.
- Around you: wolves, red foxes, snowshoe hares, musk oxen on the tundra,
  porcupines, a lynx, colonies of arctic ground squirrels that sit up and
  whistle, beavers with their lodge on Moose Lake, bald eagles, ravens, gulls,
  flying V formations of geese, ducks, loons, trumpeter swans, sandhill cranes,
  black-billed magpies at the cabin, a belted kingfisher diving in the river,
  puffins, ptarmigan, sea otters, harbour seals, Steller sea lions hauled out
  near the pier, a pod of orcas and whales breaching off the lighthouse.
- Fish you can see: schools hold in the current at the hotspots and in pools,
  scatter when your float lands, and the fish that takes the bait swims in under
  the float and fights under the surface. Red sockeye crowd the river during a
  salmon run.

**Adventure**

- Odd jobs on the board at the Trading Post: Mrs. Henderson wants a pike over
  6 kg for her famous casserole, the Kenai Gazette a three-star eagle for the
  front page, the cannery foreman three sockeye, Old Earl the lucky lure he
  dropped at Salmon Bend in 1974, Chef Rosa a 30 kg halibut, the aquarium a
  wolf eel, the ranger a grizzly moved along with a whistler, and your aching
  back a soak in the hot pool, among others. One job at a time, three on the
  board, new ones every morning.
- The sea chest in the wheelhouse of the Unsinkable II.
- Bigfoot. Very rarely, at dawn or dusk, something big and hairy strolls along
  the forest edge a long way off and is gone. Get a picture: the late-night
  radio show pays well. It comes out blurry, as tradition demands.
- Strange things in the woods, on no map: ten oddities in the forests a short
  walk off the roads. Walk up to one to find it; the Journal keeps what you
  found, and a rumour for each one still out there, under Challenges. Some can
  be opened, answered or knocked on, and a few give you something you cannot
  buy. Two challenges pay for finding three and for finding all ten.
- A secret on the mountain, on no map. From Hotrod Landing, the Trading Post
  or Glacier Lake, keep an eye on the high peaks to the west: something up
  there glints in the sun now and then, and glows after dark.

<details>
<summary>The secret, step by step (spoilers)</summary>

- Gus left his paraglider on a summit in the far west, on a gear box beside a
  windsock and a sign that says GUS'S LAUNCH (No refunds · Mind the first
  step). The glint is a tin mirror on the box, the glow a lantern on the
  windsock's pole. It is a hard walk of about one and a half kilometres up
  from Bear Falls; cairns mark the steep upper half.
- **TAKE PARAGLIDER**, then face a long drop (the ground 25 m ahead at least
  12 m lower and nothing in the way) and tap **GLIDE** (`E` on a keyboard).
  You run a few steps and the wing lifts you. Steer by dragging on the left
  half (`A` / `D`), drag up to dive and down to brake (`W` / `S`), and look
  round with the right half. At trim the wing sinks 1.15 m a second at
  36 km/h, a glide of about 8.7 to 1; the instruments show your height over
  the ground, the sink and the speed. You land when your feet touch the
  ground, a deck or water; a treetop, a roof, a rock or a pole ends the
  flight early, and a headwind turns you back at the edge of the map. GLIDE
  again from any edge.
- Gus's note points south, to a ledge under an orange tarp that no path
  reaches. Glide down to it from the launch (about 300 m, half a minute in
  the air): his camp is in a shallow grotto, with a lantern on a post at its
  mouth that glows at night, and a tin with a brass key. **TAKE KEY**.
- The note with the key sends you to Bear Falls. Walk in from the west bank
  along a stone shelf at the foot of the cliff, behind the falling water: Gus's
  chest sits in a niche there. **OPEN** it with the key for $5,000 in gold
  nuggets and Gus's Golden Spoon, a lure every fish takes well and that brings
  rare and epic fish more often. It is never sold at the Trading Post.
- Gus's notes are kept in the journal, under Challenges, once you have found them.
- A save made in the air keeps the edge you launched from: Continue puts you
  back there with the paraglider.

</details>

<details>
<summary>The race car in the woods (spoilers)</summary>

![The race car in its clearing, by its spare slicks and tool chest](docs/screenshots/racecar.jpg)

- A Formula One car waits under a tarp in a clearing at the end of an old
  logging track east of the River Road, between the Trading Post and Salmon
  Bend; a KEEP OUT sign marks where the track leaves the road. Its team left
  it there with the spare slicks in their warming blankets, a tool chest, a
  jerry can and a pit board that still says BOX BOX.
- **PULL TARP** to find it, then **DRIVE**. It runs 0 to 100 km/h in 2.6
  seconds and 287 km/h flat out, grips like nothing else on the road and
  brakes from top speed in about 100 metres, but it sits two fingers off the
  ground: on the forest floor it crawls at about 40 km/h, it cannot wade more
  than about 30 cm of water, and it has no headlights. The rear wing's flap
  opens on the straights, the rain light blinks in the dark and the rain, the
  steering wheel has its own display, and the announcer calls 200, 250 and
  300 km/h. Its livery is navy with aurora green, number 99, with the Kenai
  Trading Post and Moose Lake Bait & Tackle on it.
- The map and the compass show it once found, and the game keeps where you
  left it.
</details>

<details>
<summary>The strange things in the woods (spoilers)</summary>

- A fridge humming in the spruce east of the Trading Post, its cord running
  off into the moss. **OPEN** it once for $40.
- A fairy ring of red toadstools north-west of Moose Lake; after dark their
  spots glow and a ring of green light shows in the grass. Step inside once a day for four hours of fairy luck (four minutes of
  play by day): the fish bite half as well again, and the bite readout says
  Fairy luck.
- A flying saucer nose down in a crater north of Steaming Springs, its rim
  lights green at night and its hatch open. **LOOK INSIDE** for a tinfoil hat.
- Bigfoot's hut of whole young trees south-west of Mosquito Flats, with fresh
  fish bones by the door and very big footprints.
- Ruben's first hot rod, rusted through, with a spruce growing up through the
  engine, south-west of the Trading Post. **LOOK** at it and the garage paints
  yours to match for free: Barn-find Rust.
- A payphone on a pole in the forest north-east of Halibut Pier. It rings as
  you come near; **ANSWER** it.
- Nine standing stones in a ring south-west of Glacier Lake, runes on three of
  them glowing blue at night.
- A Christmas tree, decorated and lit all year, west of Steaming Springs.
  **OPEN PRESENT** for a Santa hat.
- A garden gnome with a fishing rod south-west of Caribou Tundra. He stands
  somewhere else every day.
- A tiny door at the foot of an old spruce south-east of Bear Falls, with two
  round windows lit at night. **KNOCK** after dark (from about 23:00 to
  04:00, while its windows are lit).
</details>

**Climbing**

- The Granite Tors off the Tundra Road: two towers of granite blocks, the big
  one four blocks and about 18 m high, the little one 6 m, like the tors in the
  hills near Fairbanks. The Kenai Climbing Club keeps four top ropes on them,
  each in its own colour: First Steps (5.4) on the little tor, Tundra Stroll
  (5.5) up the south face of the big tor, Ptarmigan Crack (5.8) up its north
  face and Raven's Roof (5.10) over a ledge and under the overhang on its east
  face. The grades are the American ones: 5 means a climb that needs a rope,
  the number after the point how hard it is.
- A climbing kit (shoes, harness and chalk) from the Trading Post's gear page.
  At the foot of a route, **CLIMB**.
- You climb hand over hand: push the stick (or W, A, S, D or the arrow keys)
  toward the next hold, or tap a hold, and the hand that can reach it goes
  there. Faint rings mark the holds in reach. Jugs are big, edges and pockets
  smaller, slopers round and crimps tiny; each tires your fingers at its own
  rate, and steep rock faster (an overhang three times as fast as a slab).
  The grip meter at the bottom shows what is left: **CHALK** buys some back,
  and a big hold on rock that is not overhanging is a rest (the meter says
  REST). Over the roof waits the big hold climbers call a thank-god jug.
- Run out of grip and you come off: the rope holds you after a short drop.
  **CLIMB ON** when you have your breath back, or **LOWER** to the ground.
- Top out and you stand on top of the tor: sign the summit register (an old
  ammunition can, as on real summits), take a rock sample, look out over the
  forest and **LOWER OFF** from the anchor. The club's bounty board pays for
  each first ascent, and two challenges belong to the tors.

**Science**

- Twenty-five objectives in six fields, done in any order, each paying and
  keeping what you learned in the Journal's Science page. Astronomy: the
  Moon's craters, a planet's disc, the Andromeda Galaxy, a pulsar, the Big
  Bang's afterglow, the space station, the northern lights, a meteor shower, a
  meteorite and the size of the solar system. Physics and engineering: Tesla's
  plaque, the Tesla coil, the hydro plant's power, the wall of air at 250 km/h
  in the race car and a paraglider's lift. Earth science: the granite of the
  tors, the glacier calving and the hot springs. Biology: the salmon's journey,
  a fat bear and the bald eagles. Life beyond Earth: the visitor, and life at
  the edges. The people of science: read 10 of the scientists' plaques, and
  all 34.
- Busts of 34 scientists on granite plinths all over Kenai Country, each by a
  place their work belongs to: Galileo, Kepler, Newton, Henrietta Leavitt,
  Hubble and Ada Lovelace at the observatory; Ångström, Birkeland and Alfvén,
  who worked out the aurora, on the tundra below it; Einstein at the Sun of the
  solar system walk and Carl Sagan past Neptune; Faraday, Maxwell and Emmy
  Noether by the Tesla Memorial's hydro plant; Hutton and Inge Lehmann at the
  granite tors; Wegener, Arrhenius and Eunice Foote by the glacier; Celsius and
  Mendeleev at the springs; Darwin and Rosalind Franklin by the salmon; Archimedes
  at Moose Lake; Fresnel and Ibn al-Haytham at the lighthouse; Rachel Carson and
  Marie Tharp above the pier; Marie Curie, Linnaeus and Alfred Nobel round the
  Trading Post; Ronald Ross on Mosquito Flats; Mary Anning on the cove's beach;
  Wangari Maathai in the forest behind the cabin. In bronze, dark bronze or
  marble, each sculpted in their own likeness (the hair, beard, glasses and
  clothes of their time). **READ THE PLAQUE** for what they found and how it
  ties to the place; the Journal's Scientists page keeps what you have read and
  says where the others stand. The busts are sculpted by background workers
  while the title is up, so no frame waits for them.
- The Tesla Memorial at Bear Falls: a bronze Nikola Tesla seated reading his
  notes on a granite base, in the pose of Frano Kršinić's 1976 statue at
  Niagara Falls, on a terrace at the rim of the gorge. **READ THE PLAQUE** for
  his story: the rotating magnetic field and the induction motor, the power of
  Niagara reaching Buffalo in 1896 on his alternating current, his coil, and
  the unit named after him.
- The coil house beside it: **RUN THE TESLA COIL** and it throws sparks a metre
  long inside its earthed cage, and a fluorescent tube on a stand lights up
  with no wire to it.
- Bear Falls Hydro: the intake at the top of the falls, the penstock out of its
  tunnel along the foot of the gorge, the powerhouse at the water with its
  outflow foaming back into the river, three wires up the gorge on poles
  (three-phase alternating current) and a board at the rim that works out the
  plant's power from the falls' drop: about 300 kW.
- Three science odd jobs on the board: a geologist wants a granite sample from
  the top of the big tor, the observatory a picture of the Moon and the weather
  service one of the northern lights.
- A save from before the objectives existed gets them for what its logs show
  already done (the sky log, the radio log, the album's sales, the solar
  system's signs, the race car's speed marks, the aurora, the fish journal),
  and is paid for them when it is loaded.

**The visitor from the sky** (spoilers)

- One clear dark night the observatory calls a meteor outburst: the Kappa
  Cygnids, an August shower known for slow meteors and fireballs. Watch it
  through the telescope and among the meteors comes something far too slow,
  that turns: a craft coming in, glowing with the heat of the air it rams.
  The screen closes and you watch it come down in the forest to the west: the
  flash, the glow over the trees, and the boom two seconds later, because
  sound is slow.
- Starfall Clearing joins the map: scorched ground, the trees laid flat outward
  round it as at Tunguska in 1908, a smoking iridescent pod with its hatch
  open, and someone peeking at you from behind it.
- Zib: small, mint-green, three-eyed, with long ears whose tips glow.
  **SAY HELLO** and it greets you in prime numbers. **INVITE ALONG** and it
  floats at your shoulder, rides in the hot rod's passenger seat, turns its
  ears gold when a fish is coming to your line and red when a bear is near,
  and blinks back to you when you get far away. **WAIT HERE** and it waits.
  It has a story at the old saucer in the woods, likes the hot pool, and is
  worth a picture.

**Sound**

- The place sounds like itself, all of it synthesised: wind in two bands
  whose gusts are the same gusts that roll across the grass and bend the trees
  round you, leaves rustling in them under the trees and a whistle round the
  high ground; a river's low roar, its rush and its babble of bubbles, heard
  from the river's side of you; the falls; the sea's wash, waves breaking and
  the pebbles' hiss as they draw back; water lapping at a lake's shore; rain's
  hiss and patter, drips from the trees during and after it, and thunder far
  off in a downpour; mosquitoes whining round your head on the flats (bug dope
  helps).
- Birds sing as birds do: a few at a time, each from its own perch, singing its
  species' song over and over and then moving on. Varied, hermit and
  Swainson's thrushes, robins, chickadees, woodpeckers drumming and red
  squirrels scolding in the forest; white-crowned sparrows in the meadows;
  willow ptarmigan on the tundra; gulls and eagles on the shore; a dawn chorus,
  a quieter midday, an evening chorus, owls in the woods and loons on the
  lakes at night; few in the rain or a gale.
- Every sound from the world is placed: to its side, quieter and duller with
  distance (the air soaks up the highs), a little duller behind you, with a
  reverb that is thick under the trees and thin on the open tundra. Inside the
  car the outside goes dull; under water, duller still.
- Footsteps for every kind of ground: grass, the forest floor's needles and
  twigs, rock, crunching snow, sand, gravel, the gravel road, spongy tundra,
  ice, sucking mud, hollow boards and splashing shallows, never the same step
  twice running.

**World and graphics**

- Clear water you can see into: the bed, stones and fish are lit through the
  water with light absorbed along the way (clear green-blue in the river,
  tea-green in Moose Lake, milky turquoise in Glacier Lake, blue-green at sea),
  moving caustics on the bottom, a wet band at the waterline, fresnel
  reflections of the real surroundings, sun and moon glints, flowing waves and
  foam in the rapids.
- Lighting: sun shadows that reach about 250 metres, mountains that throw the
  valleys into shadow at dawn and dusk, darker gullies and forest floors, haze
  that thins with height and takes the colour of the sky, and leaves that glow
  when the sun is behind them. Steam, spray, mist and smoke take the light of
  the hour (dark at night, warm at dawn) and glow with a low sun
  behind them; Bear Falls and the geyser darken in a mountain's or a cloud's
  shadow; and the eye adapts, opening up a little under the trees and on grey
  days and closing down when you look into a low sun.
- Ground detail by surface: pebbles on gravel bars and river beds, layered rock
  on cliffs, sand and snow ripples and needles on the forest floor, with bump
  lighting. Curved grass blades in shades from lush green to dry straw,
  willow and alder along the water, ferns, fireweed and lupine, fallen logs,
  stumps, bleached driftwood and mossy boulders.
- Five kinds of tree, each in several shapes and sizes and detailed up close:
  white spruce, black spruce in the muskeg and on north slopes, paper birch,
  quaking aspen groves on sunny south slopes and balsam poplars along the
  rivers.
- Native ground plants: devil's club in the wet forest, blueberry and Labrador
  tea, cotton grass on the tundra, horsetail on the banks, skunk cabbage in the
  swamps and mushrooms on the forest floor.
- Mountains with rounded summits and rock bands, forest climbing their flanks
  to about 150 metres and snow on the high peaks (lower on the north faces), a
  steaming volcano across the inlet, a great snow massif to the north, clouds
  clinging to the summits and cascades pouring down the cliffs. The nearest
  ranges are modelled at 20-metre detail, and far away their steep faces get
  crags and gullies that hold shade and old snow.
- Bear Falls: the river runs to a lip and pours over it in two curved sheets,
  split into three falls by boulders, white as it drops, with a foam pool,
  wet rocks, spray and mist. The ground and water textures are at twice the
  resolution they were, so the ground stays sharp at your feet.
- Weather you can see on the land: cloud shadows drift over the meadows, the
  forest, the water and the far mountains (and when one covers you, a cloud
  hides the sun); gusts of wind roll across the grass in paler waves, bend the
  trees and ruffle the lakes; mist lies in the valleys and over the water at
  dawn, in the evening and after rain, with the peaks clear above it; after a
  shower the ground is dark and glossy, puddles in the flat hollows (most of
  all on the roads and gravel bars) mirror the sky and the trees, the low sun
  glints off the wet ground, and a rainbow can stand opposite the sun while
  the last rain falls.
- Insects: butterflies over the meadows, bumblebees on the fireweed,
  dragonflies over the shallows, mosquito swarms at dusk, moths round the lights
  at night, and cottonwood fluff drifting over the rivers.
- Things float: driftwood, spruce branches, leafy twigs and fallen fireweed ride
  the river current, petals and leaves float on the rivers and lakes, yellow
  pond lilies and pondweed cover the shallows of Moose Lake, and small ice floes
  drift on Glacier Lake.
- Day and night with sunrise and sunset, the real stars, planets and Moon,
  the northern lights, rain showers, a waterfall with mist, a glacier that calves slabs of
  ice into Glacier Lake with a boom and a wave, a lighthouse beam at night, and
  animals that react to where you are.
- 32 challenges with cash rewards guide you through the game, from "Catch your
  first fish at Hotrod Landing" through the boat, the springs, the wreck, the
  strange things in the woods, the night sky and the camera to "Complete the
  Fish Journal".
- Progress saves automatically.
- Graphics presets in Settings. High is the default (the game is made for
  iPhone 13 and newer) and adds a soft bloom on bright light, sun rays through
  the trees and ridges, a colour grade, the longest shadows and the densest
  forests. Medium and Low run cooler on older devices. The game lowers its
  resolution when frames run long and, unless you turn it off, steps the preset
  down if that is not enough. Settings can also show the frame rate.
- Steady frames: every shader is compiled, and every kind of thing drawn once
  into a single pixel, behind the loading bar (the sun rays too, which
  otherwise draw only with the sun in view), so the first bear, the boat, a
  building or the sun coming into view does not stall a frame (the graphics
  driver builds its programs on the first real draw); parts of models too far away to cover
  a pixel are left out of the frame and its shadows until they would; and the
  observatory's all-sky camera has plain glass, where its "transmission" glass
  made the whole scene draw twice whenever the observatory was in view.

## Controls

| Action | Touch (iPhone and iPad) | Keyboard and mouse |
|---|---|---|
| Walk | Drag on the left half of the screen | `W` `A` `S` `D`, hold `Shift` to jog |
| Run | **RUN** up under the small map (beside it on a phone on its side), clear of the thumb that walks: tap to run, tap again to walk | Hold `Shift` |
| Full screen | The four-corners button, first at the top right and in the corner of the title screen; tap it again to leave (on iPhone, see below) | The same button; `Esc` leaves |
| Look | Drag on the right half | Drag the mouse (click the view to lock the pointer) |
| Cast, hook, reel | Big orange button (**CAST** / **HOOK!** / **REEL**) | `Space` or left click |
| Draw and loose the longbow | Hold the big orange button (**DRAW**), let go to loose | Hold `Space` or the left mouse button, let go to loose |
| Steer the rod in a fight | Drag left or right on the left half | `A` / `D` |
| Aim the longbow (a closer view) | **AIM** | Right click |
| Switch tool: rod, longbow, camera, empty hands | Tool button | `Q`, or `1` `2` `4` `3` |
| Switch arrows | Tap the arrows chip in the top left | `T` |
| Camera: zoom and take a picture | **ZOOM** and **SNAP** | Right click or `Z`, and `Space` or left click |
| Bear spray / first aid kit | Buttons next to **DRAW** | `G` / `X` |
| Enter, trade, claim, sleep, soak | Context button (**DRIVE**, **TRADE**, **CLAIM**, **SLEEP**, **SOAK**) | `E` |
| The boat: launch, board, fish, step ashore, load | The second context button (**LAUNCH**, **BOARD**, **ASHORE**, **LOAD BOAT**) and **FISH** / **DRIVE** | `V` for the second button, `E` for the first |
| How the fish are biting | Tap **BITE** under the map button | |
| Wardrobe | T-shirt button at the top | |
| Keep or release a catch | **KEEP** / **RELEASE** on the catch card | `E` or `Enter` / `R` |
| Drive the hot rod or the boat | **GAS**, **BRAKE**, steer by dragging on the left half | `W` gas, `S` brake and reverse, `A` / `D` steer |
| Car camera / horn | Camera and horn buttons | `C` / `H` |
| Lures / map / journal / pause and save | **LURE** next to **CAST**; map, journal and pause at the top (or tap the small map) | `L` / `M` / `J` / `Esc` |

## Saving

The game saves by itself every 45 seconds and whenever you keep or release a
fish, trade at the Trading Post, sleep or rest at the cabin, travel, claim game
or find a new place. A **SAVED** note flashes under the clock each time. To
save right now, open the pause menu (the pause button at the top right, or `Esc`
on a keyboard) and choose **Save game**; **Save and return to title** saves and
leaves. Next time, choose **Continue** on the title screen.

Saves are stored on the device, in the browser you play in (or inside the iOS
app), so they don't carry over to another device or browser. Private browsing
or clearing the browser's website data removes them, and the game shows a
warning if the browser blocks saving.

## Play it

### In a browser

Open `dist/index.html` in Safari, Chrome, Edge or Firefox. It is completely
self-contained and also works straight from disk. The four-corners button at
the top right fills the screen, on a computer, an iPad or an Android phone;
`Esc` or the same button leaves full screen. Inside another page (an embedded
frame that does not allow full screen) the button says so instead.

### On an iPhone or iPad without Xcode

1. Install [Node.js](https://nodejs.org/en/download) on your computer.
2. In the repository folder run `npm run serve`. It prints an address such as
   `http://192.168.1.20:8080/`.
3. On the iPhone or iPad (same Wi-Fi network), open that address in Safari.
4. Tap the Share button (on iOS 26 it is in the **···** menu beside the
   address bar), then **Add to Home Screen**, and leave **Open as Web App** on
   ([Apple's guide](https://support.apple.com/guide/iphone/bookmark-favorite-webpages-iph42ab2f3a7/ios)).
   The game then opens full screen from its own icon, and your progress is kept
   on the device. This is the only way to fill an iPhone's screen: Safari on
   iPhone lets only videos go full screen, so the full-screen button there
   explains these steps instead.

### As a native iOS app

The `ios/` folder holds an Xcode project that wraps the game in a full-screen
WebKit view. The native side adds Taptic Engine haptics (bites, hook sets,
loosed arrows, bear hits and catches), keeps the screen awake while you play, locks
landscape, hides the status bar and home indicator, and keeps a native copy of
your save game.

1. On a Mac, install [Xcode](https://developer.apple.com/xcode/) 26 or newer
   (Apple requires Xcode 26 or later to upload iPhone and iPad apps to App Store
   Connect).
2. Open `ios/RubenHotrodFishing.xcodeproj`. The project, its folder and target
   keep the game's first name; the name under the icon is **Hotrod Alaska**
   (`CFBundleDisplayName` in `ios/RubenHotrodFishing/Info.plist`).
3. Select the **RubenHotrodFishing** target, open **Signing & Capabilities**,
   and choose your team (a free Apple ID works for your own devices). If Xcode
   says the bundle identifier is taken, change `se.rubenhotrod.fishing` to
   something unique, for example `se.yourname.hotrodfishing`.
4. Connect the iPhone or iPad, pick it as the run destination and press **Run**
   ([Apple's guide](https://developer.apple.com/documentation/xcode/running-your-app-in-simulator-or-on-a-device)).
   The first time, allow the developer certificate on the device under
   **Settings > General > VPN & Device Management**, and turn on
   **Developer Mode** when asked.

With a free Apple ID the installed app runs for seven days before it has to be
installed again from Xcode. To keep it longer, share it with TestFlight or
publish on the App Store you need the
[Apple Developer Program](https://developer.apple.com/programs/): 99 USD per
membership year, roughly 950 to 1 050 kr or 85 to 92 € depending on the
exchange rate. Apple shows the exact amount in your local currency when you
[enroll](https://developer.apple.com/programs/enroll/). See Apple's
[distribution guide](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases).

The app bundles the `dist` folder as it is, so run `npm run build` before
building in Xcode whenever you change the game's source.

Sound follows the iPhone's silent switch, like most games, so turn silent mode
off to hear the river, the V8 and the music.

## Publishing

[docs/publishing.html](docs/publishing.html) walks through every way to get
the game to players: sharing the claude.ai link, your own web address on the
Swedish host [statichost.eu](https://www.statichost.eu/) (this repository
already contains its `statichost.yml`), the European web game portals
[CrazyGames](https://www.crazygames.com/) and [Poki](https://poki.com/), and
the App Store step by step. Ready-made App Store screenshots for 6.9-inch
iPhones and 13-inch iPads are in [docs/appstore](docs/appstore), and the
privacy policy page Apple asks for is built to `dist/privacy.html` (the same
text is in the game under Settings, Privacy).

## Build from source

```sh
npm install
npm run build     # minified build: dist/index.html, manifest and icons
npm run dev       # unminified build with source maps
npm run serve     # serve dist/ on port 8080 for phones and tablets on your network
npm run icons     # redraw the app icons (needs Playwright, see below)
```

`npm run build` also writes `build/artifact.html`, a fragment of the same game
without the document wrapper, used for publishing it as a web page on claude.ai.

The announcer's voice is made ahead of time and kept in the repository
(`src/audio/voice-clips.js`), so a build needs nothing more. To make it again,
after changing a line in `src/audio/lines.js` or adding a fish, use Python 3.10
or newer and the model files from the
[kokoro-onnx releases](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0)
(`kokoro-v1.0.onnx` and `voices-v1.0.bin`):

```sh
python3 -m venv .venv && . .venv/bin/activate
pip install kokoro-onnx lameenc
node tools/voice/lines.mjs > tools/out/voice-lines.json
python3 tools/voice/make-voice.py tools/out/voice-lines.json kokoro-v1.0.onnx voices-v1.0.bin
```

A line without a recording is still said, in the device's own voice.

The only dependencies are [three.js](https://threejs.org/) for 3D rendering and
[esbuild](https://esbuild.github.io/) for bundling.

## Project layout

| Path | What it holds |
|---|---|
| `src/main.js` | Game session: title screen, start and continue, the per-frame gameplay loop, interactions, saving, fast travel and the debug hooks used by the tests |
| `src/game.js` | Engine core: renderer, scene, cameras, lights and shadows, dynamic resolution and the frame loop |
| `src/world/layout.js` | The peninsula: coastline, river, lakes, glacier, roads and the twelve places laid out with the world (the observatory, the Granite Tors and the Tesla Memorial join after it is made) |
| `src/world/areas.js` | Steaming Springs (the geyser, the hot pool, steam vents and mud pots), Mosquito Flats (the giant mosquito, the boardwalk, the bug dope machine) and Shipwreck Cove (the wreck, its deck, gangplank and sea chest, the sea stacks) |
| `src/world/worldgen.js` | Height field, river and lake carving, road grading, surface types and water queries |
| `src/world/terrain.js`, `worldtex.js` | Chunked terrain with levels of detail, the ground material with per-surface detail, and the world textures (height, colour, surfaces, water levels) |
| `src/world/worldfx.js` | Shading shared by every material: haze and valley mist, light under water with caustics, mountain and cloud shadows, sky occlusion, gusts of wind, and wet ground with puddles |
| `src/world/lighting.js` | The mountain shadow and sky visibility maps, computed on the graphics processor |
| `src/world/sky.js` | Sky dome with the sun, the real Moon and Milky Way, clouds, rainbows and northern lights, the cascaded sun shadows, the weather, and the day and night cycle |
| `src/world/astro.js` | The game's calendar and clock as a real date, sidereal time, and the Sun, Moon, planets and Jupiter's moons from astronomy-engine |
| `src/world/stars.js`, `skydata.js` | The 2,560 real stars and the planets as points of light, and the Milky Way's texture; `skydata.js` is packed by `tools/mkstars.mjs` |
| `src/world/spaceweather.js` | Each night's Kp index and the aurora's strength, reach, red tops and substorms |
| `src/world/meteors.js`, `satellites.js` | Shooting stars, fireballs and their meteorites; the space station's passes and the fainter satellites |
| `src/world/observatory.js` | The Tundra Observatory: the turning dome and its telescope, the radio dish, the hut, the deck chairs, the notice board, the mast and the all-sky camera |
| `src/world/solarwalk.js` | The scale model of the solar system along the Lighthouse Road |
| `src/world/tors.js`, `src/gameplay/climbing.js` | The Granite Tors: the granite blocks, the routes and their holds, the ropes, the tops, the register and the route board; and the climbing: reaching, grip, chalk, rests, falls, the top and lowering off |
| `src/world/tesla.js` | The Tesla Memorial at Bear Falls: the sculpted statue, the terrace, the coil house and its sparks, and Bear Falls Hydro |
| `src/world/scientistdata.js` | The 34 scientists: who they were, what they found, how they look and where they stand |
| `src/world/scientists.js` | The busts on their plinths: finding each a spot, the plinths, the plaques, the sculpting worker |
| `src/world/bustcore.js` | The bust sculptor: faces, hair, beards, glasses and clothes of their time, and the finish (no three.js) |
| `src/workers/sculpt.js` | The worker that sculpts the busts off the main thread (built separately and carried in the page as text) |
| `src/world/detailcull.js` | Leaves out of the frame the parts too far away to cover a pixel |
| `src/gameplay/science.js` | The science objectives and what each one teaches |
| `src/gameplay/visitor.js` | (spoilers) The meteor outburst, the craft's fall, Starfall Clearing and Zib |
| `src/util/sdfcore.js` | Sculpting with distance fields, and meshing them with surface nets a little at a time (no three.js, so a worker can run it) |
| `src/util/sdfmesh.js` | The sculpting's meshes as three.js geometry |
| `src/world/pitstop.js` | (spoilers) The race car's clearing at the end of the logging track, its props, and the tarp draped over the car |
| `src/world/water.js`, `effects.js`, `calving.js` | River, lake and sea surfaces with animated waves and reflections, the waterfall, splashes, ripples, rain, mist and dust, and the calving glacier |
| `src/world/scatter.js`, `grass.js`, `props.js`, `roads.js`, `colliders.js` | Forests, ground plants and rocks, wind-blown grass, where the buildings stand, bridges, trailhead signs and campfires, gravel roads and collision |
| `src/world/buildings.js` | The buildings in detail: Ruben's cabin, its yard, outhouse and mailbox, the Kenai Trading Post, Kachemak Light and the keeper's house, Halibut Pier and its bait shack, the lake docks and rowboats, the Bear Falls platform, the tundra lookout and the sign posts |
| `src/world/finish.js` | The surface finishes of wood, shingles, stone, concrete and corrugated metal: patterns drawn once at load and picked per vertex in the props' one material |
| `src/world/sites.js` | Where the cabin and the Trading Post stand, and the yards the world levels for them before the terrain is built |
| `src/world/scenery.js` | Volcano steam, clouds on the peaks and the cascades down the cliffs |
| `src/world/floaters.js` | Driftwood, branches, petals and leaves on the water, pond lilies, pondweed and ice floes |
| `src/world/post.js` | Bloom, sun rays and the colour grade of the High preset |
| `src/entities/insects.js` | Butterflies, bumblebees, dragonflies, mosquitoes, moths and cottonwood fluff |
| `src/entities/player.js`, `boat.js`, `viewmodel.js` | Walking, the fishing boat and its trailer, and the first-person rod, longbow and hands in the clothes from the wardrobe |
| `src/entities/car.js` | The driving model the cars share: grip, gears, engine revs, wading, the cameras and the colliders, set by each car's specification |
| `src/entities/hotrod.js`, `racecar.js` | The hot rod and (spoilers) the Formula One car: their models, materials, handling and animation |
| `src/entities/carparts.js` | Shape tools for the cars: lofted bodies, tubes, coils, turned parts, tyres and painted canvas textures |
| `src/entities/drivers.js` | The driver at the wheel: head, beard and hats or a helmet, body, arms that reach the rim and hands on it |
| `src/entities/hands.js`, `cloth.js` | The first-person hands with jointed fingers in their poses and the folded sleeves, and the shirts' cloth textures |
| `src/entities/glider.js` | The paraglider: launching from an edge, flying, steering, landing and the wing overhead |
| `src/world/secret.js` | The secret on the mountain (spoilers): Gus's launch, the cairns, the grotto on the ledge, the chest behind Bear Falls, the glint and the lanterns |
| `src/world/oddities.js` | The strange things in the woods (spoilers): where the ten stand, their models, and finding them, the ringing payphone, the humming, the wandering gnome, the fairy ring's luck and what each gives |
| `src/entities/wildlife.js`, `animalmodels.js`, `fishmodels.js`, `ambientfish.js` | Animal and bird behaviour and their low-poly models, the 31 fish models, and the fish schools you can see in the water |
| `src/gameplay/fishing.js` | Casting meter, float and bites, the fight, landing, the eagle, and catches |
| `src/gameplay/hunting.js`, `bears.js` | The longbow, the five kinds of arrow in flight and their hit zones, and the grizzly and black bear encounters |
| `src/gameplay/bite.js` | How hungry the fish are: time of day, fronts, rain, sunshine and the tide, and each species' own hours |
| `src/gameplay/camera.js` | The camera, the star rating of a shot and the photo album |
| `src/gameplay/skytargets.js`, `skywatch.js`, `tonight.js` | The telescope's and radio dish's targets and their notes, whether each can be reached right now and the sky log, and the night's almanac |
| `src/gameplay/data.js`, `state.js` | Fish, lures, rods, gear, places and challenges, and the save game |
| `src/audio/audio.js` | All sound and music, synthesised with the Web Audio interface |
| `src/audio/ambience.js` | The sound of the place: wind, water, rain, birds and other singers, footsteps, placed in space with a reverb |
| `src/audio/bake.js` | The ambience's textures, footsteps and reverb made ahead of time, a little a frame |
| `src/audio/announcer.js`, `lines.js` | The announcer's lines and their banners, said in the game's voice or, if Settings picks one, a device voice |
| `src/audio/voice.js`, `voice-clips.js` | The game's voice: every line and name as a small MP3 (made by `tools/voice`), decoded when first needed |
| `src/ui/` | HUD, the small map, menus, the Trading Post, garage, map and journal, the observatory's screens, touch and keyboard input, and styles |
| `src/ui/eyepiece.js`, `skyguide.js` | The telescope's eyepiece views, and the constellation figures and names drawn over the sky |
| `ios/` | The Xcode project for the native iOS app |
| `tools/shot.mjs`, `tools/scenarios/` | Headless screenshot and gameplay test harness with scripted scenarios |
| `tools/perf-tour.mjs`, `tools/perf-compare.mjs`, `tools/perf-stats.mjs`, `tools/first-frame.mjs`, `tools/load-compare.mjs`, `tools/shader-check.mjs`, `tools/cpu-by-thread.py` | Frame times along a scripted tour; two or more builds timed in turns in a balanced order, with the statistics that compare them; loading and the first frames of play, also for builds in turns; every shader built without an error on a development build; and one tour's processor time for every thread of the browser |
| `tools/make-icons.mjs`, `tools/serve.mjs`, `tools/preview-map.mjs` | Icon drawing, the local network server, and a top-down map preview of the world |
| `tools/mkstars.mjs` | Packs the stars, constellation figures, star names and Milky Way outline from the d3-celestial package into `src/world/skydata.js` |
| `tools/voice/` | Makes the announcer's voice: `lines.mjs` lists every line and name, `make-voice.py` speaks them with Kokoro and packs `src/audio/voice-clips.js` |
| `tools/cartest.mjs`, `tools/planetcheck.mjs`, `tools/almanactest.mjs`, `tools/skytables.mjs` | Checks run with Node alone: the cars' acceleration, top speed, braking and off-road speed; which planets the telescope can reach on each game day; the almanac for sample nights; and a table of the first fourteen nights |
| `tools/lab/handlab.mjs` | Renders the first-person hand poses from four sides, for checking them |

## Testing

`tools/shot.mjs` loads the built game in headless Chromium through
[Playwright](https://playwright.dev/), runs a scripted scenario and saves
screenshots to `tools/out/`. Scenarios drive the game through the `window.__rhf`
debug interface (`start`, `press`, `hold`, `tp`, `time`, `god`, `settle`, and
`data`, the fish tables, for checks that go through every species). Before
each screenshot the harness calls `settle`, which finishes the ground detail
around the camera: the software renderer draws about one frame a second, far
too slow for the game's two ground squares a frame after a jump. A headless
page also draws frames only while a screenshot is taken, so gameplay checks
step the game themselves (`__rhf.session.update(dt)`). Besides `eval`,
`wait` and `shot`, a step can `reload` the page (to continue from a save),
`waitFor` a condition in the page (a fade over, a show ended), polled on a
timer, or `drag` a finger across the screen, from coordinates or from an
expression in the page that works them out (the map check drags the full map
to bring a place into view before tapping it). Scenarios run without pointer
lock unless they set `"pointerLock": true`: the headless browser sends a
locked pointer a steady stream of mouse events, which pile up (gigabytes
within a minute) while a slow software frame holds the page. For example:

```sh
node tools/shot.mjs tools/scenarios/catch.json   # cast, hook, fight and land a fish, then open the journal, map and shop
node tools/shot.mjs tools/scenarios/hunt.json    # stalk caribou on the tundra with the longbow, then claim it
node tools/shot.mjs tools/scenarios/bear.json    # a grizzly charge, stopped with the longbow
node tools/shot.mjs tools/scenarios/bow.json     # draw, loose, a vital hit, picking up an arrow and switching tools
node tools/shot.mjs tools/scenarios/eagle.json   # a bald eagle steals a small fish
node tools/shot.mjs tools/scenarios/mobile.json  # phone-sized touch layout
node tools/shot.mjs tools/scenarios/catch-touch.json  # real taps on KEEP and RELEASE on a phone-sized touch screen
node tools/shot.mjs tools/scenarios/catch-mouse.json  # real clicks and keys on the catch card with the mouse locked to the view
node tools/shot.mjs tools/scenarios/catch-room.json   # every fish at its smallest and largest, and each legendary fish, held up beside the catch card on nine phone, tablet and desktop shapes: none under the card, off the screen or under the top bars, no sleeve end in sight (each line says PASS or FAIL)
node tools/shot.mjs tools/scenarios/reel-stuck.json   # a held REEL button always lets go, and nothing reels unless you press
node tools/shot.mjs tools/scenarios/line-stays.json   # a lure on the bank and a float in the current stay out until you hold REEL
node tools/shot.mjs tools/scenarios/fight-stays.json  # hooked fish at every fishing place: none comes closer unless you reel, and careful reeling lands them
node tools/shot.mjs tools/scenarios/timing-bar.json   # the timing bar and the throw line on a phone-sized screen, and where a tap in each zone sends the lure
node tools/shot.mjs tools/scenarios/ui-check.json     # phone layout: the small map clear of the buttons, RUN on and off, the full map, a tap on a lake, Bear Falls dragged into view and tapped, then the river
node tools/shot.mjs tools/scenarios/bears-arrows.json # bears leave you alone with an empty cooler, black bears, the arrow shop, the arrows chip, a whistler past a charging grizzly and an old save
node tools/shot.mjs tools/scenarios/announcer-bite.json # the bite readout at midday and at dawn with a front coming, its tap, the announcer's banners and the bite on the map
node tools/shot.mjs tools/scenarios/wardrobe.json     # the T-shirt button, buying and wearing clothes, the sleeves in first person, Ruben at the wheel, the save
node tools/shot.mjs tools/scenarios/camera.json       # buying the camera, the viewfinder on a moose, a three-star shot, the catch photo and the album
node tools/shot.mjs tools/scenarios/boat.json         # buying the boat, the trailer, LAUNCH, BOARD, driving, the chase camera, full gas at the bridge pier and at the lip of Bear Falls, fishing from the boat and LOAD BOAT
node tools/shot.mjs tools/scenarios/boat-falls.json   # the second half of boat.json on its own (the falls, fishing from the boat, LOAD BOAT): the software renderer can give out before the end of the long run
node tools/shot.mjs tools/scenarios/areas.json        # Steaming Springs with the geyser blowing and a soak past midnight, Bear Falls, Mosquito Flats, and Shipwreck Cove from the beach, the deck and the fishing spot on her stern
node tools/shot.mjs tools/scenarios/jobs-bigfoot.json # the odd jobs board, a picture of Bigfoot for the radio show, the cannery's three sockeye and the album
node tools/shot.mjs tools/scenarios/layout-ipad.json  # the top bar, compass and bite readout on an iPad-sized screen
node tools/shot.mjs tools/scenarios/layout-phone-small.json # the same on a small phone
node tools/shot.mjs tools/scenarios/layout-sizes.json # the top bar with the longest goal at fourteen screen sizes, from the first iPhone SE upright to a 1920-wide desktop, phones sideways with the notch and as started from the Home Screen: no overlaps, and RUN in the upper half
node tools/shot.mjs tools/scenarios/fullscreen.json   # the full-screen button on the title screen and in the game: in and out, its icon and label, the mouse left free, and Esc still pausing afterwards
node tools/shot.mjs tools/scenarios/fullscreen-iphone.json # an iPhone without the Fullscreen API: the note on the title screen and in the game, once however often you tap; then a browser that ignores the request, and one that refuses it
node tools/shot.mjs tools/scenarios/fullscreen-home.json   # started from the Home Screen: no full-screen button on the title screen or in the game, and its room given to the compass
node tools/shot.mjs tools/scenarios/top-buttons-touch.json # real taps on an imitated iPhone: each button at the top right opens its screen, the full-screen note, the bite readout, and RUN on and off
node tools/shot.mjs tools/scenarios/voice-pick.json   # the game's own voice: a line and a name, a personal best's fish, the music dipping while it talks, every recording decoded, a line stopped while it decodes staying silent, Settings, Voice through an imitated iPhone's voices, and old settings moving to the game's voice
node tools/shot.mjs tools/scenarios/bigfoot-forest.json # Bigfoot from deep in the forest at dusk: he only steps out where no tree or bush hides him
node tools/shot.mjs tools/scenarios/fish-species.json # lands each of the twelve newer fish, then shows the journal by rarity and the tackle box
node tools/shot.mjs tools/scenarios/secret.json       # (spoilers) the hidden chest from the bank and locked from the shelf, Gus's launch, TAKE PARAGLIDER and the edge with GLIDE
node tools/shot.mjs tools/scenarios/secret-flight.json   # (spoilers) GLIDE, three seconds in the air, the wing overhead, the rest of the flight to the ledge, the grotto and TAKE KEY
node tools/shot.mjs tools/scenarios/secret-treasure.json # (spoilers) the chest opened with the key, the Golden Spoon in the tackle box and not in the shop, the map, and the glimpses from the valley
node tools/shot.mjs tools/scenarios/secret-glimpse.json  # the glint on the summit from Hotrod Landing by day, through the 8x lens, and the lantern at night
node tools/shot.mjs tools/scenarios/buildings-1.json  # Ruben's cabin from the yard, at its porch steps, from behind and from the woodpile side
node tools/shot.mjs tools/scenarios/buildings-2.json  # a close look at the cabin's logs and shingles, the outhouse, and the Trading Post from the road and at its porch
node tools/shot.mjs tools/scenarios/buildings-3.json  # the Trading Post from the weigh station side, from behind, a close look at its stone basement and boards, and at night
node tools/shot.mjs tools/scenarios/buildings-4.json  # the bait shack and the deck of Halibut Pier, Kachemak Light and the keeper's house from its gate
node tools/shot.mjs tools/scenarios/buildings-5.json  # the keeper's house from the sea side, the tundra lookout, the Bear Falls platform and the Moose Lake dock with its rowboat
node tools/shot.mjs tools/scenarios/buildings-6.json  # Mosquito Flats and the wreck at Shipwreck Cove
node tools/shot.mjs tools/scenarios/perf-buildings.json # draw calls, triangles and frame time at the cabin, the Trading Post, Kachemak Light and Halibut Pier
node tools/shot.mjs tools/scenarios/oddities-1.json  # (spoilers) the fridge, the fairy ring, the crash site and Bigfoot's hut
node tools/shot.mjs tools/scenarios/oddities-2.json  # (spoilers) Ruben's first car, the payphone and the standing stones
node tools/shot.mjs tools/scenarios/oddities-3.json  # (spoilers) the Christmas tree, the gnome and the door in the tree
node tools/shot.mjs tools/scenarios/oddities-4.json  # (spoilers) the fairy ring, the Christmas tree and the stones at night
node tools/shot.mjs tools/scenarios/oddities-5.json  # (spoilers) the crash site and the door in the tree at night
node tools/shot.mjs tools/scenarios/oddities-6.json  # (spoilers) the hats and the paint before they are found, the tinfoil and Santa hats in the wardrobe, the Journal's list, and the hot rod in Barn-find Rust with Ruben in his Santa hat
node tools/shot.mjs tools/scenarios/fish-look-1.json # a King Salmon, a Rainbow Trout, a Dolly Varden and a Northern Pike held up close
node tools/shot.mjs tools/scenarios/fish-look-2.json # a Yelloweye Rockfish, an Arctic Grayling, a Pacific Halibut and a Coastal Cutthroat Trout held up close
node tools/shot.mjs tools/scenarios/minimap.json      # the small map on foot and driving, its goal marker, and a tap to the full map
node tools/shot.mjs tools/scenarios/hotrod-look.json  # the rebuilt hot rod from all round, its engine, its interior and the driver
node tools/shot.mjs tools/scenarios/hotrod-drive.json # the hot rod on the road from the cockpit and the chase camera, and its lights at night
node tools/shot.mjs tools/scenarios/racer-find.json   # (spoilers) the logging track, the tarp, PULL TARP and DRIVE
node tools/shot.mjs tools/scenarios/racer-look.json   # (spoilers) the race car from all round, onboard and on the road
node tools/shot.mjs tools/scenarios/arms.json         # the first-person arms with the rod, the bow, the draw, the paraglider and a fish held up
node tools/shot.mjs tools/scenarios/arms-rod.json     # the rod hand in different shirts and gloves
node tools/shot.mjs tools/scenarios/observatory.json  # the Tundra Observatory by day and at night, the telescope on Venus, the Sun and Jupiter, the radio dish and the almanac
node tools/shot.mjs tools/scenarios/telescope.json    # every telescope view at a time it is up, the radio dish (the pulsar and the hydrogen line), the almanac and the sky log
node tools/shot.mjs tools/scenarios/stargaze.json     # the dome open at night, STARGAZE from a deck chair with the sky guide to the north, south and east, and getting up
node tools/shot.mjs tools/scenarios/sky-events.json   # a fireball, the map's search circle, picking up the meteorite, a space station pass and its picture, a Kp 7 storm, the sky guide on foot, the solar system signs and the Journal's Sky page
node tools/shot.mjs tools/scenarios/fireball.json     # a fireball over the aurora (the gallery picture), the camera on it, shooting stars, a space station pass watched and photographed, and a survey of the skyline from the observatory's deck
node tools/shot.mjs tools/scenarios/gallery-cars.json # the title screen and the hot rod on the River Road for the pictures at the top of this page
node tools/shot.mjs tools/scenarios/climb-routes.json    # an automatic climber up all four routes: time, highest hold, lowest grip and falls
node tools/shot.mjs tools/scenarios/climb-roof-fall.json # a fall forced under the roof, climbing back on, and the top
node tools/shot.mjs tools/scenarios/climbing.json        # the start, under the roof, the top, the register and lowering off
node tools/shot.mjs tools/scenarios/tesla.json           # the Tesla Memorial: the statue, the terrace, the coil running, the board, the statue close up and the plant from across the river
node tools/shot.mjs tools/scenarios/outburst.json        # (spoilers) the meteor outburst through the telescope, the craft coming down and the flash
node tools/shot.mjs tools/scenarios/visitor.json         # (spoilers) Starfall Clearing, Zib, saying hello, Zib following and riding in the hot rod
node tools/shot.mjs tools/scenarios/visitor-checks.json  # (spoilers) Zib's bear warning and fish sense, the old saucer, the science log, saving and the Journal's Science page
node tools/shot.mjs tools/scenarios/round-smoke.json     # save and continue with the visitor's story, every screen opened, and the memorial's plaque, coil and board
node tools/shot.mjs tools/scenarios/sites-draws.json     # draw calls and triangles at the landing, the memorial, Starfall Clearing and the tors
node tools/shot.mjs tools/scenarios/review-fixes.json    # (spoilers) the code review's cases: Zib after a fast travel, no travel on the rope, driving to Starfall Clearing, a new game clearing the site, the shower view on another tab, continuing with Zib, and old saves' science
node tools/shot.mjs tools/scenarios/scientists.json      # the scientists' busts close up (bronze, dark bronze and marble), a plaque, the astronomers at the observatory, the plaque's note and the Journal's Scientists page
node tools/perf-tour.mjs [out.json] [--frames N] [--tally] [--noprofile] [--size WxH] [--dpr N] [--file index.html] # frame times along a scripted tour (standing, walking, driving, the memorial, the observatory at night), with the shaders compiled on the way, the draw calls by group (--tally), and a CPU and allocation profile; --file times another build
node tools/perf-compare.mjs old/index.html dist/index.html [--rounds N] [--frames N] [--size WxH] [--dpr N] # two or more builds' tours taking turns over several rounds in a balanced order, and each build's difference from the first with a 95% interval
node tools/audio-tour.mjs [outdir] [--secs N]            # the sound at nine places, hours and weathers and a walk over four grounds: loudness, balance of lows, mids and highs, the beds sounding and the birds singing, and a WAV of each
node tools/shot.mjs tools/scenarios/busts-save.json     # plaques read, saved, reloaded and continued, the Journal's Scientists page, and the ten-plaque objective
node tools/cull-compare.mjs [index.html]                 # the same view with and without leaving out the parts smaller than a pixel, compared pixel by pixel, on the Coast Road and at Hotrod Landing
node tools/first-frame.mjs [index.html]                  # loading time, the first frames after New game and the shaders built after loading, for this build or an older one
node tools/load-compare.mjs old/index.html dist/index.html [--rounds N] [--out dir] # two or more builds opened in turns in a balanced order: the time until the game is ready, New game, and the first three frames, each with a 95% interval
node tools/shader-check.mjs dev/index.html             # on a development build (node build.mjs --dev): every shader built at High, Medium and Low, at morning, sunset, night and in rain, and any that fail to compile with their error
python3 tools/cpu-by-thread.py dist/index.html out.json [--size WxH --dpr N] # one tour's processor time for every thread of the browser (the page's main thread, the software renderer's workers, the sound threads): more work, or only more waiting (Linux)
node tools/shot.mjs tools/scenarios/sky-night.json    # the real night sky to the north, south, east and overhead, and the Moon
node tools/shot.mjs tools/scenarios/water-views.json  # the water at every fishing spot
node tools/shot.mjs tools/scenarios/fish-views.json   # fish schools, a fish approaching the float and the fight
node tools/shot.mjs tools/scenarios/light-views.json  # morning, noon, evening, sunset and night lighting
node tools/shot.mjs tools/scenarios/light-compare.json # steam against a low sun and at night, Old Faceful at dusk, Bear Falls in the evening, and the forest at noon with and without the eye adapting
node tools/shot.mjs tools/scenarios/before-after.json # Bear Falls and three mountain views, for comparing with an older build
node tools/shot.mjs tools/scenarios/perf-new-places.json # draw calls, triangles and frame time at the three new places
node tools/shot.mjs tools/scenarios/animals.json      # poses each of the newer animals and birds in front of the camera
node tools/shot.mjs tools/scenarios/trees.json        # balsam poplar, quaking aspen, black spruce and coastal spruce up close
node tools/shot.mjs tools/scenarios/plants.json       # the native ground plants up close
node tools/shot.mjs tools/scenarios/vistas.json       # the volcano, the snow massif, the glacier and a cascade
node tools/shot.mjs tools/scenarios/insects.json      # butterflies, bees and dragonflies by day, mosquitoes at dusk, moths at night
node tools/shot.mjs tools/scenarios/floaters.json     # driftwood and branches on the river, pond lilies, ice floes
node tools/shot.mjs tools/scenarios/post.json         # bloom, sun rays and the colour grade, with and without
node tools/shot.mjs tools/scenarios/mountains.json    # Mount Ruben, the tundra and Sawtooth Ridge: gentler slopes and the higher tree line
node tools/shot.mjs tools/scenarios/tricks.json       # cloud shadows, valley mist, wet ground and puddles, a rainbow and gusts of wind
node tools/shot.mjs tools/scenarios/travel-lod.json   # after a fast travel the ground has its full detail as the fade lifts
node tools/shot.mjs tools/scenarios/perf-breakdown.json  # draw calls and triangles per rendering pass
node tools/shot.mjs tools/scenarios/perf-views.json   # draw calls, triangles and frame time at eight places (perf-views-medium.json for Medium)
node tools/shot.mjs tools/scenarios/gfx-views.json    # fifteen fixed views for comparing the look of two builds (without cloud shadows, which drift with the clock, and with the water's reflection made afresh for each view): the landing in the morning, the river at noon, the forest, the tundra at dusk, Moose Lake at sunset, Bear Falls, night, two mountain views, an aspen, a black bear, a moose, the hot rod, the hands with the rod and the Trading Post
node tools/shot.mjs tools/scenarios/gfx-budget.json   # what the graphics cost: draw calls (and those of the still world, apart from the animals and other things that move about at random) and triangles at eight places, the textures the materials use and their size, the renderer's textures, geometries and shader programs, and the script's memory
node tools/shot.mjs tools/scenarios/perf-tricks.json  # rendering time and draws at eight places with the weather effects off, on and soaked
node tools/shot.mjs tools/scenarios/fps-readout.json  # the frame rate readout, the automatic step-down and its switch
node tools/shot.mjs tools/scenarios/shader-switches.json  # counts shader variant switches per frame (0 when nothing flips back and forth)
node tools/shot.mjs tools/scenarios/shade-debug.json  # saves the mountain shadow and sky visibility maps as an image
node tools/shot.mjs tools/scenarios/refl-debug.json   # saves the six faces of the water reflection cube as an image
```

Playwright is not a project dependency; install it with `npm install --no-save playwright`
and `npx playwright install chromium` when you want to run these.

To compare two builds' frame times, use `tools/perf-compare.mjs` rather than one
tour of each: on the test machine a run's place in a sequence can move its
average frame by as much as the differences worth finding. The tool runs
every build once in every place of a round, reads the differences within
rounds with the place taken out, and gives a 95% interval; a difference
counts only when its interval leaves out zero. The machine's own speed also
changes from one session to the next, so a difference found once is worth
making again before it is believed, and `tools/cpu-by-thread.py` tells
whether a slower build does more work or only waits longer.

Three checks need only Node:

```sh
node tools/cartest.mjs      # both cars on the River Road: 0-100 km/h, top speed, a lap's average, braking and the forest floor
node tools/planetcheck.mjs  # each planet's highest point by day and by night, 12 degrees or more from the Sun (as the telescope requires), every third game day
node tools/almanactest.mjs  # the observatory's almanac for five sample nights
node tools/skytables.mjs    # the first fourteen nights: Kp, the Moon, the tides, the space station's pass and the planets
```

## Credits and licences

- 3D rendering: [three.js](https://threejs.org/), MIT licence
  ([licence text](https://github.com/mrdoob/three.js/blob/dev/LICENSE)).
- Fonts, embedded in the build:
  [Barlow Condensed](https://fonts.google.com/specimen/Barlow+Condensed) by
  Jeremy Tribby and [Shrikhand](https://fonts.google.com/specimen/Shrikhand) by
  Jonny Pinhorn, both under the [SIL Open Font License 1.1](https://openfontlicense.org/);
  [Yellowtail](https://fonts.google.com/specimen/Yellowtail) by Astigmatic,
  under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
- Bundling: [esbuild](https://esbuild.github.io/), MIT licence.
- The positions of the Sun, the Moon, the planets and Jupiter's moons:
  [Astronomy Engine](https://github.com/cosinekitty/astronomy) by Don Cross,
  MIT licence.
- The stars, constellation figures and names and the Milky Way's outline:
  [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn, BSD
  3-Clause licence; its stars come from the Extended Hipparcos Compilation
  (Anderson and Francis 2012,
  [Astronomy Letters 38, 331](https://doi.org/10.1134/S1063773712050015)).
- The solar system walk is inspired by the
  [Sweden Solar System](https://www.swedensolarsystem.se/), the world's largest
  scale model of the solar system.
- The announcer's voice: spoken by the
  [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) speech model by hexgrad
  (voice `af_heart`), Apache License 2.0, run with
  [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) (MIT licence) and
  encoded with [LAME](https://lame.sourceforge.io/) through
  [lameenc](https://github.com/chrisstaite/lameenc). Only the recordings ship
  with the game, not the model.
- Everything else (world, models, textures, animation, sound, music and the app
  icon) is original and generated by the code in this repository.
