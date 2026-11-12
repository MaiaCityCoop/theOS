---
name: story-hook
description: A story's hook in TheOS (Stories/<story>/hook.json), step 1 of making a story, before its arc. Use whenever Samuel wants a story's title, its intro, its opening, its first seconds or its hook made, sharpened, made bolder or changed, or says a title is too tame. Two things only, a title of 6 to 12 words and the intro described (20 seconds at most), each pushed as far as it stays true. Every change is a call of `bun Stories/hook.js`; the studio's Hook page only shows it.
---

# Story hook

Step 1 of a story. Before anything else is decided, two things are:

1. **The title**, 6 to 12 words.
2. **The intro**, the first 15 to 20 seconds, *described*: what is seen and what is claimed, in order. Not a script,
   no lines to read.

**These are the story's one title and its one description, everywhere.** The shelf, the studio's head, the arc's
page, the game's story list: all read them from the hook. An arc has no title of its own (the tool drops one), and a
story needs its hook before its arc can be put.

That is all the hook holds for now. How a hook works inside (its levers, its loop) is in the `story-loop` skill: use
it to *find* a title and an intro; what is kept here is only the result.

## Turn every knob as far as it goes

A title and an intro are to be **as thought-provoking and as attention-grabbing as they can be made**. A tame, correct
title is a failed one. So, always:

- **Say the largest true thing.** Not "a city starts with one tent" but "1.3 million people will live here. Today it
  is one tent." Lead with the biggest number, the widest gap, the boldest claim the project itself makes.
- **Put two things against each other.** The size of the promise against the smallness of today; what has never been
  against what happens tonight. The gap between them is the hook.
- **Escalate twice.** Write it, then ask "can this be bigger?" and write that, then once more. Ship the last version
  that is still true: every claim needs its receipt (a number, an event, something the story really shows). Never
  soften a claim to make it safe; if it is not true, go back one step, do not hedge.
- **Front-load.** The intro makes its claim in its first breath, shows what is at stake and how small the start is,
  flashes what the film will deliver, sets a clock, and ends on the question the whole film answers. No greeting, no
  "in this video", no build-up.
- **Leave the question open.** The intro ends on it; only the arc's relief answers it (the `story-arc` skill). The
  Hook page shows that loop, read from the arc: where it opens, where it closes.

A check before putting it: would a stranger stop on this title, and think "wait, really?", and then, once it is
explained, "…yes, actually"? Only the first is bait; only the second is boring.

## The three rules

1. **Only the tool changes a hook**: `bun Stories/hook.js put <story>` (whole: `{ title, intro, seconds }`),
   `set <story> title=… intro=… seconds=…`, `show <story>`. It refuses a title outside 6 to 12 words and an intro over
   20 seconds.
2. **The page only shows**: Stories → the story → Hook, the studio's first page, before Arc.
3. **Samuel's words stay his.** The intro is a description. If it quotes him, the quote is his own (from an intent or
   a transcript), never written for him.
