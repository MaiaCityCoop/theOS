---
id: "0032"
title: The person in the shade, and their shadow
state: propose            # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-16
story: Stories/0032-the-person-in-the-shade/
---

# 0032 · The person in the shade, and their shadow

## Idea

> do the shade / shadows thing … and ensure you keep quality gate 60fps and 4K always intact

Three points of the person's inventory (intent 0031, "In the light") taken up:

23. The person never takes a shadow: the material reads neither the shadow map nor the clouds' shade, so they stay
    sunlit under a tree, under a cloud and inside the tent, and an arm never shades the body.
24. The person casts no shadow: they are not on the casters' layer, so nothing darkens on the ground under them.
25. No shade where parts touch: between the arm and the body, under the chin, between the legs, at the neck and
    shoulders.

The gates stay as they are: the canvas at the screen's own pixel ratio (4K on a 4K screen, `src/core/screen.js`), and
60 frames a second, with no frame made slower and no cost hidden behind the governor's dial.

## Define

Samuel asked for this directly and the definition holds no surprise, so it was built straight away.

**Deliverables**

1. **The person takes the shade.** Every sun term of the person's light (`characters/kit/human.js`, `materialOf`: the
   sun's diffuse light with the skin's light through it, the highlights of skin, leather, brass and eyes, the hair's
   highlight, the sun's part of the cloth's sheen) takes the share of sunlight the light's contract gives every other
   surface (`src/world/light.js`: a storm's dim, the clouds' shade, the shadow map). Under a tree, a cloud or the
   tent's canvas the person darkens as the grass beside them does.
2. **The person casts a shadow.** The kit puts every person it makes on the casters' layer (`src/world/shadow.js`,
   `CASTS`), so a person casts wherever one is drawn: the library's stage, `me.html`, and the world once people stand
   in it (today none does: nothing in `src/city`, `src/world` or `src/scatter` makes a person). The shadow map's pass
   draws them posed, not at rest, and works out no light for them. Their shadow meets their feet.
3. **Shade where the body meets itself**: between the arms and the body, under the chin, between the legs, at the neck
   and shoulders, where a hand hangs by a thigh; and an arm shading the body from the sun. Worked out by the person's
   own shader from capsules round its bones (analytic occlusion); why this way and not another is written in Build.
4. **The gates held**: the canvas at the screen's own pixel ratio, untouched; the frame no slower, measured.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | The Settler in the library: a shadow on the ground under them, meeting their feet; the body shading itself (an arm on the torso) | stills, main beside this branch: Chromium, WebGPU on SwiftShader |
| 2 | Under a tree's or a cloud's shade the person darkens as the grass beside them | the Settler stood in the world, in the sun and in the shade: the brightness of their lit side and of the grass beside them, shade over sun, main and this branch |
| 3 | Inside the tent | a still of the Settler inside the tent, main beside this branch |
| 4 | Before and after, the same way | main and this branch, alternating, three runs each: frame medians and 95th percentiles; what the shadow pass draws; the governor's dial and the canvas's size; the person's own GPU time in the picture and in the shadow pass (`?gputime`). The library with the Settler and the world by the tent; the stress world draws no person |
| 5 | Builds | `vite build` in TheGame and in OS |
| 6 | Nothing else in the picture changes | stills with no person in them, main against this branch: the mean difference and the share of pixels more than 8 of 255 apart |

**Out of scope**

- The rest of the inventory (0031, points 1 to 22): form, skin, face, hair, cloth, skeleton, movement.
- Light scattered through the skin's thickness (point 9), and the fire's light on the person.
- A real GPU and Safari: this container draws on SwiftShader, a GPU done by the CPU; its times are compared, not
  read as a phone's.

## Build

**Where people are drawn.** Only the human kit makes a person (`characters/kit/human.js`, `humanOf`), and only two
pages call it: the library (`library.html`: the stage, and the list's pictures) and `me.html` (`src/me/stage.js`).
Nothing in the world does: `src/city` counts citizens and draws none, `src/world/stand.js` and the scatter stand
assets, and the stress world's walkers are the drawer's creatures (`assets/kit/creature.js`), not people. So the kit
itself puts every mesh it makes on the casters' layer: wherever a person is drawn, now or later, they cast.

**Taking the shade (23).** Every sun term of the person's light now takes `sunDim() × cloudShade(w) × min(map, body)`:
the storm's dim and the clouds' shade as every surface takes them (`cloudAt`), the shadow map, and the body's own
shade from the sun (below). The lesser of the map's shade and the body's own, not both multiplied: where the head
shades the feet the map and the capsules see the same thing, and it is not to be counted twice. The sky's light takes
the body's occlusion (below) with the cloth's own.

**Casting (24).** The shadow map's pass draws what is on the layer `CASTS`; the person's material does no light
there (`unlit()`, as every caster's), and three skins a skinned mesh in the vertex stage of any node material, that
pass's too, so the shadow is drawn from the pose, not the rest.
The map takes a bias before it calls a surface shaded, 0.0004 of its depth: a quarter of a metre at eye level, more
higher up. For a tree or the tent that is nothing; under a person it would leave the ground lit round the shoes, by
the map's own numbers some 13 to 25 cm out (by the sun's height), the shadow starting at the shins (worked out, not
seen: the pull was there from the first still). So the person is drawn into the map pulled towards the light by
exactly that bias (`casterPull` in `src/world/light.js`, worked out from the map's own matrix), and reads the map
with twice it (`shadowAtPulled`), so they do not shade themselves all over. Every other surface reads the map as
before: the bias is now a parameter of `shadowOf`, its default the old constant, so their shaders are the same code.

**Shade where the body meets itself (25): capsules, worked out per vertex.** The ways weighed:

- *A screen-space pass (SSAO):* a full-screen pass over the inside's pixels each frame, reading depth (the frame
  keeps no normals): the dearest at 4K on a phone, it would darken every other surface too (a change to the whole
  picture this work must not make), and it sees only what is on screen.
- *The shadow map:* 2048 texels over 120 m, about 6 cm a texel, with its quarter-metre bias: far too coarse for an
  arm 2 cm from the body.
- *Occlusion baked at rest into the mesh:* nothing each frame, but wrong as soon as an arm swings or the head turns.
- *Capsules round the bones, analytic:* 16 capsules (the trunk's two halves, neck, head, and each upper arm, forearm,
  hand, thigh, shin and foot), their ends held by the bones and written each step. At every vertex the shader works
  out how much of the sky each hides (the sphere of it nearest the point: Quilez's sphere occlusion, with his
  approximation where the sphere stands across the horizon) and whether one stands between the point and the sun (a
  soft edge, wider the farther off). It moves with every pose, needs no pass, no draw and no target, and the same
  numbers give an arm's shadow on the body, which the map cannot.

Capsules it is, and **per vertex, not per pixel**: the person has 38 088 vertices, rings 8 mm apart, finer than any
shade of a body; a person close up at 4K covers millions of pixels. Per vertex the body's own shade does not grow
with the screen's pixels. What does grow with them is what every other surface already pays per pixel: the shadow
map's four reads and the clouds' one. Nothing of the capsules runs in the shadow map's pass.

Found while building:

- The first stills showed the shade where it belongs but faint. The sphere nearest the point stands for the whole
  capsule, and a limb's length hides two to three times the sky its nearest sphere does at the distances that
  matter (a long cylinder against a ball of its radius), so each capsule's share of the sky is counted twice.
- In the library a cloud's shadow now and then crosses the stage. The ground always darkened under it; now the
  person does too (two close-ups happened to be taken under one: the ground had lost a half and a third of its
  light, the person about as much, where on main they stayed in full sun). The stills of the checks hold the clouds
  away from the stage, so the body's own shade is what is compared.
- The shadow map's pass draws the person posed: from the same angle and light, the wave's shadow runs longer and
  thinner than the idle's, where the raised arm adds to it.
- The list's small picture of a person is drawn once, at the world's origin, by the same material: it takes the
  clouds' shade there as the list's pictures of rocks and trees already do, and the body's own shade.
- Leaving out the capsules that lie more than a third of a metre from a vertex (their sky a few hundredths, their
  sun the map's) was tried, to spend less at each vertex: on SwiftShader it was slower (the person close up 153 ms
  with it, 126 without), as a CPU runs both sides of a branch, and what it would save on a real GPU could not be
  seen. Not kept.

## Propose

**Delivered** (draft pull request [#23](https://github.com/MaiaCityCoop/theOS/pull/23), branch `feat/person-shade-shadows`):

- The person takes the shade: the shadow map, the clouds' shade, a storm's dim, and the body's own
  (`characters/kit/human.js`, `materialOf`).
- The person casts: every person the kit makes is on the casters' layer, drawn posed into the shadow map and pulled
  towards the light by the map's bias, so the shadow meets the shoes (`src/world/light.js`: `casterPull`,
  `shadowAtPulled`; `shadowOf`'s bias a parameter with the old constant as its default).
- The body's own shade: sixteen capsules round the bones, worked out per vertex (`capsulesOf`, `occlusionOf`).

**How it was checked.** Headless Chromium 153 (Playwright) with WebGPU on SwiftShader, a GPU done by the CPU: the
harness of intents 0027 and 0029 rebuilt (it is kept outside the repository): the game's canvas gets a stand-in
context (a texture never shown, read back for stills), and each frame is held until the GPU has done the one before.
Main (`9daf569`) on one dev server, this branch (`96c6ade`) on another, one page at a time. Stills: the clock of the
frames held fixed, the sky at 11:00, the clouds' drift put back to one place, so main and the branch see the same
moment; in the library its own shot and key light at chosen angles. The person's own pixels: where the picture
with and without them and the person drawn alone against nothing all differ, cleaned of grass blades that moved
between two frames. Every shader module a page made was hashed, so two builds can be compared module by module.

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | The library, the sky held clear, the library's own shot and key light at four angles, main beside this branch. On the branch the shadow lies on the stage from the shoes out, on main none. The body shades itself: the person's own pixels (a mask of them alone) are 5 % darker than main's from the front, 4 % close up from the front, 3 % from behind, and 16 % close up with the light from their left, where the far arm stands in the body's shadow and the near arm lays a band of shade down the shirt's side. Mapped pixel by pixel, the darkening lies along the body where the arms meet it, along the jaw and the neck's base, and where the hands hang by the thighs; between the legs it is faint. The waving person's shadow runs longer than the idle one's, where the raised arm adds to it: the shadow is drawn from the pose. **`me.html`**: the avatar is on the casters' layer and its shadow pass draws 24 things against main's 23 |
| 2 | passed | **A cloud's shade**, the same shot with a clear sky and an overcast one (the clouds' cover 1), the person's own pixels against the ground beside them (the same rows, as wide again as they are on each side, from the stills without the person). In the library, with the key light 45° off the camera: the bare ground keeps 0.369 of its light; the person 0.992 on main (untouched by the cloud) and 0.420 on this branch. On the meadow by the tent, seen from the sun's side: the grass keeps 0.394; the person 0.983 on main and 0.521 here (a standing body faces the sky's light more than the flat ground does, so it keeps a little more). **A tree's shade**: the Settler stood under the crown of a tree in the forest, on its side away from the sun of 11:00, seen from the side where least hid them (a few leaves cross the shirt): their pixels 0.155 on main, lit as in the open, against 0.107 here, in the shade the ground round them lies in (from two other sides, through more leaves, 0.253 and 0.159 against 0.096 and 0.097) |
| 3 | passed | The Settler stood on the tent's floor between the pole and the door, seen from inside by the cot: on main they stand in full sun inside the tent; on this branch in the tent's shade, the brightness of their pixels 0.150 against main's 0.382 (linear, the same pixels) |
| 4 | passed on SwiftShader, with a cost of its own | Five runs of main and three of the branch, alternating, 480 × 270 at the screen's own ratio, the governor free. **The library with the Settler:** frame medians 2940 to 3102 ms on main, 3014 to 3170 on the branch; 95th percentiles 3113 to 4299 against 3149 to 3311: no change beyond what runs differ by. The shadow pass draws 22 things on main, 23 here (the person, 73 680 triangles). In the GPU's own time (`?gputime`): the shadow pass 8.7 to 10.8 ms on main, 43.4 to 49.1 here; the person alone in the picture 42 to 47 ms on main, 63 to 97 here, and 33 to 35 ms in the shadow pass (on SwiftShader every vertex and triangle is the CPU's work). **What grows with pixels:** the person close up (a quarter of the picture) at an inside of 480 × 270 and of 960 × 540: main 77 and 241 ms, this branch 126 and 240 (again: 86 and 229, 131 and 257); in two runs each, per pixel of the person 1.20 to 1.58 µs on main and 1.21 to 1.25 here, and what does not grow with pixels 22 to 39 ms on main, 88 to 89 here, with 38 to 40 ms more in the shadow pass: what this work adds is the part that does not grow with the pixels (the capsules at each vertex, the person drawn into the map), and the part that grows did not grow with it. **By the tent:** frame medians 2566 to 2766 against 2610 to 2720, 95th percentiles 2723 to 3058 against 2711 to 2911, 27 draws in the shadow pass on both. **The governor's dial** stood at 1 throughout on both: it leaves frames over 250 ms uncounted, and every frame here is seconds, so it could show nothing. **The canvas** 480 × 270 on both at a ratio of 1, 960 × 540 on both at 2: the screen's own pixels, untouched. **The stress world** draws no person and was not timed |
| 5 | passed | `vite build` in TheGame (its warning of chunks over 500 kB is main's too) and in OS |
| 6 | passed | **The world by the tent**, no person in it: the same picture as main to the pixel (mean difference 0.000, largest 0), from the same 137 shader modules, every one byte for byte main's. **The library**, the person hidden, at seven angles: mean difference 0.000 of 255, at most 0.001 % of pixels more than 8 apart (a few pixels, 13 at most). In every page only the person's own three shader modules differ from main's: their vertex stage (4 000 characters of WGSL, now 7 125 with the capsules) and two fragment stages (26 230, now 29 784 with the shadow map's reads) |

**Known gaps:**

- Seen on SwiftShader only: not in Safari, not on a real GPU, not on a phone. There the added work is not measured:
  38 088 vertices × 16 capsules a frame, one more draw of 73 680 skinned triangles into the shadow map, and five
  more texture reads for each pixel of the person (the four of the shadow map and the clouds' one, as every surface
  of the world takes them). The governor's answer to it could not be seen here.
- Inside the tent the person takes the open sky's light (only their own body hides any of it) and no light through
  the canvas: they stand darker than the tent's warm lining.
- A person standing within about half a metre of another caster (against the tent's wall, beside a rock) does not
  take that caster's shadow on what is nearest it: they read the map allowing for their own pull.
- The first time a person is drawn one more pipeline is compiled (the shadow pass's), and their shaders are larger
  (the vertex stage 4.0 to 7.1 thousand characters of WGSL, the fragment 26.2 to 29.8); `me.html` makes a new
  material for every change of the avatar, so it compiles again each time, as before, now a little more.
- The stress world was not timed: it draws no person.
- No `day` or `inGame` in the story's film: not counted here.

## Story

## Archived

---

## Todo

- [x] Open the intent; define it
- [x] The person takes the shade (23)
- [x] The person casts a shadow, meeting their feet (24)
- [x] Shade where the body meets itself (25)
- [x] The checks, main against this branch
- [x] Propose; a draft pull request
- [ ] Samuel: the person in Safari on a real GPU (only SwiftShader has seen them), and the frame rate there

## Changelog

### 2026-11-16

- **Asked:** "do the shade / shadows thing … and ensure you keep quality gate 60fps and 4K always intact": points 23
  to 25 of the person's inventory (intent 0031).
- **Delivered:** the person takes the shade (the shadow map, the clouds, a storm's dim) and casts a shadow that meets
  their feet, wherever a person is drawn; sixteen capsules round the bones give the shade where the body meets
  itself, worked out per vertex. Checked against main in Chromium on SwiftShader: stills, timings, every shader.
- **Good:** nothing else in the picture changed: the world by the tent is main's to the pixel, from the same 137
  shader modules; only the person's own three differ. Frame times by the tent and in the library no worse than
  what runs differ by.
- **Broke / not there yet:** the person's own work costs more on SwiftShader (the capsules at every vertex, one more
  draw into the shadow map), though not with more pixels; a try at leaving far capsules out was slower there and
  was not kept. Nobody has seen it on a real GPU or in Safari.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-16 | `96c6ade` | the person takes the shade, casts a shadow that meets their feet, and shades themselves where the body meets itself |
| 2026-11-16 | `d13475a` | the intent opened, built and proposed: its checks, its story (`Stories/0032-the-person-in-the-shade/`) and the trail row above |
