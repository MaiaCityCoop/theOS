---
name: story-scenes
description: Scenes in TheOS (Stories/scenes/, Stories/objects/): timelines that stand alone and that stories are composed of. Use whenever Samuel wants a scene or a short made, imported, played or changed; footage, video, voice, music or sound brought into a story; media stored or fetched by hash; the trailer or a film from the old play brought over; a transcript of a scene; or asks why a film stutters or does not play. Every change is a call of `bun Stories/scenes.js`; the studio only shows and plays.
---

# Scenes

**A scene is a short**: one timeline that stands alone (it is also posted by itself) and that other timelines
contain. A story is composed of scenes; one scene may play in many stories. The trailer is a scene.

## The scene and its media

`Stories/scenes/<scene>/scene.json` is the timeline: `{ schema: 'scene/1', id, title, format, fps, source?, tracks }`,
each track `{ id, kind, clips }`, times in seconds.

| Track | A clip holds |
| --- | --- |
| `shots` | `at`, `duration`, `transition`, `camera` (why), and either `world` or footage (below); `frame`: its still |
| `voice` | `who`, `line`, `cues: [{ at, text, em? }]` (its subtitles; `em` sets one alone and large), `audio`: its take |
| `captions` | what is written over the picture: `kind` (title, note, samuel, maia), `text`, `over` |
| `notes` | the editor's notes: section, emotion, pace, mood, sound |
| `music`, `sfx` | `audio`, `audio_in`, `gain` (dB), `keys` ([seconds into the clip, dB]), `fade_in`, `fade_out`, `eq` |

**Media is never in the scene's folder and never in git.** Every picture, video and sound lies flat in
`Stories/objects/`, named by its BLAKE3 hash; `Stories/objects.json` (kept in git) says what each is.

## A shot is one of two things

- **The live world**, filmed by the virtual camera: `world: { keys: [{ pos, look, mm }], ease?, hour?, in?, inSecs?,
  out?, kind?, act? }` (the keys of `TheGame/cine/README.md`).
- **Footage**: `video` (an object's hash, played muted from `video_in`) with its still `frame`, or the still alone.

A scene may mix them freely. A scene with no world shot loads no game at all: it is ready at once.

## The tool

`bun Stories/scenes.js`: `put <scene>`, `list`, `show <scene>`, `transcript <scene>` (what is said, with its times),
`objects <scene>` (each object checked against its hash), `fetch <scene>` (its missing objects, from `source.files`),
`add <file>` (a file taken in as an object: prints its hash).

## Bringing one in from the old play

1. The story's JSON from the `maia-play` MCP's `get_story` (its id from `list_stories`).
2. Made a `scene/1`: its tracks as they are, `source: { play, version, number, files: 'https://play.maia.city/api/files/' }`.
3. `put`, then `fetch` with `MAIA_PLAY_AUTH` set to the MCP's own Authorization (read from its config; never printed,
   never written down). The MCP's `get_file` cannot carry media: it returns bytes as text and breaks them.
4. `objects <scene>`: every hash must hold. `transcript <scene>` and its `notes` track tell its feeling.

## Playing

`http://localhost:5180/game/timeline.html?scene=<scene>`, and Stories → Scenes opens one in the studio with its
timeline (picture, subtitles, voices, music). The space bar plays and pauses. The player is `TheGame/cine/media.js`
on the film's one clock (`TheGame/cine/film.js` decides whether the game is loaded).

What was learned making it play smoothly, and must stay so:

- **One clock; nothing else keeps time.** Picture and sound are told the film's time.
- **Sound is decoded once and set on the sound clock itself** at a play or a seek. A player chased with seeks
  stutters (Safari starts a sound late and is then seeked again and again).
- **A playing video is not touched**: no speed change, a seek only past half a second off. A video not shown is put
  in place only while the film is held.
- **Nothing is decoded or filtered at a cut**: each shot's backdrop is made once at the start.
- **The world is not drawn under footage**, and not loaded for a scene without a world shot.
- Footage of another shape stands whole in the 16:9 frame, its own still blurred behind it: never cropped.
- To find a stutter: play it in headless WebKit and list the slow frames **by the film's time**; they fall on what
  causes them (the `theos-flicker-measuring` way).
