# Say it shorter

**Maia City.** A dialogue between Samuel and Maia.
Told for [intent 0044](../../Intents/0044-compact-library-cards.md), compact library cards; its facts are in that
intent's [changelog](../../Intents/0044-compact-library-cards.md#changelog) and in the receipts below. The film is
[`timeline.json`](timeline.json): the camera's moves and the subtitles, played live in the game, the same every time:
`http://localhost:5173/timeline.html?story=0044-compact-library-cards`

## The series

> This is the story of how one million humans build their own solarpunk city, from the ground up.
> In just 16 years.

## The hook

- **Title:** Say it shorter
- **Overlay:** ONE LINE
- **Shot:** the game as it starts: the one tent on the meadow, from the eyes of whoever walks there.

## The story

Every city starts on a green meadow, with one tent. Everything that will ever stand in this one, a tent, a pine, a
stone, a person, has a page where it can be looked at alone, and beside it a card that says what it is.

The cards had grown. Maia writes down what she knows, and she knew a great deal: the card of the city's first body
took 560 letters to say what it was, and each of its moves another paragraph. Samuel was looking at a woman who had
just arrived in the library, and her card ran off the screen before her moves had ended. Two of its numbers had run
into each other. He asked for all of it to be made far more compact, for every thing the library holds.

So Maia wrote every one of the 54 again, as one line. The body is now "a man of 1.80 m: skin over fat, muscles
and bones, each a layer", 64 letters. A move had been a box of up to six lines. Now it is a small round button in a
row with the others, and the chosen one's few words stand under the row. What a thing is made from, and by what it
is measured, is still written down, behind a line that opens when asked.

And so that the cards stay short, there is now a check that fails when a line grows too long. The body's card was
2768 points of screen tall. It is 647.

What is not known: how it looks with the stage behind it. The machine Maia worked on could not draw the world that
day. And the 54 lines are a first wording. Any of them is Samuel's to change.

## The film: 25 seconds, two voices

| At | On screen | Who | Line |
| --- | --- | --- | --- |
| 0:00 | The tent on the meadow from the walker's eyes, edging forward | | *title:* Say it shorter |
| 0:04 | | Samuel | Make the prose of each variant way more compact. |
| 0:07 | | Samuel | For every existing asset. |
| 0:10 | | Maia | The Body took 560 letters to say what it is. |
| 0:14 | Towards the tent, at a person's eyes | Maia | Now 64. Fifty-four things, one line each. |
| 0:17 | | Maia | A move was a box of six lines. Now it is a pill. |
| 0:20 | | | *note:* The Body's card: 2768 px tall before, 647 now. |

## Receipts

| Line | Where it is true |
| --- | --- |
| Samuel's lines | His message of 2026-11-18, typos tidied: "Can you also use this moment to make the prose of each variant and right aside text labels way more compact for every existing asset?" The film's two lines are that sentence, shortened to its two halves |
| "560 letters"; "64 letters" | `TheGame/characters/body.js`, its `about` before (commit 4cd08b6) and now |
| "every one of the 54" | `bun tools/words.js`: 14 assets, 7 biomes, 6 characters, 27 materials |
| "a box of up to six lines"; "a small round button in a row" | The pictures of the cards before and after, 2026-11-18; `TheGame/src/library/card.js` `pick` |
| "behind a line that opens when asked" | `card.js` `more`; a click opened it: 718 letters |
| "a check that fails when a line grows too long" | `TheGame/tools/words.js`: 80 letters for a description, 40 for the rest |
| "2768 points of screen tall. It is 647." | Measured in headless Chromium on 2026-11-18, the card's height in px before and after |
| "could not draw the world that day" | Intent 0043, Propose: the library's stage white on the software GPU |

## Open

- **The stage was not seen** behind the cards; nothing was seen on a real GPU.
- **The film** shows the meadow and the tent: the library is a page of its own, so no shot shows a card.
- **The film was not played here.** Its camera is intent 0041's.
- **The day and the humans in the game** are not set (`day`, `inGame`): not counted here.
- **The voices.** The lines are subtitles only; Samuel's are his to change. His one sentence is given in two halves
  in the film.
- **Samuel's:** to accept or reject; any line he wants worded otherwise.
