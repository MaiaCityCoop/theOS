# Compass

The serial's compass: the core message every day of Maia City's story points to, who it is about, how it
is told, and every episode. One story a day, 5,423 days, to 2042.

It is a [story-skills](https://github.com/danjdewhurst/story-skills) project, so every file is markdown
with YAML frontmatter and the CLI checks it: deaths, promises and payoffs, open questions, registries
and links. `_index.md` files are generated; never edit their tables by hand.

**Read it in the dashboard:** Stories → The Compass (http://localhost:5180/#stories). The page only shows
it, as everywhere in TheOS. `Website/compass.js` reads these files as they stand and serves them at `/api/compass`.

**Change it only with the CLI.** No Node is installed here, so run the bundled copy with bun, from this
folder, never from the plugin's checkout:

```
cd Compass && ~/.bun/bin/bun ~/.claude/plugins/cache/story-skills/story-skills/0.25.0/bin/story.js check .
```

`reindex .` rebuilds the registries, `wordcount . --write` recounts the episodes, `next .` says what to
write next, and `add chapter|character|arc|system|location|term` scaffolds a new entry.

## This is the words; `../Stories` is the film

The two are complementary and must not be made to duplicate each other.

| | |
| --- | --- |
| `Compass/` | What a day's story *is*: its premise, its stakes, its characters, its arcs, and the episode's prose. Keeps 16 years consistent. |
| `../Stories/` | How a day's story is *shot*: hook, arc, scenes, timeline, media. |
