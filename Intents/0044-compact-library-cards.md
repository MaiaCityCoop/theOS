---
id: "0044"
title: Compact library cards
state: propose         # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-18
story: Stories/0044-compact-library-cards/
---

# 0044 · Compact library cards

## Idea

> Can you also use this moment to make the prose of each variant and right aside text labels way more compact for
> every existing asset?

Samuel, on 2026-11-18 (typos tidied), with a picture of the library's card for the Woman (intent 0043): its
description eleven lines long, its four figures running into each other ("1.74 m" against "84"), and each move a box
of three to six lines, so that the card runs off the screen before its moves end.

The library's right side says what the chosen thing is. It had grown wordy: a recipe's description up to 560
letters, a move's up to 240, labels with a clause after them. This intent makes all of it short, for every recipe
the library shows, and gives the card a form in which a dozen variants take a few lines.

## Define

He asked for this outright; the definition below holds no surprise, so it is built without a further round.

**Deliverables**

1. **Every recipe's description one short line**: `about` of all 54 recipes (14 assets, 7 biomes, 6 characters, 27
   materials) at most 80 letters, saying what the thing is and no more. What a longer text held of how a thing is
   made stays in its `made` and in its file's own comments.
2. **Every variant a few words**: the moves, the layers and the expressions of the three character kits
   (`characters/kit/human.js`, `bones.js`, `figure.js`) at most 40 letters each; a biome's `laid` at most 40.
3. **The card compact** (`src/library/subjects.js`, `card.js`, `library.html`): variants as a row of pills with the
   chosen one's words in one line under them, in place of a box each; labels of one or two words; how a thing is made
   closed until it is asked for; four figures in a row that do not run into each other; the detail tab's sentence
   short.
4. **A check that keeps it so**: `bun tools/words.js` reads every recipe and every variant and fails where a line is
   over its length.

**Checks** (how each is shown to be done)

| # | Check | How |
| --- | --- | --- |
| 1 | no description over 80 letters, no variant over 40 | `bun tools/words.js`: the longest of each, and its count of lines over |
| 2 | the card of one of each kind, read and pictured | the library opened in a browser on an asset, a biome, a material, the Body, the Settler and the Woman: the card's picture, its height in pixels before and after |
| 3 | the variants still work | a click on a move, a layer and an expression turns each on; the address keeps it |
| 4 | nothing else changed | `bun tools/registry.js` (54 recipes, each with a new version: its words are its source), `bun tools/scale.js`, `vite build` in `TheGame/` and `OS/` |

**Out of scope**

- The list on the left, the sections' grid, the game's and the dashboard's other pages.
- What the card shows on a phone (it is hidden under 760 px, as before).
- The words of `made`, `measure` and the files' comments: kept as they are.

## Build

Notes while building, 2026-11-18.

- **Which words.** "The prose of each variant and right aside text labels" was read as everything the library's
  right side says: a recipe's description, a biome's "laid" and a material's "used by", the words of each move, layer
  and expression, the notes while a body is grown, and the labels over them.
- **Rewritten, not cut off.** Each of the 54 descriptions was written anew as one plain line (the longest 71
  letters) that says what the thing is. What the long ones also told (how a thing is made, what it is measured by)
  is still in the recipe's `made` and `measure` and in its file's comments, untouched.
- **Variants as pills.** A move, a layer or an expression was a box of three to six lines each. Now each is a pill
  in one wrapping row (the brand's own button, as the trees' ages already were), the chosen one solid, and one line
  under the row says the chosen one's few words. Twelve variants take five lines.
- **Labels.** "Moves · rigged" is Moves; "Expressions · the face's own shapes" is Expressions; "Layers · the
  outermost shown" is Layers; "Growth · by age" is Age; the skeleton's cell lost its sentence and is one line with
  its button; "Made from: the stress stand's walker, kind 26: its legs, build, head and lean" is "From: Walker 26".
- **Made, closed.** How a character is made (up to 718 letters) is behind a line that opens on a click.
- **Four figures.** The card is 236 px wide; four figures at full size ran into each other, and so did their four
  labels. In a row of four, the figures and their labels are set smaller and each takes its own width.
- **A check** (`tools/words.js`) reads the same words from the recipes and the kits and fails over 80 letters for a
  description and 40 for the rest, so the next recipe is written short too.
- **Every recipe has a new version**: its words are part of its source (registry.json).

## Propose

Proposed on 2026-11-18. Story: [`Stories/0044-compact-library-cards/`](../Stories/0044-compact-library-cards/story.md).

**Delivered:** the words of all 54 recipes and of the three character kits, short; the card compact
(`TheGame/src/library/card.js`, `subjects.js`, `library.html`, two small parts in `brand/brand.css`);
`TheGame/tools/words.js`. A picture of four cards before and after was sent to Samuel.

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | `bun tools/words.js`: 109 of 109 lines within their measure. Longest description 71 of 80 (Pebble); longest variant 40 of 40 (Reach); longest "used by" 40 of 40 (Path); longest "laid" 21 of 40 |
| 2 | passed for seven of eight, one not pictured | The library opened in headless Chromium, the card measured (its height in px, before → after): Bell tent 425 → 387, Stone pine 711 → 617, Pine forest 512 → 420, Pine needles 557 → 445, Settler 975 → 562, Skeleton 1742 → 524, Body 2768 → 647, Woman 2204 → 613. Pictured and looked at after: Bell tent, Stones, Pine needles, Settler, Skeleton, Body, Woman. The biome's card after was measured but not pictured (the click did not take on this machine in that run) |
| 3 | passed | A click on Laugh and Cheer (Woman), on Muscles and Reach (Body), on Walk (Settler): each pill turned on, the line under its row changed to its words, the address kept it (`move=cheer&face=laugh`, `move=reach&layer=muscles`, `move=walk`). "Made" opened on a click (718 letters) |
| 4 | passed | `bun tools/registry.js`: 54 recipes, 54 new versions. `bun tools/scale.js`: 20 of 20. `bun tools/figure.js`: 2 of 2. `vite build` in `TheGame/` (the recipes' piece 206 → 199 kB, the library's 23.8 → 22.5 kB) and in `OS/`: built |

**Known gaps**

- **The stage behind the card was not seen**: this machine's software GPU does not draw the world (intent 0043).
  What a click does to the figure was not seen, only that the card and the address follow it.
- **The words are mine.** Fifty-four descriptions written in one go; each says less than before. Any that reads
  wrong is one line in its recipe's file.
- **Two brand parts are new** (`.g-pills`, `.g-more`) and the four-figure rule lives in the library's page only; the
  dashboard's cards were not looked at.
- **Under 760 px the card is still hidden**, as before; a phone sees the list only.
- A first run measured the Settler's card wrongly (the click did not take; its numbers were the card before it);
  measured again, right.

**Samuel's to decide:** accept or reject; any line he wants worded otherwise.

## Story

## Archived

---

## Todo

- [x] every recipe's `about`, every variant's words
- [x] the card: pills, short labels, `made` closed, the figures
- [x] `tools/words.js`
- [x] the checks, the pictures, the story

## Changelog

### 2026-11-18

- **Asked.** Samuel, with a picture of the Woman's card: "Can you also use this moment to make the prose of each
  variant and right aside text labels way more compact for every existing asset?" (typos tidied).
- **Delivered.** Every recipe's description one short line; every move, layer and expression a few words; the card's
  variants as pills, its labels a word or two, "made" closed, four figures that no longer collide; a check that
  fails on a long line. The Body's card went from 2768 px to 647, the Woman's from 2204 to 613.
- **Good.** All checks pass; the pills work on a figure, the Body and the Settler.
- **Not there.** The stage was not seen (the software GPU); one of eight cards was measured but not pictured; the
  short lines are a first wording, his to change.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-18 | 933576c | every recipe and variant said short; the card compact; tools/words.js |
| 2026-11-18 | e5f566d | proposed: the checks as they were, the story |

On its branch this intent was numbered 0042, and its commits' messages say `Intent: 0042`. It was given 0044 on 2026-11-18,
when the branch was brought to `main`, where 0042 had meanwhile been taken by another intent.
