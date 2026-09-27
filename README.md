# turkey
Turkey vacation

## Türkiye Through Time

`index.html` is an animation of the history of Türkiye, with music, from Göbekli Tepe (around 9600 BCE) through Adana and Kastabala to the Republic, modern Istanbul and a sunrise over Cappadocia. It ends with *İyi yolculuklar!* ("Have a wonderful trip").

Open `index.html` in any browser (keep `turkey-animation.js` in the same folder; the page loads the animation from it). Nothing else is needed: every scene, the map and the flag are drawn in code with the Canvas 2D API, and the music is synthesised live with the Web Audio API, with no images, audio files, fonts, libraries or network requests.

- The loop lasts 2 minutes 20 seconds and restarts. Each chapter holds for 5½ to 7½ seconds, long enough to read its caption and watch the scene.
- Tap or click anywhere to turn the sound on or off (browsers only allow sound after an interaction). The M key does the same.
- Space pauses and resumes. The left and right arrow keys jump between chapters.
- The layout adapts to landscape and portrait screens. With "reduce motion" switched on in the operating system, the camera cuts between chapters instead of panning.

Chapters: Göbekli Tepe · Çatalhöyük · the Hittites · Troy · Lydia · Alexander the Great · Adana and its Roman Stone Bridge · Hierapolis-Kastabala · Constantinople and Hagia Sophia · Manzikert · the Ottomans and 1453 · Süleyman the Magnificent · Gallipoli · the Republic · the Bosphorus Bridge and "Türkiye" · Cappadocia today.

### The music

The score runs at 96 beats per minute and every chapter arrives on a beat. It is locked to the picture: while sound is on, the animation follows the audio clock.

| Chapter | What you hear |
|---|---|
| Prologue | A ney flute rises through the Hicaz makam (D, E♭, F♯, G, A) over a drone: the "sunrise" theme |
| Göbekli Tepe | A heartbeat on the frame drum, a crackling fire, a low flute |
| Çatalhöyük, the Hittites, Troy | Frame drums and a plucked lyre; a galloping rhythm for the Hittite chariots; the Dorian mode for Troy |
| Lydia | Each falling coin rings a note of the Lydian mode, which is named after Lydia |
| Alexander the Great | A march; brass swells as the front ranks lower their pikes |
| Adana | A flowing lyre and a ney over the Seyhan, as travellers cross the Stone Bridge |
| Kastabala | A fire rite: frame drum in 3 + 3 + 2, crackling embers and voices in the Kürdi mode as the priestesses of Artemis Perasia cross the coals |
| New Rome | A Byzantine-style chant over a held note; a bell sounds as Hagia Sophia's dome is completed |
| Manzikert | A saz ostinato in the Hicaz makam over a davul |
| The Ottomans | A mehter band (zurnas, davul, cymbals); the bombard fires on the downbeat |
| Süleyman the Magnificent | Ney and kanun at dusk |
| Gallipoli | A lament in the rain; each warship's gun is heard a beat after its flash |
| The Republic | A brass fanfare as the flag rises, then a march |
| Today's Istanbul | An electronic pulse under a Hicaz arpeggio |
| Cappadocia | The sunrise theme returns and comes home to D major, with bells for *İyi yolculuklar!* |

The plucked strings use the Karplus–Strong method; the reverb, drums, choir, bells and wind instruments are all built from oscillators, filters and generated noise.

The sources for every date in the captions are listed in a comment at the top of `index.html`.

## The Story of Türkiye (long read)

`history.html` is an interactive long read on the history of Türkiye in 18 sections, from Göbekli Tepe to 2023, with a travellers' guide at the end. It has about 16,400 words, roughly 71 minutes at 230 words a minute. Open it in a browser with `turkey-animation.js` in the same folder.

- **Scenes that follow the text.** The animation above runs in a panel beside the text (above it on a phone) and switches to the matching scene as you read. Some paragraphs switch it too, for example to Kastabala or to Constantinople. *Play the whole film* runs the full 2 minutes 20 seconds with music; *Hide scenes* folds the panel away.
- **Timeline.** Every date in the text is on a timeline scaled so that the deep past is compressed. The section you are reading is highlighted. Hover over a dot for its label, or click it to jump to that section.
- **Map.** In the last section, a map pins every place mentioned on the page, 55 in all, with filters by era. Each pin opens a short note, says what a visitor can see today and links back to the section.
- **A quiz question per section,** with your score kept at the end of the page.
- **Reading aids:** a progress bar, the minutes left, finished sections ticked in the contents, and a *Continue* button that takes you back to where you stopped. All of this is stored in your browser only.
- **Sources.** Every paragraph links to a source, and every section lists all of its sources.

### How it is built

- The text lives in `content/history.json`.
- `python3 tools/build_history.py` turns it into `history.html`.
- `python3 tools/build_history.py --artifact PATH` also writes a self-contained copy with the animation code included in the file.
- The standalone film and the long read share the same engine, `turkey-animation.js`. The long read runs it in embedded mode: it sets `window.TURKEY_OPTIONS` and calls `window.turkeyAnimation`.

Most sources were found with web searches. Where the search allowance ran out, sections were written from facts already checked and from peer-reviewed papers found with the [Consensus](https://consensus.app/) academic search engine. A few periods are covered only in outline for that reason:

- the Ottoman conquests between Osman and 1453;
- the campaigns of 1920–1922;
- early Christianity in the Roman section;
- events after 2023.
