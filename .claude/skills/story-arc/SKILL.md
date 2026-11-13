---
name: story-arc
description: A story's arc in TheOS (Stories/<story>/arc.json): the viewer's emotional journey through it, a section at a time, before any shot or word. Use whenever Samuel wants to structure a story or a day's film, lay out its hook, trailer, scenes, relief and outro, set or change what a section makes the viewer feel, what moves them or the state it leaves them in, talks about the emotional journey, the roller coaster, the viewer's transformation or state A to state B, or asks to turn ideas into a story. Every change is a call of `bun Stories/arc.js`; the studio's Arc page only shows it.
---

# Story arc

Step 2 of a story, after its hook (`story-hook`). The arc is the viewer's journey and nothing else: where they
arrive, and for each section what they feel, what moves them, and the state it leaves them in. The whole story has to
read in one look. Shots, sound, settings, lines and dialogue are not the arc's; they come with the scenes
(`story-scenes`).

## The primitives

```
arc      { day, from, sections, next, inGame }      from: the state the viewer arrives in
section  { id, kind, title, minutes,
           emotion, charge, tension,                 one word; up (lifts) or down (weighs); 0 to 10
           how,                                      what in it moves the viewer
           to,                                       the state it leaves them in: the next section's start
           scene }                                   its scene, once made
```

Every line (`from`, `how`, `to`, `title`) is 90 characters at most. If a state needs more, it is two states.

## The rules (the tool refuses anything else)

1. **Only the tool changes an arc**: `bun Stories/arc.js put|show|set`. The page (Stories → the story → Arc) only shows.
2. **The order**: hook, trailer, scenes (three at least, one to three minutes each), relief, outro. Ten minutes in
   all (10 to 11); a scene too many belongs to the next day.
3. **A roller coaster**: the charge turns at every section, and neighbours never carry the same emotion. The hook
   weighs (an open question), the relief lifts (the hook's promise kept), the outro weighs again (a cliffhanger the
   next day's hook picks up).

## Writing one

- **Start from the viewer, not from what was built.** On day 1 they are a stranger with no background: no word of ours
  means anything to them yet. `from` says that state plainly.
- **A state is what the viewer would say or feel** ("a real plan with a face, but better how?"), never what the film
  shows. `how` is the one thing in the section that moves them there.
- **Each `to` must differ from the state before it.** A section that leaves the viewer where it found them goes.
- **Read the `to` lines top to bottom**: they alone must tell the story.
- **Every scene is a dialogue between the human and Maia** (avenMAIA): he wishes and gives feedback, she builds, he
  turns idea and taste over, she builds again. "Hey Maia, …" is always the opening of a scene, never a section of its
  own. The arc only hints at it in `how`; the turns are written with the scene.
- Do not plan shots here. Which pictures (the live game, the human to the camera, generated visions) is the scenes'
  step.

Then tell Samuel the journey in a few lines; he reads the page. The whole pipeline: `storytelling`.
