---
name: intents
description: How work is done in TheOS. Use whenever something is to be made, changed or fixed in this repository, whenever Samuel asks for work, mentions an intent, a work package, a changelog, a story or a devlog, or asks what is open. Every change belongs to an intent (Intents/NNNN-slug.md); this skill says how to open one, move it through idea, define, build, propose, story and archived, keep its changelog, trail and todo, and spawn its story in TheStory/.
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

At **Propose**, spawn `TheStory/NNNN-slug/` with two files:

- `story.md`: the title, a link back to the intent and its changelog, and the story in short
  beats. Filled properly at the Story state; at Propose a first draft is enough.
- `timeline.json`: the film of the story for the in-game camera, played live and the same every
  time:

      { "intent": "NNNN", "title": "…",
        "clips":    [ { "name", "kind", "secs", "ease", "in", "why", "keys": [ { "pos", "look", "mm", "roll", "focus" } ] } ],
        "captions": [ { "at": seconds, "for": seconds, "kind": "title" | "human" | "agent" | "note", "text": "…" } ] }

  `clips` is the virtual camera's timeline (`TheGame/cine/README.md`); `captions` are the
  documentary lines over it: `human` for what was asked (their words), `agent` for what was made,
  `note` for a plain fact, `title` for a heading. Compose camera moves with
  `TheGame/cine/trailer.js` or by hand; shots should show what the intent changed where it can be
  seen in the world.

It plays at `http://localhost:5173/timeline.html?story=NNNN-slug`, and from the OS dashboard.

## Where things are

| Folder | What |
| --- | --- |
| `Intents/` | the intents, `TEMPLATE.md` |
| `TheStory/` | a folder per proposed intent: `story.md`, `timeline.json` |
| `TheGame/` | the world and the virtual camera |
| `OS/` | the dashboard over the three: `bun run dev` at the repository's root starts it (port 5180) with the game (5173) |

## Do not

- Do not write a section before its state, or skip Define's checks.
- Do not accept, reject or archive on your own.
- Do not put into Propose, the changelog or a caption anything that was not actually seen.
- Do not keep a second changelog anywhere else.
