---
name: story-arc
description: A story's arc in TheOS (Stories/<story>/arc.json): its sections, their contrasts and the tension through them, before any script. Use whenever Samuel wants to structure a story or a day's film, lay out its hook, trailer, shorts, relief and outro, set or change a section's emotion, pace, colour, music or tension, talks about contrast between scenes, gateways or transitions, the tension curve, or asks to turn ideas into a story. Every change is a call of `bun Stories/arc.js`; the studio's Arc page only shows it.
---

# Story arc

Step 2 of a story, after its hook (`story-hook`).

**A scene is a short**: one timeline that stands alone and that other timelines contain. A story is composed of
scenes, and one scene may play in many stories (the trailer is a scene).

A story is one long film of ten minutes (YouTube long form, cinematic), made of **sections**, each one scene:

1. **Hook**: the question the whole film answers. It is left open.
2. **Trailer**: everything that is coming, fast.
3. **Scenes**, at least three, one to three minutes each. The first is the vision: Samuel on what Maia City is, before
   the film turns to how the world was built.
4. **The relief**: the hook's promise kept, the big release.
5. **Outro**: a cliffhanger for the next day.

The arc says what each section *feels* like and how the tension runs. It holds **no script, no lines, no content**:
those come later (the `story-loop`, `sandbox-script` and `writer` skills). An arc is made from ideas on the board
(the `story-ideas` skill): a section names the idea it is built on.

## The three rules

1. **Only the tool changes an arc**: `bun Stories/arc.js put|show|set` (its head lists the fields). Never edit
   `arc.json` by hand: the tool refuses an arc that breaks the rules below.
2. **The page only shows**: Stories → the story → Arc, the studio's first page.
3. **Neighbours are opposites, in every sense: an emotional roller coaster at every gateway.** Two neighbouring
   sections never share their pace, their dynamic, their colour, their emotion, or their emotion's **charge**: `up`
   (it lifts: hope, belonging, delight, awe, triumph, peace) or `down` (it weighs: doubt, longing, frustration, fear,
   unease). So hope cannot be followed by belonging, nor majestic by majestic: the charge turns at every gateway. The
   tool refuses anything else. (The hook is `down`, an open question, and the relief `up`, so a story has an odd number
   of sections.)
4. **Ten minutes.** The whole is 10 to 11 minutes. A scene that would make it longer belongs to the next day's story.
5. **The outro is a cliffhanger** for the next day: it opens a question and leaves it open (it ends higher than it
   began); the next day's hook picks it up.

## A section

| Field | What it is |
| --- | --- |
| `id`, `kind`, `title`, `idea`, `minutes` | which section, what it is called, the idea it draws on, how long |
| `scene` | its scene, once it is made (a folder of `Stories/scenes/`): the page marks the section as made |
| `setting` | where it plays: its own place, unlike its neighbours' |
| `emotion`, `charge`, `feeling` | the one emotion it carries, whether that lifts (`up`) or weighs (`down`), and how it feels in the body |
| `pace` | the cutting: still, slow, medium, fast, frantic |
| `dynamic` | its energy: calm, playful, tense, hectic, majestic, intimate |
| `colour` | `{ name, hex }`: its own palette, by which the page draws it |
| `music` | what is heard |
| `question` | the pressing question it opens (its tension) |
| `release` | how that tension is released at its end |
| `tension` | `{ in, peak, out }`, 0 to 10: before, at its height, after |
| `beats` | `[{ at: 0..1, level, note }]`: the small challenges and failures on its way (labels, not lines) |
| `gate` | its gateway into the next: the contrast, said in words ("calm to storm: …") |

## A scene stands alone

Each scene is also cut out and posted by itself, so it is a whole story in small: it opens its own question, runs
into trouble (its beats: a first try that fails, a second), peaks, and is released before it ends. The tool refuses a
scene whose peak is not above both its start and its end. Small intros and calls to action for the posted scenes are
templates added later; they are not in the arc.

## Making one

1. Pick the ideas (`bun Stories/ideas.js list`); for each scene one idea, and from its story points the question and
   the failures (they become `question`, `release` and `beats`).
2. Order them for contrast, not for chronology: after a loud one a quiet one, after wide a close one, after warm cold.
3. For every gateway write the contrast as a pair: what ends and what begins.
4. Check the whole: the tension curve should climb in waves to the last short and fall in the relief; the hook's
   question is answered in the relief and nowhere before.
5. `put`, then tell Samuel the order and the contrasts in a few lines; he reads the page.

The scenes themselves, their media and their player: the `story-scenes` skill. The step before this one, the title
and the intro: `story-hook`. The whole of it: `storytelling`.
