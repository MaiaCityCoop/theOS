# A face that smiles back

**Maia City.** A dialogue between Samuel and Maia.
Told for [intent 0040](../../Intents/0040-a-face-with-eyes.md), a face with eyes; its facts are in that intent's
[changelog](../../Intents/0040-a-face-with-eyes.md#changelog) and in the receipts below. The film is
[`timeline.json`](timeline.json): the camera's moves and the subtitles, played live in the game, the same every time:
`http://localhost:5173/timeline.html?story=0040-a-face-with-eyes`

## The series

> This is the story of how one million humans build their own solarpunk city, from the ground up.
> In just 16 years.

## The hook

- **Title:** A face that smiles back
- **Overlay:** A FACE
- **Shot:** the game as it starts: the one tent on the meadow, from the eyes of whoever walks there.

## The story

Every city starts on a green meadow, with one tent. Whoever lives in it will be looked in the face. This city grows
its people from its own code, bones first, and it had just given its first body one smooth skin. Samuel looked at the
result and named what was worst: the eyes and the face. The body could wait.

The eyes were two painted balls seen through holes in the skin. A lid's edge is finer than any point a skin is made
of, so Maia stopped trying to model it. The skin now runs over the eye as a closed lid does, and the opening is cut
out of it pixel by pixel along an almond thirty millimetres long. Behind it sits a globe with an iris set back
under a cornea, a glint, a wet line on the lower lid, lashes, a brow above.

With real eyes in it the head still read as a mask, and that was the surprise of the day. Maia had planned to leave
the head's shape alone. So she measured instead of looking. The head's skin was its skull softened over two
centimetres. Its mouth lay eight millimetres under its own teeth. She laid the head out anew, the way a draughtsman
does: its outline at sixteen levels from the chin to the crown, and on that ground a nose, two lips, a chin, every
number the skull's own or a published measure of a man's face.

Samuel looked again. It was a face now, and not a friendly one. He wanted sparkling eyes and a sparkling smile; the
chin was too wide and too far forward; the ears were not ears. And when the first smile came he said what the face
is for: its base should be a smile and a sparkle in the eyes, a friendly, heartwarming gaze, a human in love and full
of inspiration, with good teeth.

A face that cannot move yet has only its rest to be warm with. So its rest became a whole smile, the kind the eyes
take part in. The corners of the mouth stand higher than the upper lip's middle. The lower lip follows the edges of
the upper teeth, and the teeth are real in the way this city means it: they stand exactly where the skull's own teeth
stand, each in its gum. The lower lids rise over the foot of the iris, the pupils are wide, and each eye holds a spark
of its own, the bright sky in front of the face mirrored in the cornea whichever way the sun stands. The chin came in
and back. And the ears, which had been low bumps on the head's sides, became forms of their own with a rim, a bowl
and a lobe, standing off the head as ears do, thin enough that the sun comes through them red.

What it is now: a warm face. What it is not: a photograph, or a look. It has no hair, it does not blink, and its
smile never leaves it. Whether it is in love is Samuel's to say. Maia says what she can measure.

## The film: 43 seconds, two voices

| At | On screen | Who | Line |
| --- | --- | --- | --- |
| 0:00 | The tent on the meadow from the walker's eyes, edging forward | | *title:* A face that smiles back |
| 0:04 | | Samuel | Ok eyes and face is the worst at the moment |
| 0:07 | | Maia | Its eyes were two balls looking out of holes. |
| 0:10 | | Maia | Now a lid's edge is cut pixel by pixel, over a globe with an iris. |
| 0:14 | Towards the tent, at a person's eyes | Maia | With eyes in it the head was still a mask. So I laid it out anew. |
| 0:17 | | Samuel | The base view should be a smile and sparkle in the eyes. |
| 0:21 | | Samuel | Friendly heartwarming gaze, a human in love and full of inspiration. |
| 0:24 | | Samuel | And the ears need to be more realistic |
| 0:27 | Back from the tent and up | Maia | It cannot move yet. So its rest is a whole smile, over good teeth. |
| 0:30 | | Maia | Its lids smile too, and each eye holds a spark. |
| 0:33 | | Maia | Ears with a rim, a bowl and a lobe, 19 mm off the head. |
| 0:37 | | Maia | Warm, yes. A photograph, no: no hair, no blink. |
| 0:40 | | | *note:* Seen on a software GPU only. Not yet in the library. |

## Receipts

| Line | Where it is true |
| --- | --- |
| Samuel's lines | His messages of 2026-11-18: "Ok eyes and face is the worst at the moment the body is okay for now"; after the first round: "So ensure we have an actual sparkling eyes friendly positive face. The chin is too wide going too far to the front, the sparkling smile isn't there yet. No sparkling smile yet there. And the ears need to be more realistic"; after the second: "The base view should be a smile and sparkle in the eyes. Friendly heartwarming gaze, a human in love and full of inspiration. This included good teeth" (typos tidied) |
| "two balls looking out of holes" | The stills of the face before, drawn on 2026-11-18; intent 0039, Propose, "the eyes are painted balls" |
| "cut pixel by pixel"; "thirty millimetres long" | `TheGame/characters/kit/skin/light.js` throws the skin away inside the lids' line; `skin/table.js` `EYE`: an opening 30.1 mm long |
| "its skull softened over two centimetres"; "8 mm under its own teeth" | Intent 0040, Build: the head's field before, softened by running means of 14 mm each way; the lips' line at 1.5985 m, the skull's teeth meeting at 1.6064 m (`skeleton/skull.js`) |
| "sixteen levels"; "the skull's own or a published measure" | `skin/table.js` `HEAD`; its sources named there, as remembered: the skull's table, Arnett et al. 1999, Farkas 1994 |
| "its rest became a whole smile"; "the corners ... higher than the upper lip's middle"; "the lower lip follows the edges of the upper teeth" | `skin/table.js` `MOUTH`: corners at 1.6150 m, the upper lip's middle edge at 1.6148, the lower lip's at 1.6050, the skull's upper front teeth ending at 1.6051; `skin/head.js`; the stills of 2026-11-18 |
| "they stand exactly where the skull's own teeth stand, each in its gum" | `skeleton/skull.js` `teethOf` gives each tooth's place; `muscles/flesh.js` `mouthOf` draws eighteen crowns there, the gum drawn on each |
| "The lower lids rise over the foot of the iris, the pupils are wide" | `skin/table.js` `EYE`: the opening 7.9 mm high, the pupil 5 mm across |
| "a spark of its own ... whichever way the sun stands" | `muscles/flesh.js` `eyesOf`: a second light for the eyes alone, set from where the eye is looked at from |
| "The chin came in and back" | `skin/table.js` `HEAD`: the chin 100.5 mm before the head's middle plane for 104.5, its mass 17 mm half-broad for 19 |
| "a rim, a bowl and a lobe"; "19 mm off the head" | `skin/ear.js`; measured by its own lab script: 63.4 mm by 35.9, its rear rim 19.3 mm off the head's form at most |
| "thin enough that the sun comes through them red" | The plate 2.4 mm at its thinnest; the still of the head from behind, 2026-11-18 |
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
- **Samuel's:** to accept or reject; whether this is the gaze he meant; what comes next for the head (hair, a face
  that moves); the rule "our own code only".
