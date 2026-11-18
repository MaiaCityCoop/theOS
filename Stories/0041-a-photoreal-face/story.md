# The first two who were not grown here

**Maia City.** A dialogue between Samuel and Maia.
Told for [intent 0041](../../Intents/0041-a-photoreal-face.md), a photoreal face; its facts are in that intent's
[changelog](../../Intents/0041-a-photoreal-face.md#changelog) and in the receipts below. The film is
[`timeline.json`](timeline.json): the camera's moves and the subtitles, played live in the game, the same every time:
`http://localhost:5173/timeline.html?story=0041-a-photoreal-face`

## The series

> This is the story of how one million humans build their own solarpunk city, from the ground up.
> In just 16 years.

## The hook

- **Title:** The first two who were not grown here
- **Overlay:** TWO PEOPLE
- **Shot:** the game as it starts: the one tent on the meadow, from the eyes of whoever walks there.

## The story

Every city starts on a green meadow, with one tent. This one grows what stands on it from its own code: its
grass, its trees, and its first body, bones first. That body had just been given a face, and Samuel had held a
photograph of a real smiling man beside it. Maia had said what she saw: hers was a drawn face.

So she went to find out how a face is made to look real. She read for a day and came back with a plan: keep the head
the city had grown, and borrow the fine relief of real skin for it. Samuel read it and said it was not helpful so
far. He wanted the newer ways looked at: people made from pictures by machines. Maia looked, and found what those
give: a still figure, with no face that can move. Then he stopped the reading altogether and asked for something
plain. Which people, already made and free for anyone to use, can stand in a browser today?

Maia fetched every library she could reach, read each one's licence, and drew a woman and a man from each under the
same light. Samuel looked at the sheet and said VALID looked the most promising: forty-two people made at a
university in Florida with Google, given away under the freest of licences.

Before answering, Maia measured them. Four of those people, two women and two men, turned out to be one and the same
mesh: 20,951 points, joined in the same order, with the same 84 bones and the same 65 shapes for the face. Only where
the points lie differs. That means any two of them can be blended, point by point, into a third.

Samuel said go: the whole figure, one man and one woman, in the library, with a few moves and expressions. Changing
how they look can wait.

So for the first time two people stand in this city who were not grown here. Their files are kept exactly as their
makers gave them, two megabytes each, the licence beside them. What is the city's own is how they stand in it. They
are lit by the same sun and sky as the grass. They come with their arms held out, so their arms are brought down
first. Then they walk with the Settler's own walk, carried over to their bones, and their feet stay on the ground.
Their eyes turn to whoever looks at them. They smile, laugh over their teeth, are surprised, are sad, close their
eyes, and speak, the lower teeth going with the jaw.

What they are not: the photograph. They look like people of a game. And Maia has seen them only on a machine without
a real graphics card, each alone on a grey ground; the library's own stage would not draw there at all, for them or
for anyone. Which two of the forty-two become the city's first man and woman is Samuel's to choose.

## The film: 40 seconds, two voices

| At | On screen | Who | Line |
| --- | --- | --- | --- |
| 0:00 | The tent on the meadow from the walker's eyes, edging forward | | *title:* The first two who were not grown here |
| 0:04 | | Maia | Beside the photograph, mine was a drawn face. |
| 0:07 | | Samuel | This isn't helpful so far. |
| 0:10 | | Maia | So I fetched every free library of people and drew each. |
| 0:14 | Towards the tent, at a person's eyes | Samuel | VALID looks the most promising so far. |
| 0:17 | | Maia | Four of its people are one mesh: 20,951 points, 84 bones. |
| 0:20 | | Samuel | Ok go for the whole VALID figure. |
| 0:23 | | Samuel | Then visualize in our character lib with a few rig moves and expressions. |
| 0:27 | Back from the tent and up | Maia | A man and a woman, as their makers gave them. |
| 0:30 | | Maia | They walk the Settler's walk and look at whoever looks. |
| 0:33 | | Maia | They smile, laugh, speak. A photograph, no. |
| 0:36 | | | *note:* Seen on a software GPU only. Not yet on the library's stage. |

## Receipts

| Line | Where it is true |
| --- | --- |
| Samuel's lines | His messages of 2026-11-18, typos tidied: "Ok. This isn't helpful so far."; "VALID looks the most promising so far."; "Ok go for the whole VALID figure, and import one male and one female one. Then visualize in our character lib with a few rig moves and expressions. Customization we talk later." |
| "hers was a drawn face" | Intent 0040, Propose, "Against the photograph" |
| "a plan: keep the head ... borrow the fine relief of real skin" | Intent 0041, the first plan, kept in commit c7b5ad0; `reports/Photoreal browser face first principles.md` |
| "a still figure, with no face that can move" | The second research's note on generators that make a figure from a picture (in `research_notes/`; intent 0041's changelog names it): none that was read gives expression shapes, eyes or teeth of their own |
| "fetched every library she could reach ... under the same light" | The note on ready-made open characters beside it (`ready_made_open_characters.md`): Rocketbox, VALID, a MakeHuman woman, CharMorph's Antonia and Reom, each licence read from its own file |
| "forty-two people ... a university in Florida with Google ... the freest of licences" | VALID's readme (University of Central Florida, Google Labs); `avatars.json` of c-frame/valid-avatars-glb: 42 people in five outfits; `TheGame/characters/figures/LICENSE`: MIT |
| "one and the same mesh: 20,951 points ... 84 bones ... 65 shapes" | The same note, "VALID's figures share one layout": checked with headless Blender on four figures; the other 38 were not checked |
| "Their files are kept exactly as their makers gave them, two megabytes each" | `bun tools/figure.js`: 1.94 MB and 2.05 MB, each file's SHA-256 the one its recipe names |
| "lit by the same sun and sky as the grass" | `TheGame/characters/kit/figure.js` `materialOf`: the light every material shares (`src/world/light.js`) |
| "their arms are brought down first ... the Settler's own walk, carried over to their bones" | `figure.js`: `ARMS`, `DROP`, and the human kit's `MOVES` turned in the world's axes as each bone lies at rest |
| "their feet stay on the ground"; "Their eyes turn to whoever looks" | `figure.js` `step`: the hips let down till the lowest sole touches; the eyes' bones turned to the camera within half a radian; the stills of 2026-11-18 |
| "They smile, laugh ... and speak, the lower teeth going with the jaw" | `figure.js` `EXPRESSIONS`: seven, weights of the face's own shapes; the lower teeth's shapes driven by the face's |
| "They look like people of a game" | The stills of 2026-11-18; intent 0041, Propose, Known gaps |
| "the library's own stage would not draw there at all, for them or for anyone" | Intent 0041, Propose: the library page opened in headless Chromium, its card read, its picture white for the Settler too |

## Open

- **A real GPU.** The two figures were seen alone, through WebGL 2 on a software GPU. The library's stage was not
  drawn here, so their shadow on the ground and their place beside the Settler were not seen.
- **The film** shows the meadow and the tent: the figures stand in the library, not yet in the world, so no shot
  shows the people the lines talk about.
- **The film was not played here.** Its page's timeline reads; the world was not drawn on the software GPU. Its
  camera is intent 0039's.
- **The day and the humans in the game** are not set (`day`, `inGame`): not counted here.
- **The voices.** The lines are subtitles only; Samuel's are his to change.
- **The gate is not reached.** Beside the photograph these are figures of a game.
- **Samuel's:** to accept or reject; which two of the forty-two become the base; how they are changed afterwards
  (blending, skin, hair), which he said comes later.
