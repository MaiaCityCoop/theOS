# One skin where there were seven pieces

**Maia City.** A dialogue between Samuel and Maia.
Told for [intent 0039](../../Intents/0039-one-smooth-skin.md), one smooth skin; its facts are in that intent's
[changelog](../../Intents/0039-one-smooth-skin.md#changelog) and in the receipts below. The film is
[`timeline.json`](timeline.json): the camera's moves and the subtitles, played live in the game, the same every time:
`http://localhost:5173/timeline.html?story=0039-one-smooth-skin`

## The series

> This is the story of how one million humans build their own solarpunk city, from the ground up.
> In just 16 years.

## The hook

- **Title:** One skin where there were seven pieces
- **Overlay:** ONE SKIN
- **Shot:** the game as it starts: the one tent on the meadow, from the eyes of whoever walks there.

## The story

Every city starts on a green meadow, with one tent. Whoever lives in it has a body, and this city grows its people
from its own code: bones first, each in its true shape; two hundred and six muscles on them; then fat and skin.

The skin was the part that did not hold. It was drawn out of a block of small cubes, seven pieces laid over one
another, and every rope and gap of the muscles under it showed as a dent or a ridge. Samuel looked at it and said it
still did not look real, and asked for what the industry does, found by research first.

So Maia read. Five lines of inquiry came back with the same answer for the surface: nobody ships a skin drawn out of
cubes. A film's body and a game's body are one closed cage of four-sided faces, laid in rings that follow the body,
made smooth by a rule from 1978, with a scan or a sculpture giving the shape under it. The city has no scan and wants
none. It has its anatomy. So the anatomy became what a studio's scan is, and the skin became what a studio's skin is:
a cage of five thousand faces wrapped on it, rings round the trunk, each arm and leg, each finger and toe, a ring
dividing where the body does.

Then the light. Skin is not plaster: light goes in and comes out a millimetre away, red furthest, so a finger and an
ear glow at the shade's edge and a thigh does not. Its gloss has two lobes. Its colour is blood here and pigment
there. Each of these came in as a published number.

Samuel looked again: the thighs were still one mass, the skin still bumpy, the neck wrong. Under two of the three
lay one mistake, older than this work: every limb's outline was inside out, its fuller outer side turned inwards. Set
right, the thighs parted and the shoulders came out round.

What it is now: one skin, closed, smooth, fewer than half the triangles, bending at elbow, knee and shoulder without a
tear. What it is not: photoreal. The cage took the lumps out; it did not make the chest or the face truer than the
anatomy under them is. And there is no hair. Maia says so, and puts three choices to Samuel.

## The film: 43 seconds, two voices

| At | On screen | Who | Line |
| --- | --- | --- | --- |
| 0:00 | The tent on the meadow from the walker's eyes, edging forward | | *title:* One skin where there were seven pieces |
| 0:04 | | Samuel | Currently the naked skin body looks still not photorealistic! |
| 0:08 | | Samuel | We need to upgrade the architecture to latest industry best practices |
| 0:11 | | Samuel | to make the human body really photorealistic and smooth. |
| 0:14 | Towards the tent, at a person's eyes | Maia | A film's body is one cage of four-sided faces, made smooth. |
| 0:17 | | Maia | Ours was drawn out of voxels: seven pieces, 1 410 open edges. |
| 0:21 | | Maia | Now it is one closed skin, wrapped on our own anatomy. |
| 0:24 | | Maia | Its thighs met to the knees. Now they stand apart. |
| 0:27 | Back from the tent and up | Maia | Lit as skin is: red light spreads a millimetre under it. |
| 0:31 | | Maia | It bends at elbow, knee and shoulder without a tear. |
| 0:34 | | Maia | Smooth, yes. Photoreal, not yet: the form, the face, the hair. |
| 0:38 | | | *note:* Seen on a software GPU only. Not yet in the library. |

## Receipts

| Line | Where it is true |
| --- | --- |
| Samuel's lines | His message of 2026-11-18: "Can you check out the latest state of our human / skeleton muscles tissues skin rig? Currently the naked skin body looks still not photorealistic! We need to upgrade the architecture to latest industry best practices to make the human body really photorealistic and smooth. Make a deep research to upgrade the architecture and then write a new intent plan and execute on the plan." (typos tidied) |
| "two hundred and six muscles" | `TheGame/characters/kit/muscles/table.js`; intent 0036 |
| "nobody ships a skin drawn out of cubes"; "one cage of four-sided faces" | `reports/Photoreal human body architecture.md`: every pipeline found uses one quad cage of fixed layout smoothed by Catmull-Clark subdivision. Most of it from search extracts and source code on GitHub; the report marks which |
| "a rule from 1978" | Catmull & Clark, "Recursively generated B-spline surfaces on arbitrary topological meshes", 1978; `TheGame/characters/kit/skin/subdiv.js` |
| "seven pieces, 1 410 open edges" | The skin before, built here on 2026-11-18 and counted: 430 810 triangles; the trunk with legs and head, the arms, a fine head, two hands, two feet |
| "five thousand faces" | `bun tools/body.js`: a cage of 5 062 points |
| "one closed skin"; "fewer than half the triangles" | `bun tools/body.js`: open edges 0 at each of three levels; 161 664 triangles near, for 430 810 |
| "Its thighs met to the knees. Now they stand apart." | Every limb's outline had its outward and inward sides swapped (`skin/target.js`, set right on 2026-11-18): the thigh's fuller outer side lay across the body's middle. Measured on the skin now: 2.4 cm between the thighs at 0.76 m, 4.0 at 0.68, 6.6 between the knees |
| "red light spreads a millimetre under it" | The six-bell profile of light in skin (d'Eon, Luebke & Enderton 2007), as shipping shaders hold it: red's spread 1.18 mm on the whole, green's 0.26, blue's 0.16 (`skin/maps.js`) |
| "bends ... without a tear" | The tool's stills in five poses; the skin is one closed surface, so there is nothing to part |
| "Photoreal, not yet" | Intent 0039, Propose, Known gaps |
| "Seen on a software GPU only" | Every still was drawn through WebGL 2 on SwiftShader in a container; the library was not seen |

## Open

- **A real GPU.** Nothing here was seen in the library or timed.
- **The film** shows the meadow and the tent: the Body stands in the library, not yet in the world.
- **The day and the humans in the game** are not set (`day`, `inGame`): not counted here.
- **The voices.** The lines are subtitles only; Samuel's are his to change.
- **Three choices are Samuel's:** the rule "our own code only", the screen's curve, and what comes next.
