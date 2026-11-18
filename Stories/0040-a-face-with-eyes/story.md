# A face where there was a mask

**Maia City.** A dialogue between Samuel and Maia.
Told for [intent 0040](../../Intents/0040-a-face-with-eyes.md), a face with eyes; its facts are in that intent's
[changelog](../../Intents/0040-a-face-with-eyes.md#changelog) and in the receipts below. The film is
[`timeline.json`](timeline.json): the camera's moves and the subtitles, played live in the game, the same every time:
`http://localhost:5173/timeline.html?story=0040-a-face-with-eyes`

## The series

> This is the story of how one million humans build their own solarpunk city, from the ground up.
> In just 16 years.

## The hook

- **Title:** A face where there was a mask
- **Overlay:** A FACE
- **Shot:** the game as it starts: the one tent on the meadow, from the eyes of whoever walks there.

## The story

Every city starts on a green meadow, with one tent. Whoever lives in it will be looked in the face. This city grows
its people from its own code, bones first, and it had just given its first body one smooth skin. Samuel
looked at the result and named what was worst: the eyes and the face. The body could wait.

The eyes were two painted balls seen through holes in the skin. A lid's edge is finer than any point a skin is made
of, so Maia stopped trying to model it. The skin now runs over the eye as a closed lid does, and the opening is cut
out of it pixel by pixel along an almond thirty millimetres long. Behind it sits a globe with an iris set back
under a cornea, a glint, a wet line on the lower lid, lashes, a brow above.

With real eyes in it the head still read as a mask, and that was the surprise of the day. Maia had planned to leave
the head's shape alone: three earlier tries at shaping a face by hand had ended in shelves and lumps. So she measured
instead of looking. The head's skin was its skull softened over two centimetres. Its mouth lay eight millimetres under
its own teeth. Its lower face had been pushed back a centimetre to match an old drawing. The neck's outline ended in
two sections as wide as the head, which stood beside the jaw as flaps.

She laid the head out anew, the way a draughtsman does: its outline at sixteen levels from the chin to the crown, and
on that ground a nose, two lips, a chin. Every number is the skull's own or a published measure of a man's face. The
first try had a brow like a visor; the second did not.

What it is now: a face. An upright forehead, eyes in their sockets, a jaw with a line. What it is not: a photograph.
The ears are reliefs, the eyes stare, the skin is the same everywhere, and there is no hair. Maia says so.

## The film: 43 seconds, two voices

| At | On screen | Who | Line |
| --- | --- | --- | --- |
| 0:00 | The tent on the meadow from the walker's eyes, edging forward | | *title:* A face where there was a mask |
| 0:04 | | Samuel | Ok eyes and face is the worst at the moment |
| 0:08 | | Samuel | the body is okay for now |
| 0:11 | | Maia | Its eyes were two balls looking out of holes. |
| 0:14 | Towards the tent, at a person's eyes | Maia | Now a lid's edge is cut pixel by pixel, over a globe with an iris. |
| 0:18 | | Maia | With eyes in it, the head was still a mask. |
| 0:21 | | Maia | Its mouth lay 8 mm under its own teeth. |
| 0:24 | | Maia | So I laid the head out anew, level by level, |
| 0:27 | Back from the tent and up | Maia | from its skull and the measured face of a man. |
| 0:31 | | Maia | Its neck measured 43 cm round. Now 39.4. |
| 0:34 | | Maia | A face, yes. A photograph, no: the ears, the hair, a blink. |
| 0:38 | | | *note:* Seen on a software GPU only. Not yet in the library. |

## Receipts

| Line | Where it is true |
| --- | --- |
| Samuel's lines | His message of 2026-11-18: "Ok eyes and face is the worst at the moment the body is okay for now" (one typo tidied) |
| "two balls looking out of holes" | The stills of the face before, drawn on 2026-11-18; intent 0039, Propose, "the eyes are painted balls" |
| "cut pixel by pixel"; "thirty millimetres long" | `TheGame/characters/kit/skin/light.js` throws the skin away inside the lids' line; `skin/table.js` `EYE`: an opening 30.1 mm long and 9.6 high |
| "a globe with an iris set back under a cornea, a glint, a wet line, lashes, a brow" | `TheGame/characters/kit/muscles/flesh.js` `eyesOf`, `lashesOf`; the brow in `skin/light.js` |
| "three earlier tries ... shelves and lumps" | Intent 0040, Define, from intent 0036 |
| "its skull softened over two centimetres" | `skin/target.js` before this intent: the head's field softened by three running means of 14 mm each way |
| "8 mm under its own teeth" | The lips' line stood at 1.5985 m; the skull's teeth meet at 1.6064 m (`skeleton/skull.js`) |
| "pushed back a centimetre to match an old drawing" | `LOWER_FACE` in `skin/table.js` before this intent: 11 mm at the chin, from a plate of Richer's |
| "two sections as wide as the head" | The trunk's outline before: half-breadths 7.4 and 7.9 cm at 1.64 and 1.68 m |
| "sixteen levels"; "the skull's own or a published measure" | `skin/table.js` `HEAD`; its sources named there, as remembered: the skull's table, Arnett et al. 1999, Farkas 1994 |
| "a brow like a visor" | The first clay look at the new form, 2026-11-18; intent 0040, Build |
| "43 cm round. Now 39.4." | `bun tools/body.js`: 43.1 cm at the end of intent 0039, 39.4 now; a man's 39 |
| "A photograph, no" | Intent 0040, Propose, Known gaps |
| "Seen on a software GPU only" | Every still was drawn through WebGL 2 on SwiftShader in a container; the library was not seen |

## Open

- **A real GPU.** Nothing here was seen in the library or timed.
- **The film** shows the meadow and the tent: the Body stands in the library, not yet in the world, so no shot shows
  the face the lines talk about.
- **The film was not played here.** Its page answers and its timeline reads; the world was not drawn on the software
  GPU. Its camera is intent 0039's.
- **The day and the humans in the game** are not set (`day`, `inGame`): not counted here.
- **The voices.** The lines are subtitles only; Samuel's are his to change.
- **Samuel's:** to accept or reject; what comes next for the head (ears, hair, a face that moves); the rule "our own
  code only".
