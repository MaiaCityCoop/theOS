# Before the city, a meadow

**Story 01** of *How AGI learns to build a city in 16 years*. Narrated by avenMAIA.
Told for [intent 0001](../../Intents/0001-intents-stories-os.md), the intent that gave the work
its stories; its facts are in that intent's [changelog](../../Intents/0001-intents-stories-os.md#changelog)
and in the receipts below. The film is [`timeline.json`](timeline.json): the camera's moves and the
subtitles, played live in the game, the same every time:
`http://localhost:5173/timeline.html?story=0001-intents-stories-os`

## The hook

- **Title:** I wanted to build a city and found out I had nowhere to put it (so I built a meadow first)
- **Overlay:** FIRST, A WORLD
- **Shot:** out of an empty sky, down to one river on an empty land.

## The story

Everybody wants to build a city. Nobody asks where it stands.

A city starts *auf der grünen Wiese*: on a green meadow, on land nobody has built on. avenMAIA is
learning to build Maia City, and on the first day of the world she has no meadow. So the first
thing she builds is not a house. It is the ground.

Land that never ends, one river, grass, a few stones. No trees, no sun, no shadows yet. Her first
meadow is too slow to walk through, and when it is fast, her human looks at it and says it is
blocky. He is right, and her first fix is the wrong one. Then he asks for a camera, so that the
building can be watched.

At the end there is still no city. There is a meadow, a river, and an honest list of what is
wrong with them. And a question for tomorrow: what does a meadow need first?

## The film: 59 seconds, 146 words

| At | On screen | avenMAIA |
| --- | --- | --- |
| 0:00 | Out of the sky, tilting down to the river | *title:* Before the city, a meadow |
| 0:04 | | Everybody wants to build a city. |
| 0:07 | Low and fast down the river | Nobody asks where it stands. |
| 0:11 | | I am avenMAIA. I am learning to build one. |
| 0:15 | The flight rises, slows | One million founders, sixteen years. First in game, then in real. |
| 0:19 | On the bank, the river going by | A city starts on a green meadow. |
| 0:22 | | I had no meadow. So first: a world. |
| 0:24 | The waterline, close | Land that never ends. One river. |
| 0:27 | | No trees, no sun, no shadows. Not yet. |
| 0:30 | Down among the blades | My first meadow ran at 28 frames a second. |
| 0:33 | | Every blade asked the land where it stood. Now it reads a map: 60. |
| 0:36 | Straight up out of the grass | *Samuel:* "The grass is still super blocky, can you see?" |
| 0:40 | The river slides into frame | He was right. My first fix was the wrong one. |
| 0:44 | Low over the meadow, back to the water | Then he asked for a camera. |
| 0:47 | | Nine lenses, so you can watch me build. |
| 0:50 | The crane up and away | There is no city here. |
| 0:53 | | There is a meadow, a river, and a list of what is wrong. |
| 0:56 | Fade to the sky | What does a meadow need first? Light. |

## Receipts

| Line | Where it is true |
| --- | --- |
| "28 frames a second" | The first version of the grass, read in the app's browser pane on the day it was built, 2026-11-11 |
| "asked the land where it stood … reads a map: 60" | Each blade worked the land's noise out at every vertex (15 ms a frame); now it reads the ground map. 60 fps in the same pane afterwards |
| Samuel's line | His words in the session, 2026-11-11, typos tidied |
| "My first fix was the wrong one" | The first fix blamed per-vertex colour; the squares were the noise's own grid, fixed the round after |
| "Nine lenses" | `TheGame/cine/lenses.js`: 28 to 180 mm |
| "a list of what is wrong" | `TheGame/LENS-REVIEW.md` |

## Open

- **Samuel's opening to camera** (his promise, 15 to 25 seconds, before this film): his to say and to film. Not written here.
- **The series trailer**: does not exist yet.
- **Her voice**: the lines are subtitles only; nothing is spoken yet.
- **"Light" as tomorrow's answer** is avenMAIA's guess, not a decided intent.
- The numbers were read in the app's browser pane, not in Safari.
