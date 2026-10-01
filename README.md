# Hotrod Outdoor Alaska Fishing

A first-person fishing and hunting adventure in Alaska, made for iPhone and iPad.
Drive Ruben's flame-painted hot rod between twelve places on a wild Alaskan
peninsula, tow a fishing boat to any lake, river or the bay, cast with a timing
bar, fight salmon and halibut, hunt caribou and moose with a longbow, take
pictures of the wildlife, and keep your bow close: grizzlies smell the fish in
your cooler.

![Title screen](docs/screenshots/title.jpg)

Everything you see and hear is generated in code at start-up: the terrain,
rivers, glacier, forests, animals, the hot rod, the fish, the sky, the weather,
the sound effects and the music. There are no downloaded models, textures or
audio files, so the whole game is a single 1.2 MB HTML file (about 420 KB
compressed).

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

What changed in the latest round, with pictures, the audit and the tests:
[docs/hotrod-update.html](docs/hotrod-update.html). The earlier graphics rounds:
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
  bright midday sun and go quiet at night; on the sea the tide matters, and
  every species keeps its own hours (kings at dawn, pike in the midday sun,
  halibut on a running tide, burbot at night). The **BITE** readout under the
  map button says SLOW, FAIR, GOOD or HOT; tap it to hear why. The map shows
  the bite at each place and when each fish bites best.
- An announcer calls the big moments, in a voice and in big arcade letters:
  **FISH ON!**, **IT THREW THE HOOK!**, **OH NO, THE HOOK CAME OFF!**, **SNAP!
  THE LINE BROKE!**, **NEW SPECIES! NORTHERN PIKE!**, **PERSONAL BEST!**,
  **LEGENDARY!** and **THE BITE IS ON!** The voice can be switched off in
  Settings.
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

- Twelve places joined by gravel roads and truss bridges: Hotrod Landing
  (Ruben's cabin), Kenai Trading Post, Salmon Bend, Bear Falls, Glacier Lake,
  Moose Lake, Halibut Pier, Caribou Tundra, Kachemak Light and three newer ones:
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
- The full map fills the screen: drag it, pinch or use the buttons to zoom,
  and tap a place, or the lake, river or sea it fishes, to see what lives there
  (only at places you have been to), the bite there right now and when each
  fish bites best.
- A wardrobe behind the T-shirt button at the top: shirts (flannels, denim, a
  hoodie, camo, hi-vis, a Hawaiian shirt and a Hotrod racing jacket), hats
  (caps, a beanie, a bucket hat, a cowboy hat and a moose antler hat), beards
  and moustaches, hair colour, skin tone and gloves. You see your sleeves and
  gloves in first person, and Ruben at the wheel wears it all.
- Fast travel from the map to any place you have already discovered (the trip
  costs in-game time), and sleep at the cabin to skip the night.

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
- Day and night with sunrise and sunset, stars, the moon and the northern
  lights, rain showers, a waterfall with mist, a glacier that calves slabs of
  ice into Glacier Lake with a boom and a wave, a lighthouse beam at night, and
  animals that react to where you are.
- 25 challenges with cash rewards guide you through the game, from "Catch your
  first fish at Hotrod Landing" through the boat, the springs, the wreck and
  the camera to "Complete the Fish Journal".
- Progress saves automatically.
- Graphics presets in Settings. High is the default (the game is made for
  iPhone 13 and newer) and adds a soft bloom on bright light, sun rays through
  the trees and ridges, a colour grade, the longest shadows and the densest
  forests. Medium and Low run cooler on older devices. The game lowers its
  resolution when frames run long and, unless you turn it off, steps the preset
  down if that is not enough. Settings can also show the frame rate.

## Controls

| Action | Touch (iPhone and iPad) | Keyboard and mouse |
|---|---|---|
| Walk | Drag on the left half of the screen | `W` `A` `S` `D`, hold `Shift` to jog |
| Run | **RUN** on the left: tap to run, tap again to walk | Hold `Shift` |
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
self-contained and also works straight from disk.

### On an iPhone or iPad without Xcode

1. Install [Node.js](https://nodejs.org/en/download) on your computer.
2. In the repository folder run `npm run serve`. It prints an address such as
   `http://192.168.1.20:8080/`.
3. On the iPhone or iPad (same Wi-Fi network), open that address in Safari.
4. Tap the Share button, then **Add to Home Screen**
   ([Apple's guide](https://support.apple.com/guide/iphone/bookmark-favorite-webpages-iph42ab2f3a7/ios)).
   The game then opens full screen from its own icon, and your progress is kept
   on the device.

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

The only dependencies are [three.js](https://threejs.org/) for 3D rendering and
[esbuild](https://esbuild.github.io/) for bundling.

## Project layout

| Path | What it holds |
|---|---|
| `src/main.js` | Game session: title screen, start and continue, the per-frame gameplay loop, interactions, saving, fast travel and the debug hooks used by the tests |
| `src/game.js` | Engine core: renderer, scene, cameras, lights and shadows, dynamic resolution and the frame loop |
| `src/world/layout.js` | The peninsula: coastline, river, lakes, glacier, roads and the twelve places |
| `src/world/areas.js` | Steaming Springs (the geyser, the hot pool, steam vents and mud pots), Mosquito Flats (the giant mosquito, the boardwalk, the bug dope machine) and Shipwreck Cove (the wreck, its deck, gangplank and sea chest, the sea stacks) |
| `src/world/worldgen.js` | Height field, river and lake carving, road grading, surface types and water queries |
| `src/world/terrain.js`, `worldtex.js` | Chunked terrain with levels of detail, the ground material with per-surface detail, and the world textures (height, colour, surfaces, water levels) |
| `src/world/worldfx.js` | Shading shared by every material: haze and valley mist, light under water with caustics, mountain and cloud shadows, sky occlusion, gusts of wind, and wet ground with puddles |
| `src/world/lighting.js` | The mountain shadow and sky visibility maps, computed on the graphics processor |
| `src/world/sky.js` | Sky dome with sun, moon, stars, clouds, rainbows and northern lights, the cascaded sun shadows, the weather, and the day and night cycle |
| `src/world/water.js`, `effects.js`, `calving.js` | River, lake and sea surfaces with animated waves and reflections, the waterfall, splashes, ripples, rain, mist and dust, and the calving glacier |
| `src/world/scatter.js`, `grass.js`, `props.js`, `roads.js`, `colliders.js` | Forests, ground plants and rocks, wind-blown grass, buildings, bridges, the pier and lighthouse, gravel roads and collision |
| `src/world/scenery.js` | Volcano steam, clouds on the peaks and the cascades down the cliffs |
| `src/world/floaters.js` | Driftwood, branches, petals and leaves on the water, pond lilies, pondweed and ice floes |
| `src/world/post.js` | Bloom, sun rays and the colour grade of the High preset |
| `src/entities/insects.js` | Butterflies, bumblebees, dragonflies, mosquitoes, moths and cottonwood fluff |
| `src/entities/player.js`, `hotrod.js`, `boat.js`, `viewmodel.js` | Walking, the drivable hot rod, the fishing boat and its trailer, and the first-person rod, longbow and hands in the clothes from the wardrobe |
| `src/entities/wildlife.js`, `animalmodels.js`, `fishmodels.js`, `ambientfish.js` | Animal and bird behaviour and their low-poly models, the 28 fish models, and the fish schools you can see in the water |
| `src/gameplay/fishing.js` | Casting meter, float and bites, the fight, landing, the eagle, and catches |
| `src/gameplay/hunting.js`, `bears.js` | The longbow, the five kinds of arrow in flight and their hit zones, and the grizzly and black bear encounters |
| `src/gameplay/bite.js` | How hungry the fish are: time of day, fronts, rain, sunshine and the tide, and each species' own hours |
| `src/gameplay/camera.js` | The camera, the star rating of a shot and the photo album |
| `src/gameplay/data.js`, `state.js` | Fish, lures, rods, gear, places and challenges, and the save game |
| `src/audio/audio.js` | All sound and music, synthesised with the Web Audio interface |
| `src/audio/announcer.js` | The announcer's lines, spoken with the device's speech synthesis, and their banners |
| `src/ui/` | HUD, the small map, menus, the Trading Post, garage, map and journal, touch and keyboard input, and styles |
| `ios/` | The Xcode project for the native iOS app |
| `tools/shot.mjs`, `tools/scenarios/` | Headless screenshot and gameplay test harness with scripted scenarios |
| `tools/make-icons.mjs`, `tools/serve.mjs`, `tools/preview-map.mjs` | Icon drawing, the local network server, and a top-down map preview of the world |

## Testing

`tools/shot.mjs` loads the built game in headless Chromium through
[Playwright](https://playwright.dev/), runs a scripted scenario and saves
screenshots to `tools/out/`. Scenarios drive the game through the `window.__rhf`
debug interface (`start`, `press`, `hold`, `tp`, `time`, `god`, `settle`). Before
each screenshot the harness calls `settle`, which finishes the ground detail
around the camera: the software renderer draws about one frame a second, far
too slow for the game's two ground squares a frame after a jump. For example:

```sh
node tools/shot.mjs tools/scenarios/catch.json   # cast, hook, fight and land a fish, then open the journal, map and shop
node tools/shot.mjs tools/scenarios/hunt.json    # stalk caribou on the tundra with the longbow, then claim it
node tools/shot.mjs tools/scenarios/bear.json    # a grizzly charge, stopped with the longbow
node tools/shot.mjs tools/scenarios/bow.json     # draw, loose, a vital hit, picking up an arrow and switching tools
node tools/shot.mjs tools/scenarios/eagle.json   # a bald eagle steals a small fish
node tools/shot.mjs tools/scenarios/mobile.json  # phone-sized touch layout
node tools/shot.mjs tools/scenarios/catch-touch.json  # real taps on KEEP and RELEASE on a phone-sized touch screen
node tools/shot.mjs tools/scenarios/catch-mouse.json  # real clicks and keys on the catch card with the mouse locked to the view
node tools/shot.mjs tools/scenarios/reel-stuck.json   # a held REEL button always lets go, and nothing reels unless you press
node tools/shot.mjs tools/scenarios/line-stays.json   # a lure on the bank and a float in the current stay out until you hold REEL
node tools/shot.mjs tools/scenarios/fight-stays.json  # hooked fish at every fishing place: none comes closer unless you reel, and careful reeling lands them
node tools/shot.mjs tools/scenarios/timing-bar.json   # the timing bar and the throw line on a phone-sized screen, and where a tap in each zone sends the lure
node tools/shot.mjs tools/scenarios/ui-check.json     # phone layout: the small map clear of the buttons, RUN on and off, the full map and a tap on a lake and the river
node tools/shot.mjs tools/scenarios/bears-arrows.json # bears leave you alone with an empty cooler, black bears, the arrow shop, the arrows chip, a whistler past a charging grizzly and an old save
node tools/shot.mjs tools/scenarios/announcer-bite.json # the bite readout at midday and at dawn with a front coming, its tap, the announcer's banners and the bite on the map
node tools/shot.mjs tools/scenarios/wardrobe.json     # the T-shirt button, buying and wearing clothes, the sleeves in first person, Ruben at the wheel, the save
node tools/shot.mjs tools/scenarios/camera.json       # buying the camera, the viewfinder on a moose, a three-star shot, the catch photo and the album
node tools/shot.mjs tools/scenarios/boat.json         # buying the boat, the trailer, LAUNCH, BOARD, driving, the chase camera, full gas at the bridge pier and at the lip of Bear Falls, fishing from the boat and LOAD BOAT
node tools/shot.mjs tools/scenarios/areas.json        # Steaming Springs with the geyser blowing and a soak past midnight, Bear Falls, Mosquito Flats, and Shipwreck Cove from the beach, the deck and the fishing spot on her stern
node tools/shot.mjs tools/scenarios/jobs-bigfoot.json # the odd jobs board, a picture of Bigfoot for the radio show, the cannery's three sockeye and the album
node tools/shot.mjs tools/scenarios/layout-ipad.json  # the top bar, compass and bite readout on an iPad-sized screen
node tools/shot.mjs tools/scenarios/layout-phone-small.json # the same on a small phone
node tools/shot.mjs tools/scenarios/layout-sizes.json # the top bar with the longest goal at ten screen sizes, phones upright and sideways (with the notch), iPads and desktops
node tools/shot.mjs tools/scenarios/bigfoot-forest.json # Bigfoot from deep in the forest at dusk: he only steps out where no tree hides him
node tools/shot.mjs tools/scenarios/fish-species.json # lands each of the twelve newer fish, then shows the journal by rarity and the tackle box
node tools/shot.mjs tools/scenarios/minimap.json      # the small map on foot and driving, its goal marker, and a tap to the full map
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
node tools/shot.mjs tools/scenarios/perf-tricks.json  # rendering time and draws at eight places with the weather effects off, on and soaked
node tools/shot.mjs tools/scenarios/fps-readout.json  # the frame rate readout, the automatic step-down and its switch
node tools/shot.mjs tools/scenarios/shader-switches.json  # counts shader variant switches per frame (0 when nothing flips back and forth)
node tools/shot.mjs tools/scenarios/shade-debug.json  # saves the mountain shadow and sky visibility maps as an image
node tools/shot.mjs tools/scenarios/refl-debug.json   # saves the six faces of the water reflection cube as an image
```

Playwright is not a project dependency; install it with `npm install --no-save playwright`
and `npx playwright install chromium` when you want to run these.

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
- Everything else (world, models, textures, animation, sound, music and the app
  icon) is original and generated by the code in this repository.
