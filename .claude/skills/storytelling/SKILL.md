---
name: storytelling
description: How a story is made in TheOS, step by step, and which skill holds each step. Use first whenever Samuel talks about storytelling, the story pipeline, a day's story, a devlog film, or asks what comes next for a story, before any of the single steps (story-ideas, story-hook, story-arc, story-scenes).
---

# Storytelling

*This is the story of how one million humans build their own solarpunk city, from the ground up. In just 16 years.*
One story a day, 5,423 days. A story is a cinematic long-form film of ten minutes, composed of scenes that each also
stand alone as a short.

## The steps, and where each lives

| Step | What is decided | Kept in | Tool | Skill |
| --- | --- | --- | --- | --- |
| 0 · Ideas | what could be told: topics gathered backwards from what was built | `Stories/ideas/` | `bun Stories/ideas.js` | `story-ideas` |
| 1 · Hook | the title (6 to 13 words) and the intro (20 s at most) | `Stories/<story>/hook.json` | `bun Stories/hook.js` | `story-hook` |
| 2 · Arc | the viewer's journey: per section its emotion, what moves them, the state it leaves them in | `Stories/<story>/arc.json` | `bun Stories/arc.js` | `story-arc` |
| 3 · Scenes | each section as a timeline of its own: world shots, footage, sound | `Stories/scenes/`, `Stories/objects/` | `bun Stories/scenes.js` | `story-scenes` |

Still to come, in this order: each scene's own script (the `sandbox-script` and `writer` skills), its film, and the
story composed of its scenes.

## What holds for every step

- **State is in files; a tool is the only door.** Nobody edits those files by hand. Each tool refuses what breaks its
  step's rules, so a broken hook or arc cannot be stored.
- **The dashboard only shows.** Stories (http://localhost:5180/#stories): the shelf, the scenes, the ideas; a story's
  studio opens on Hook, then Arc. Nothing there changes anything.
- **Ideas come from what happened**, read backwards from the intents and their history. Stories cut across intents.
- **Not told:** how it was built (frame rate, bugs, plug-ins, the dashboard). Sky, weather, the world, the city and
  its people are.
- **Samuel's lines are his own words.** Never written for him. She is Maia; never "aven", "AI" or "AGI" in a story.
- **Everything is pushed as far as it stays true**: the title, the contrasts, the tension. Tame is failed.
- **Each day ends on a cliffhanger** that the next day's hook takes up.

Work on storytelling is tracked like all work, as intents (the `intents` skill): 0012 the ideas, 0013 hook, arcs,
scenes and the player.
