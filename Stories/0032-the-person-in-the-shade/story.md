# A shadow of their own

**Maia City.** A dialogue between Samuel and Maia.
Told for [intent 0032](../../Intents/0032-the-person-in-the-shade.md), the person in the shade; its facts are in that
intent's [changelog](../../Intents/0032-the-person-in-the-shade.md#changelog) and in the receipts below. The film is
[`timeline.json`](timeline.json): the camera's moves and the subtitles, played live in the game, the same every time:
`http://localhost:5173/timeline.html?story=0032-the-person-in-the-shade`

## The series

> This is the story of how one million humans build their own solarpunk city, from the ground up.
> In just 16 years.

## The hook

- **Title:** A shadow of their own
- **Overlay:** IN THE LIGHT
- **Shot:** the one tent on the meadow in the late morning sun, the open door dark with shade.

## The story

Every city starts on a green meadow, with one tent. The first person of the library, the Settler, stands on a round of
bare ground beside it. Maia had listed everything about them that is not yet like a real body, and three points of
that list were about the light: they never took a shadow, they never cast one, and their body never shaded itself.
Under a tree, under a cloud, inside the tent, the Settler stood in full sun.

Samuel asked for the shade and the shadows, and he named the two gates that may not move: sixty frames a second, and
the screen's own pixels, 4K on a 4K screen.

Now the Settler takes the shade every other surface takes: the shadow map, the clouds, a storm's dim sky. Inside the
tent their light falls to two fifths of what it was. They cast a shadow, drawn from their pose, and it starts at
their shoes: the map keeps a quarter of a metre of grace before it calls anything shaded, so the person is drawn into
it pulled that far towards the sun.

Where the body meets itself, the map is far too coarse, six centimetres a texel. So sixteen capsules ride on the
bones, and at each of the body's 38 088 points Maia's code works out how much sky they hide and whether one stands in
the sun's way. The arm shades the body; the shirt darkens under it, between the legs, under the chin. Per point of the
body, not per pixel: more pixels cost the capsules nothing.

Nothing else in the picture changed: the world by the tent is the same to the pixel. The frames are no slower in a
browser with no GPU of its own, where the person's own work costs more than before; Samuel's iPhone has not seen it yet.

## The film: 44 seconds, two voices

| At | On screen | Who | Line |
| --- | --- | --- | --- |
| 0:00 | The tent in the sun at eleven, edging forward | | *title:* A shadow of their own |
| 0:05 | | Samuel | Do the shade / shadows thing. |
| 0:08 | | Samuel | Ensure you keep quality gate 60fps and 4K always intact. |
| 0:09 | Towards the open door, into the tent's shade | | |
| 0:12 | | Maia | The person stood in the sun everywhere. |
| 0:15 | | Maia | Under a tree. Under a cloud. In the tent. |
| 0:18 | | Maia | Now they take the shade the grass takes. |
| 0:19 | Under a crown in the forest, its shade on the ground | | |
| 0:22 | | Maia | And their shadow falls, from their shoes. |
| 0:25 | | Maia | Sixteen capsules round the bones. |
| 0:29 | | Maia | An arm shades the body. Under it, the shirt darkens. |
| 0:31 | The meadow by the tent, a cloud coming over | | |
| 0:32 | | Maia | Worked out per vertex: more pixels cost them nothing. |
| 0:36 | | Maia | Nothing else in the picture changed. |
| 0:39 | Fade to the sky | | *note:* Measured without a GPU. Safari and the iPhone are still to come. |

## Receipts

| Line | Where it is true |
| --- | --- |
| Samuel's two lines | His request of 2026-11-16, as it reached this session: "do the shade / shadows thing … and ensure you keep quality gate 60fps and 4K always intact" |
| "stood in the sun everywhere" | Intent 0031, points 23 and 24: the person's material read neither the shadow map nor the clouds' shade, and the person was not on the casters' layer |
| "the shade the grass takes" | The person's every sun term now takes `sunDim × cloudShade × shadow`, as the grass and the ground do (`src/world/light.js`). Inside the tent the Settler's pixels fell from 0.382 to 0.150 (linear brightness, main against this branch) |
| "from their shoes" | The map's bias, 0.0004 of its depth, is a quarter of a metre at eye level; the person is drawn into the map pulled that far towards the light (`casterPull`) |
| "drawn from their pose" | From the same angle and light the wave's shadow runs longer than the idle's, where the raised arm adds to it |
| "Sixteen capsules", "38 088" | `capsulesOf` in `characters/kit/human.js`; the Settler's mesh has 38 088 vertices and 73 680 triangles |
| "six centimetres a texel" | The shadow map: 2048 texels over a box of 120 m round the camera at eye level |
| "more pixels cost them nothing" | The person close up, alone, at an inside of 480 × 270 and of 960 × 540: main 77 and 241 ms of SwiftShader's GPU time, this branch 126 and 240: what was added does not grow with the pixels |
| "Nothing else in the picture changed" | The world by the tent, main against this branch: the same picture to the pixel, from the same 137 shader modules |
| "no slower" | The library with the Settler, frame medians 2940 to 3102 ms on main (five runs), 3014 to 3170 on this branch (three); the person's own GPU time rose (42 to 47 ms against 63 to 97, and 33 to 35 ms in the shadow pass) |
| "Measured without a GPU" | This container draws WebGPU on SwiftShader, the GPU done by the CPU |

## Open

- **Samuel's iPhone.** Every number here is from Chromium in a container without a GPU.
- **Inside the tent** the person takes the open sky's light (only their own body hides any of it) and none through
  the canvas: they stand darker than the tent's warm lining.
- **The day and the humans in the game** are not set (`day`, `inGame`): not counted here.
- **The voices.** The lines are subtitles only; Samuel's are his to change.
