# turkey
Turkey vacation

## Türkiye in Sixty Seconds

`index.html` is a 60-second animation of the history of Türkiye, from Göbekli Tepe (around 9600 BCE) to the Republic, modern Istanbul and a sunrise over Cappadocia. It ends with *İyi yolculuklar!* ("Have a wonderful trip").

Open `index.html` in any browser. Nothing else is needed: every scene, the map and the flag are drawn in code with the Canvas 2D API, and the music is synthesised live with the Web Audio API, with no images, audio files, fonts, libraries or network requests.

- The loop lasts exactly 60 seconds and restarts.
- Tap or click anywhere to turn the sound on or off (browsers only allow sound after an interaction). The M key does the same.
- Space pauses and resumes. The left and right arrow keys jump between chapters.
- The layout adapts to landscape and portrait screens. With "reduce motion" switched on in the operating system, the camera cuts between chapters instead of panning.

Chapters: Göbekli Tepe · Çatalhöyük · the Hittites · Troy · Lydia · Alexander the Great · Constantinople and Hagia Sophia · Manzikert · the Ottomans and 1453 · Süleyman the Magnificent · Gallipoli · the Republic · the Bosphorus Bridge and "Türkiye" · Cappadocia today.

### The music

The score runs at 120 beats per minute and every chapter arrives on a beat. It is locked to the picture: while sound is on, the animation follows the audio clock.

| Chapter | What you hear |
|---|---|
| Prologue | A ney flute rises through the Hicaz makam (D, E♭, F♯, G, A) over a drone: the "sunrise" theme |
| Göbekli Tepe | A heartbeat on the frame drum, a crackling fire, a low flute |
| Çatalhöyük, the Hittites, Troy | Frame drums and a plucked lyre; a galloping rhythm for the Hittite chariots; the Dorian mode for Troy |
| Lydia | Each falling coin rings a note of the Lydian mode, which is named after Lydia |
| Alexander the Great | A march; brass swells as the front ranks lower their pikes |
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
