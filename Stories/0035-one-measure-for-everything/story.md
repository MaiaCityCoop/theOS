# Everything its own size

**Maia City.** A dialogue between Samuel and Maia.
Told for [intent 0035](../../Intents/0035-one-measure-for-everything.md), one measure for everything; its facts are in
that intent's [changelog](../../Intents/0035-one-measure-for-everything.md#changelog) and in the receipts below. The film
is [`timeline.json`](timeline.json): the camera's moves and the subtitles, played live in the game, the same every
time: `http://localhost:5173/timeline.html?story=0035-one-measure-for-everything`

## The series

> This is the story of how one million humans build their own solarpunk city, from the ground up.
> In just 16 years.

## The hook

- **Title:** Everything its own size
- **Overlay:** TRUE SIZE
- **Shot:** the game as it starts: the one tent and its fire on the meadow, from the eyes of whoever walks there.

## The story

Every city starts on a green meadow, with one tent. Beside it a fire pit, a round of seats, a Settler; behind them
stone pines, holm oaks, bushes, stones. Each was made on its own, its sizes written into its own file, and nothing held
them to each other or to the world outside.

Samuel asked for one source of truth for the size of everything: every asset measured against its source, so each is
right next to every other.

Now there is one file, the measure: a person of 1.74 metres, and where on them the eyes, shoulders and knees are;
what a 5 m bell tent measures, from the makers' sheets; a campfire ring and the seats round it; how tall a stone pine,
a holm oak, a mastic, a reed grows, from the floras; how large a cobble and a boulder are, from the scales of grain
sizes. Every number with its source, and where none was found, it says so.

The tent, the fire, the trees and the Settler are built from it, and so is the walker who is you. And a run builds
every asset and the Settler as the game builds them, stands each as the world stands it, and holds what it drew
against what is real, on every change.

It found what was off. Your eyes were at 1.7 metres, a person of about 1.82, looking out of the Settler's body of
1.74: now 1.63. The tent's door reached 2.05 metres; a real 5 m bell tent's reaches 1.8, and now you stoop a little
going in. The rockrose stood up to a metre and a half, where its species grows to one. The reeds stood shorter than
common reed does. All set right.

One thing it found is Samuel's to decide: the stones and boulders are drawn about twice the size their own files say.
Set right, every stone in the world is half as large.

In the library, a lineup: everything beside the Settler at its true size, and a gold line at your eyes.

## The film: 48 seconds, two voices

| At | On screen | Who | Line |
| --- | --- | --- | --- |
| 0:00 | The tent and its fire from the walker's eyes, edging forward | | *title:* Everything its own size |
| 0:04 | | Samuel | Can you create a universal SSOT scale src for every asset |
| 0:08 | | Samuel | to have proper sizing also in relation to each other. |
| 0:11 | | Samuel | So every asset is measured against its source. |
| 0:15 | Towards the tent's door, at the walker's eyes | Maia | Your eyes stood at 1.7 metres: a taller person's. |
| 0:19 | | Maia | The Settler's are at 1.63. Now so are yours. |
| 0:22 | | Maia | A 5 m bell tent's door: 1.8 metres. Ours was 2.05. |
| 0:27 | The floor of the pine wood, its bushes | Maia | Every bush held to its species. |
| 0:30 | | Maia | The rockrose grew past a metre. Now knee to hip. |
| 0:34 | | Maia | Each thing with its source, measured on every change. |
| 0:37 | Back from the tent and up, the meadow's stones round it | Maia | The stones are drawn twice the size they say. |
| 0:41 | | Maia | Halving them is yours to choose. |
| 0:44 | | | *note:* 13 of 15 within their measure. Not yet seen on a phone. |

## Receipts

| Line | Where it is true |
| --- | --- |
| Samuel's lines | His message of 2026-11-16: "Regarding tent and human body and fire place and trees etc. sizes. Can you create a universal SSOT scale src for every asset to have proper sizing also in relation to each other. So every asset is measured against its source. Do you see what I meant?"; and "do make 35" |
| "a person of 1.74 metres" | The Settler (`characters/settler.js`), now `PERSON.stature` in `TheGame/world/scale.js`; ANSUR II's mean stature is 1.629 m for women and 1.756 m for men |
| "Your eyes stood at 1.7 metres" | `camera/rig.js` on main: `eye: 1.7`; eyes are at 0.936 of stature (Drillis & Contini 1966, in Winter 2009), so 1.7 m is the eyes of a person of 1.82 m. Measured in the game as it starts: the camera 1.700 m over the ground on main, 1.629 m on this branch |
| "A 5 m bell tent's door: 1.8 metres. Ours was 2.05." | `assets/belltent.js` on main: `DOOR_H = 2.05`, 1.76 m wide at the ground. Makers' 5 m bell tents: doors of 1.5 m, 1.68 m (and 1.32 m wide), 1.7 m, 1.8 m, and 2.0 m on an XL with taller walls. Now 1.8 m high, 1.32 m wide |
| "you stoop a little going in" | The camera keeps its eyes 0.25 m under what is overhead (`src/camera/rig.js`): under the door's top of 1.8 m, 1.55 m, 8 cm under the walker's eyes |
| "The rockrose stood up to a metre and a half" | `bun tools/scale.js` before: 0.41 to 1.51 m; the sage-leaved rockrose grows to 1 m (RHS). After: 0.36 to 0.94 m |
| "The reeds stood shorter" | Before: a middling clump 1.81 m; common reed's stems are 2 to 4 m (RHS: 2.5 to 4). After: 2.28 m |
| "twice the size their own files say" | `src/scatter/rocks.js` draws a rock's largest side as its size times its shape's span, 1.8 to 2.6; the stones' file says 7 to 55 cm, the boulders' up to four metres. The run: stones drawn 0.12 to 1.42 m, boulders 1.2 to 11.9 m |
| "13 of 15" | `bun tools/scale.js` on this branch: 13 of 15 within their measure, the stones and the boulders known out of it |
| "on every change" | The run is a step of CI (`.github/workflows/ci.yml`), for every pull request and every push to main |

## Open

- **The stones and boulders**: drawn about twice the size their files say; setting it right halves them all, and the
  same engine draws the stress world's rocks. Samuel's choice.
- **Samuel's iPhone.** Every number here is from Chromium in a container without a GPU.
- **The film's pine wood** holds bushes, but no rockrose stands in its view.
- **The day and the humans in the game** are not set (`day`, `inGame`): not counted here.
- **The voices.** The lines are subtitles only; Samuel's are his to change.
