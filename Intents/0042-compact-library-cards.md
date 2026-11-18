---
id: "0042"
title: Compact library cards
state: build           # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-18
story:                 # Stories/0042-compact-library-cards/, set at propose
---

# 0042 · Compact library cards

## Idea

> Can you also use this moment to make the prose of each variant and right aside text labels way more compact for
> every existing asset?

Samuel, on 2026-11-18 (typos tidied), with a picture of the library's card for the Woman (intent 0041): its
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

## Propose

## Story

## Archived

---

## Todo

- [ ] every recipe's `about`, every variant's words
- [ ] the card: pills, short labels, `made` closed, the figures
- [ ] `tools/words.js`
- [ ] the checks, the pictures, the story

## Changelog

## Trail

| When | Commit | What |
| --- | --- | --- |
