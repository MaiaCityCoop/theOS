---
id: "0012"
title: Story ideas, gathered backwards
state: propose         # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-12
story:
---

# 0012 · Story ideas, gathered backwards

## Idea

Samuel, 2026-11-12: "let's talk about storytelling, pipeline, and its skills. Let's build it up from the ground. Can you
list me all the major intents and their topics that we covered the last 24h, in a list of clustered topics that we could
cover, like grass, wind, sun, trees/forest, forest floor, water/river, snow?" Then: "storytelling should support cross
intents gathering. Those topics we don't want to cover: the craft behind it. The world, sky and weather is interesting.
Do you have an idea how we can upgrade our current storytelling app/view to have some kind of story/concept/idea pad
backlog, where we list and cluster those, incl. intent refs?" And: "we always create those ideas like now, with the help
of backwards analysis of what happened with the last intents' history, and then we extract the concepts out of it, with
LLMs. UI just displays state, no interactive changes, only change via tool calls." Scope: "all 11 intents". "do it".

## Define

Approved as put to him (a store, its tool, a skill, a page that only shows).

**Deliverables**

1. The store: one Markdown file per idea in `Stories/ideas/`, naming its lane, the intents it draws from and its stage,
   with what happened, Samuel's own words and what the world can show.
2. The tool: `bun Stories/ideas.js`, the only way an idea changes.
3. The skill: `.claude/skills/story-ideas/SKILL.md`, how ideas are gathered backwards and kept.
4. The page: Stories → Ideas in the dashboard, lanes of cards, one opened under its lane; nothing on it changes anything.
5. The first gathering, over all 11 intents.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | ideas round-trip through the tool | `put`, then `list` and `readIdeas()` |
| 2 | a bad reference is refused | `set wind intents=0099` |
| 3 | the page shows them | http://localhost:5180/#stories |

**Out of scope**

- Turning an idea into a story (hook, script, film): the next steps of the pipeline, with their own skills.
- Any control on the page that changes an idea.

## Build

- An idea is a topic, not an intent: it lists its intents, so a story gathers across them.
- Stages: raw → hooked → scripted → filmed → told. "The first tent" is `told` (story 0001).
- The craft behind it (frame rate, WebGPU, the flicker hunt, plug-ins, the house itself) is gathered too and dismissed:
  shown folded away as "Not for stories", so it is neither lost nor gathered twice.
- `ideas.json` keeps the lanes' order and the commit the history was last read up to; the next gathering starts there.
- The dashboard reads the files with the tool's own `readIdeas` (`/api/ideas`) and draws them again whenever the stories
  are opened. The studio's shelf did not scroll (its body holds still for the film); it scrolls now in its own window.

## Propose

**Delivered:** `Stories/ideas.js`, `Stories/ideas/` (21 ideas), `.claude/skills/story-ideas/SKILL.md`, the Ideas
section in `OS/index.html` and `OS/src/main.js`, `/api/ideas` in `OS/vite.config.js`.

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | 21 ideas put and read back: 16 to tell in four lanes, 5 not for stories; a line's time, intent and text intact |
| 2 | passed | `set wind intents=0099` answered "wind: no intent 0099" and left the idea as it was |
| 3 | passed | the page showed 4 + 7 + 3 + 2 ideas and "Not for stories" 5; Clouds opened under its lane with its three columns |

**Known gaps:** the first gathering is from the commit subjects and the intents' idea sections, not from every
changelog line; several ideas have no words of Samuel's yet. The page was looked at in the built-in browser, not in Safari.

## Story

## Archived

---

## Todo

- [x] store, tool, skill, page, first gathering
- [ ] Samuel reads the ideas and says what to merge, rename or put aside
- [ ] the next step of the pipeline: from an idea to its hook

## Changelog

### 2026-11-12

- **Asked:** a backlog of story ideas, clustered, with intent references, gathered backwards by LLMs; a page that only
  shows state; every change a tool call; all 11 intents.
- **Delivered:** the five deliverables above.
- **Good:** nothing new to run: files, one small tool, one route.
- **Broke / not there yet:** the studio's shelf could not scroll, so the ideas under it were out of reach (mended).
- **Asked (later, with a screenshot):** "make the selected detail show in a 50/50 right aside area instead. And also
  source the what happened changelog as abstract summary points as well, filter out the purely technical ones, and keep
  the storytelling potentials"; and: "styling wise adopt the same cards UI as we have in the actual story timeline viewer".
- **Delivered:** the opened idea in the right half, the lanes at the left; every idea's points written anew from the
  changelogs' Asked, Found and Broke as story points (a wish, a before and after, a first try that failed), no times,
  nothing purely technical; the page drawn as the timeline is (navy panels, cards with an inset ring, the sun's when
  chosen, chips in the voices' colours); the skill says how points are written.
- **Good:** the changelogs' "Found" notes hold the turns: the pine held against the photos, the tent that took no snow.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-12 | `8d3e5d5` | the ideas, their tool and their skill (the old day-2 film's files, already staged for the rename to the scene test-gate, went in with it) |
| 2026-11-12 | `94f59ee` | the ideas' page in the dashboard (it shares the dashboard's files with the arcs) |
