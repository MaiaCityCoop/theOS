---
name: intents
description: How work is done in TheOS. Use whenever something is to be made, changed or fixed in this repository, whenever Samuel asks for work, mentions an intent, a work package, a changelog, a story or a devlog, or asks what is open. Every change belongs to an intent (Intents/NNNN-slug.md); this skill says how to open one, move it through idea, define, build, propose, story and archived, keep its changelog, trail and todo, and spawn its story in Stories/.
---

# Intents

An **intent** is one work package and its changelog at the same time: one Markdown document in
`Intents/`, `NNNN-slug.md`, that is written as the work happens. Its states are its sections; a
section is filled when the intent reaches that state and not before. Nothing is changed in this
repository outside an intent.

Copy `Intents/TEMPLATE.md` to open one. The next number is one more than the highest in the folder.

## The states

| State | Who writes | What goes in its section | It ends when |
| --- | --- | --- | --- |
| **Idea** | the agent, from the human's words | What is wanted and why. The human's own words where they exist, tidied of typos only. | the human says go on |
| **Define** | the agent | What done looks like: the deliverables, and for each a **check** (how it will be shown to be done: a command, a page to open, a number to read). What is out of scope. This is the spec and the delivery gate in one. | **the human approves it.** Do not build before. If the human asked for the work outright and the definition holds no surprise, say so in one line and build. |
| **Build** | the agent | Notes while building: decisions taken, what turned out different from the definition and why. | every deliverable exists |
| **Propose** | the agent | What is delivered and where to look at it; each check with its result as it really was (passed, failed with the output, not run and why); known gaps. The story folder is spawned now (below). | **stop.** The human decides. |
| **Story** | the agent, after the human's yes | The work as a story for the devlog: what the human wanted, what the agents made, what went wrong on the way, in beats. Link to the story folder. | the story plays in the game |
| **Archived** | the human's decision, written down by the agent | `accepted` or `rejected`, the date, the reason in a line. | it is the end |

`state:` in the front matter always names the current state; `outcome:` is set only on archiving.
Only the human approves a definition, accepts or rejects. An intent may go back (propose to build
on a rejected check); say so in the changelog.

## The end of the document

Under the states, three running sections, kept current from the first day:

- **Todo**: a checklist of what is left. Tick, do not delete.
- **Changelog**: one entry per request cycle with the human, newest last: the date, what was asked,
  what was delivered, what was good, what broke or is not there yet. Facts only: nothing that did
  not happen, no result that was not seen. This is the raw material of the story.
- **Trail**: the audit trail, a table of the commits made for this intent: date, short hash, what
  it did. Code is committed first, then the trail row naming it.

## Commits

Every commit made for an intent ends its message with `Intent: NNNN` (before the co-author line).
One commit per request cycle where that is natural, so stages can be checked out again.

## The story

At **Propose**, spawn `Stories/NNNN-slug/` with two files:

- `story.md`: the story, told. Not a technical summary: an episode of the devlog *How AGI learns
  to build a city in 16 years*, narrated by avenMAIA in the first person, about how the world and
  the city grow and what this intent added to them. Start from the viewer who knows nothing
  ("a city starts on a green meadow; first we need a world"). It holds the hook (title, overlay,
  opening shot), the story in a few paragraphs, the film as a table (time, picture, line), the
  receipts (every number and quote, and where it is true), and what is still open. A link back to
  the intent and its changelog. Write it with the `sandbox-script` and `writer` skills where they
  are installed. Samuel's own part to camera is his to say: list it as open, never write his lines.
- `timeline.json`: the film of the story for the in-game camera, played live and the same every
  time:

      { "intent": "NNNN", "title": "…",
        "clips":    [ { "name", "kind", "secs", "ease", "in", "why", "keys": [ { "pos", "look", "mm", "roll", "focus" } ] } ],
        "captions": [ { "at": seconds, "for": seconds, "kind": "title" | "maia" | "samuel" | "note", "text": "…" } ] }

  `clips` is the virtual camera's timeline (`TheGame/cine/README.md`). `captions` are the film's
  subtitles: `maia` for avenMAIA's narration, `samuel` for a line Samuel really said (typos
  tidied, nothing else), `note` for a plain fact on screen, `title` for the film's title card
  (with `over` for the small line above it). Subtitles are short: one thought, two lines at most,
  about 42 characters a line, on screen two to four seconds, never two at once. About 150 words
  for a minute of film. Compose camera moves with `TheGame/cine/trailer.js` or by hand; a shot
  shows what its line talks about wherever the world can show it.

It plays at `http://localhost:5173/timeline.html?story=NNNN-slug`, and from the OS dashboard.

## Where things are

| Folder | What |
| --- | --- |
| `Intents/` | the intents, `TEMPLATE.md` |
| `Stories/` | a folder per proposed intent: `story.md`, `timeline.json` |
| `brand/` | `MaiaCity.svg`, the mark, and `brand.css`, the one look of every page, grown from the mark (cream, forest, gold; round heavy letters; soft shapes; liquid glass over the game). New interface takes its colours and shapes from there, never its own |
| `TheGame/` | the world and the virtual camera |
| `OS/` | the dashboard over the three: `bun run dev` at the repository's root starts it (port 5180) with the game (5173) |

## Do not

- Do not write a section before its state, or skip Define's checks.
- Do not accept, reject or archive on your own.
- Do not put into Propose, the changelog or a caption anything that was not actually seen.
- Do not keep a second changelog anywhere else.
