# It all starts with one tent on a green meadow

**Maia City · Day 1.** A dialogue between Samuel and Maia.
Told for [intent 0001](../../Intents/0001-intents-stories-os.md), the intent that gave the work
its stories; its facts are in that intent's [changelog](../../Intents/0001-intents-stories-os.md#changelog)
and in the receipts below. The film is [`timeline.json`](timeline.json): the camera's moves and the
subtitles, played live in the game, the same every time:
`http://localhost:5173/timeline.html?story=0001-intents-stories-os`

## The series

> This is the story of how one million humans build their own solarpunk city, from the ground up.
> In just 16 years.

## The hook

- **Title:** Day 1 of building a city for a million people: one meadow, one tent, nobody home
- **Overlay:** DAY 1
- **Shot:** out of an empty sky, down to one river on an empty land.

## The story

Every city starts the same way: a green meadow, and one tent. That is where Samuel begins. But
when Maia looks for the meadow, there is none. There is nothing. So before the tent, she has to
make the ground it stands on.

She makes a world: land that never ends, and one river. No trees, no sun, no shadows yet. Her
first grass is too slow to walk through. She makes it fast, and Samuel looks at it and says it is
blocky. He is right, and the first thing she fixes is the wrong thing.

Then the meadow is a meadow, and she puts up the tent. One tent. Nobody in it yet.

Samuel says what the tent is for: the vision, the city, the game, everything grows as we do, with
citizens. Today there is no city on this land. There is a meadow, a river and a tent.

This is day one. Today he is alone. Tomorrow we will see.

## The film: 59 seconds, two voices

| At | On screen | Who | Line |
| --- | --- | --- | --- |
| 0:00 | Out of the sky, tilting down to the river | | *title:* It all starts with one tent on a green meadow |
| 0:04 | | Samuel | It all starts with a green meadow and one tent. |
| 0:08 | Low and fast down the river | Maia | I looked for the meadow. There was none. |
| 0:11 | | Samuel | First we need a world. |
| 0:13 | The flight rises, slows | Maia | So I made one. Land that never ends, and one river. |
| 0:16 | | Maia | No trees. No sun. No shadows. Not yet. |
| 0:19 | On the bank, the river going by | Maia | My first grass was too slow to walk through. |
| 0:22 | | Maia | I made it fast. |
| 0:24 | The waterline, close | Samuel | The grass is still super blocky, can you see? |
| 0:28 | | Maia | You were right. I fixed the wrong thing first. |
| 0:30 | Down among the blades, the tent ahead | Maia | Then the meadow was a meadow. And I put up your tent. |
| 0:33 | | Maia | One tent. Nobody in it yet. |
| 0:36 | Straight up over the tent, the river sliding in | Samuel | The vision, the city, the game: everything grows as we do, with citizens. |
| 0:41 | | Maia | Then it grows from here. |
| 0:44 | Low over the meadow, back to the water | Maia | There is no city on this land. |
| 0:47 | | Maia | There is a meadow, a river and a tent. |
| 0:50 | The crane up and away | Samuel | This is day one. Today I am alone. |
| 0:53 | | Samuel | Tomorrow we will see. |
| 0:56 | Fade to the sky | Maia | Tomorrow I am here too. |

## Receipts

| Line | Where it is true |
| --- | --- |
| Samuel's five lines | His own words in the session of 2026-11-11, typos tidied, nothing added: "it all starts with a green meadow and one tent", "first we need a world", "the grass is still super blocky, can you see?", "the vision, the city, the game, everything grows as we do, with citizens", "this is day 1: today I am alone, tomorrow we will see" |
| "too slow to walk through … I made it fast" | The first grass ran at 28 frames a second in the app's browser pane on the day it was built; 60 after each blade read the ground from a map |
| "I fixed the wrong thing first" | The first fix blamed per-vertex colour; the squares were the noise's own grid, fixed the round after |
| "I put up your tent" | `TheGame/src/scatter/tent.js`, standing at `TheGame/src/world/places.js` |
| "a meadow, a river and a tent" | What the world holds today, with stones |

## Open

- **The voices.** The lines are subtitles only; nothing is spoken yet. Samuel's are his to speak, and his to change.
- **The series trailer** does not exist yet.
- The frame rates were read in the app's browser pane, not in Safari.
