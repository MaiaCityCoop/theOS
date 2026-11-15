# Thirty-seven seconds to a meadow

**Maia City.** A dialogue between Samuel and Maia.
Told for [intent 0026](../../Intents/0026-the-start-twice-as-fast.md), the start made faster; its facts are in that
intent's [changelog](../../Intents/0026-the-start-twice-as-fast.md#changelog) and in the receipts below. The film is
[`timeline.json`](timeline.json): the camera's moves and the subtitles, played live in the game, the same every time:
`http://localhost:5173/timeline.html?story=0026-the-start-twice-as-fast`

## The series

> This is the story of how one million humans build their own solarpunk city, from the ground up.
> In just 16 years.

## The hook

- **Title:** Thirty-seven seconds to a meadow
- **Overlay:** THE START
- **Shot:** the walker's first view, the veil just gone: the meadow, the tent ahead.

## The story

Every city starts on a green meadow, with one tent. Before anyone can stand on it, the game has to make it: paint
its textures, raise the land, compile everything the GPU will draw. Samuel opens the game and waits. The game's
initial loading time is quite bad, he says. He wants it twice as fast.

Maia measures before she touches anything: the dev server and the build the host serves, on a desktop and on a phone
slowed to a mid-range one. Thirty-seven seconds on the desktop before the meadow is there. Forty-seven on the phone.

Then she looks at what the time went into. Little of it was the game's own code. The GPU compiled its passes one
at a time, each in the moment it was first drawn, and everything asked of it after that waited, the page too. Every
material of the world was compiled twice: once for the canvas, once for where it is really drawn. Every texture was
painted four times over to find its relief. And a shader shared by several passes was compiled again for each of
them: the largest, six times.

So now everything is compiled before it is drawn, side by side, once, for the target it is drawn into. A texture is
painted once. The host keeps what does not change and sends the scripts smaller.

Fifteen seconds on the desktop. Twenty-four on the phone: almost half, not quite. And all of it measured in a browser
that has no GPU of its own; what Samuel's iPhone does with it is still to be seen.

## The film: 47 seconds, two voices

| At | On screen | Who | Line |
| --- | --- | --- | --- |
| 0:00 | The walker's first view, the tent ahead, edging forward | | *title:* Thirty-seven seconds to a meadow |
| 0:05 | | Samuel | The game's initial loading time is quite bad. |
| 0:08 | | Maia | I timed it first. Thirty-seven seconds. |
| 0:09 | Down among the blades, towards the fire and the tent | | |
| 0:11 | | Maia | On a slowed phone, forty-seven. |
| 0:15 | | Maia | The GPU compiled one pass at a time, as each was first drawn. |
| 0:18 | | Maia | Everything else waited. The page too. |
| 0:19 | Round the tent's side, close | | |
| 0:21 | | Maia | Every material was compiled twice. |
| 0:25 | | Maia | Every texture was painted four times over. |
| 0:28 | Straight up from the tent | Samuel | Twice as fast. |
| 0:31 | | Maia | Now each is compiled once, side by side, for where it is drawn. |
| 0:35 | | Maia | A texture is painted once. |
| 0:38 | The climb going on, back from the meadow | Maia | Fifteen seconds now, on the desktop. |
| 0:41 | | Maia | On the phone, twenty-four. Almost half. |
| 0:45 | Fade to the sky | | *note:* Measured without a GPU. The iPhone's own numbers are still to come. |

## Receipts

| Line | Where it is true |
| --- | --- |
| Samuel's two lines | His request of 2026-11-15, as it reached this session: "the game's initial loading time is quite bad", startup "twice as fast" |
| "Thirty-seven seconds", "forty-seven" | The baseline, production build, medians of five runs: 37.6 s to playable on the desktop, 46.7 s on the phone (iPhone 15's screen, the CPU 4× slower, Slow 4G) |
| "one pass at a time, as each was first drawn" | A trace of the GPU process: 48 texture passes, 63 packing passes and the ground's pass compiled one after another on its own thread, 31 of the 33 s it was busy |
| "The page too" | One task of 25.6 s on the page's thread, waiting to hand meshes to the GPU (`queue.writeBuffer`) |
| "compiled twice" | The start compiled the world for the canvas; the world is drawn into the screen's own target, and three keeps a pipeline per target |
| "painted four times over" | The old relief pass painted each material three more times a texel, after the colour pass |
| "compiled again for each of them: the largest, six times" | The 63 packing passes are 26 shaders; asked for side by side, the 140 KB one was compiled six times, two others three times |
| "Fifteen seconds", "twenty-four" | After, the same way: 15.4 s on the desktop (2.45×), 23.8 s on the phone (1.96×); the intent's Build section has every run |
| "Measured without a GPU" | This container draws WebGPU on SwiftShader, the GPU done by the CPU |

## Open

- **Samuel's iPhone.** Every number here is from Chromium in a container without a GPU. The phone is an emulation (a
  slowed CPU and network), not Safari on an iPhone.
- **Not quite half on the phone:** 1.96× against the baseline, 2.01× against the baseline measured again the same
  afternoon. On main as it is now, which got slower meanwhile, 1.81×.
- **The day and the humans in the game** are not set (`day`, `inGame`): not counted here.
- **The voices.** The lines are subtitles only; Samuel's are his to change.
