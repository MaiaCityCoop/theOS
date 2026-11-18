---
id: "0040"
title: The artifact library and the tribe strategy
state: propose          # idea | define | build | propose | story | archived
outcome:               # accepted | rejected, set only when archived
opened: 2026-11-18
story:                 # Stories/0040-slug/, set at propose
---

# 0040 · The artifact library and the tribe strategy

## Idea

> "can you weave this into some tribe / community building strategy paper, just the best ofs but in our own wording into the compass? so we have a reference later to upgrade our levelling mechanics accordingly? also introduce some kind of artifacts store, incl an artifact-skill, that stores those kind of transcripts, youtube, videos, any online link, x.com, blog article, social media post etc into its own artifacts mini app (as its own app view from dashboard too please). it's like an artifact library (tagged with categories and filterable)." (Samuel, 18 Nov 2026)

Each artifact is a standalone JSON checked against a JSON schema. It holds the link, its type, a short title, a description of at most 200 words, a summary of at most three paragraphs, and all its tags. The original (transcript, article, paper) is extracted, and the thumbnail is kept where possible. The first artifact is the tribe-building video Samuel pasted.

## Define

**Deliverables**

1. `Artifacts/schema.json`, `Artifacts/store.js` and `Artifacts/artifacts.js`: the schema, the reader and validator, and the one tool (`new`, `source`, `thumb`, `check`, `list`).
2. `.claude/skills/artifacts/SKILL.md`: how a link becomes an artifact.
3. The dashboard's Artifacts app: `#artifacts` and a tile, read from `/api/artifacts`.
4. The first artifact: `the-worst-way-to-build-a-tribe`.
5. `Compass/worldbuilding/systems/the-tribe.md`: the tribe strategy, in our words, with proposals for the ladder.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | Every artifact passes its schema | `bun Artifacts/artifacts.js check` (also in CI) |
| 2 | The Compass passes | `story.js check --path Compass` |
| 3 | The app filters, searches and opens an artifact; no horizontal scroll at 375 px | the browser at `/#artifacts` |
| 4 | The build writes `/api/artifacts` | `bun run --cwd OS build` |

**Out of scope**

- Deciding the ladder upgrades (they are listed in the sheet's Open section).
- Syncing with maia-play's own artifacts.

## Build

## Propose

The artifact library, its skill and app, the first artifact and the tribe sheet are in PR MaiaCityCoop/theOS#92, together with 0039.

## Story

## Archived

## Todo

- Samuel decides which of the six ladder upgrades in `the-tribe.md` go into `the-game.md`.

## Changelog

- **2026-11-18:** The library added: the schema, store, tool and skill. `source.md` and `thumb.jpg` are git-ignored because the repository is public and they are the authors' work. The published site shows the source's own thumbnail URL. Added the Artifacts app (tile and `#artifacts`) and the first artifact (ReTribalize Project, 7 Nov 2026, with a 5,319-word transcript). Added `the-tribe.md` to the Compass, and the artifact check to CI.

## Trail

| When | What |
| --- | --- |
| 2026-11-18 | Built and proposed in PR MaiaCityCoop/theOS#92 |
