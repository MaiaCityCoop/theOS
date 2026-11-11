---
id: "0003"
title: One camera from skyline to eye level, one collision for every asset
state: build             # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-11
story:
---

# 0003 · One camera from skyline to eye level, one collision for every asset

## Idea

Samuel's words (typos tidied): "Can you also standardize a universal game camera, that at the same time zooms out
(the city skyline, all the way out), travelling like a city-builder camera, and also zooms in to a POV transition,
switching camera, so we can also walk into assets, tents etc.? Do you see how we can abstract this as general, a
single source of truth? Also every asset needs to manage its own collision control too, right?"

Today the game has two cameras that do not know each other: the walker (`src/camera/walk.js`: first person, WASD,
F to fly) and the film camera (`cine/`, for stories and lenses); the library has a third, its own orbit. Collision
exists only for the walker and only for placed assets: the tent's `solid` block (walls with door gaps, posts, boxes,
a ceiling) in `src/world/solids.js`. Rocks have none; the camera itself goes through anything.

## Define

**The shape of it**

- **One rig, one value.** The camera is one rig driven by a single height above the ground, from about 1.7 m (eye
  level) to about 12 km (the whole city and the horizon). Scrolling moves that value continuously; nothing switches
  mode. The height decides, together: the tilt (looking ahead at eye level, down at the city from above), the lens
  (wide close, longer far), the speed of moving, the pivot (the walker's eyes close in, a point on the ground far
  out) and the controls (walking keys and mouse-look near the ground, pan, turn and pick from above).
- **Bands, as data.** The way height maps to tilt, lens, speed and controls lives in one camera file
  (`TheGame/camera/rig.js`), as a few named bands with smooth curves between them: *eye* (1.7 m), *street*
  (3 to 30 m, behind and above a walker), *town* (30 to 800 m, the builder's view), *skyline* (800 m up). Nothing
  of this is written in the controls' code; a new band or curve is an edit of the file.
- **Into things.** Scrolling in over an asset lands at eye level in front of it, and walking on goes in where its
  collision has a door (the tent today, houses later). Scrolling out from inside lifts through its roof only where
  the asset allows it; otherwise back out of its door first.
- **One source for films.** The film camera (`cine`) takes its shots through the same rig (a shot is a height, a
  place and a heading, or a free pose as today), so the stories, the lenses and play see the world the same way.
  The library's orbit becomes the rig held over its stage.
- **Collision per asset, defaults per kind.** Every asset's file keeps its `solid` block next to its recipe and
  `detail`; kinds carry defaults (a rock: a squashed sphere from its size; a shelter: a wall with a door from its
  footprint; a building later: walls, doors and floors), so an asset writes only what differs. Scattered assets get
  them too, looked up from the same hash that places them, so no list of thousands is kept.
- **One collision engine, every user.** The walker, the rig (the camera never ends inside a wall, a rock or the
  ground) and later moving things (NPCs, carts) ask the same engine; it answers a step (where a move really ends) and
  a ray (where a line of sight is stopped).

**Deliverables**

1. `TheGame/camera/rig.js`: the bands and curves as data; the rig that reads them.
2. The controls on the rig: scroll (or pinch) for height, and per band: walk and look (eye), follow (street), pan,
   turn and pick (town, skyline). The walker's controls of today become the eye band.
3. Into and out of assets through their doors; out through the roof where an asset allows it.
4. `cine` and the library's orbit on the rig.
5. Collision: `solid` defaults by kind (`assets/kinds.js`), the engine answering steps and rays for placed and
   scattered assets, the walker and the rig on it.
6. The library shows an asset's collision (Detail tab or a toggle on the stage).

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | One continuous zoom | a scripted scroll from 12 km to eye level and back over the tent: height, tilt, lens and speed change smoothly frame by frame (no step larger than its neighbours'), recorded |
| 2 | Into a tent | from the skyline, scroll down in front of the tent and walk in through its door with the keys; stopped by its walls everywhere else |
| 3 | Never inside things | 200 random scroll-and-pan moves around the tent and a rock field: the camera never ends inside a wall, a rock or under the ground |
| 4 | Bands are data | changing one band's numbers in `camera/rig.js` changes the camera with no other edit; `grep` finds no tilt, lens or speed number for the rig outside that file |
| 5 | Collision per asset | a test asset with no `solid` block is stopped by its kind's default shape; the tent's own block still wins |
| 6 | Films unchanged | story 01 plays through the rig; its shots frame the same as before (stills compared) |
| 7 | Frame time | the Lenses page and the skyline band at or under 16.7 ms on this Mac |

**Out of scope**

- What there is to see at 12 km (the far land, tiles and folding come from intent 0002, stages 4 and 5).
- Moving things themselves (NPCs, carts): they will use the collision engine later.
- Phones and touch beyond pinch to change height.
- Building or placing things from the town band (picking only shows what is picked).

## Build

Samuel approved the definition on 2026-11-11 ("Approve, start it").

**First slice** (the rig, its bands as data, the walk page on it, collision defaults):

- `TheGame/camera/rig.js` holds the bands as data: for each key height, the tilt, the lens (field of view), the speed
  and the orbit; between keys every value eases over the height's logarithm. Asked on the way ("should it switch
  lenses automatically too?"): yes, the lens is one of those values, 68° at the eyes to 44° over the city.
- `src/camera/rig.js` is the one camera: hung over a point on the ground, driven by its height; the wheel moves the
  height; WASD moves the point at the height's speed; mouse drag and Q / E turn; at eye level the mouse looks freely
  (pointer lock only there) and the walker's collision and stooping apply. Higher, it hangs back from the point and
  looks at it; a wall between pulls it in front of the wall (`clear`, a line of sight, in `src/world/solids.js`); it
  never goes under the ground. The walk page runs on it; the old walker (`src/camera/walk.js`) keeps only `spawn`.
- The top is 4 km for now, not 12: above about 4 km there is only haze until the land reaches 10 km (intent 0002,
  stage 4). One edit of `top` in the data raises it.
- Collision defaults by kind (`solid` in `assets/kinds.js`: a rock a round of 0.4 of its size, the default kind its
  footprint as a box), used by `solidOf` in `assets/index.js` where an asset's file has no `solid`; the tent's own
  block wins.
- Seen in the game: eye level, 40 m (town), 2.5 km and the top, no console errors. Walking in from 14 m before the tent
  with W: through the door to the centre pole (stopped 0.35 m from it, its 0.05 m and the body's 0.3 m), a sidestep
  stopped by the wall at 2.15 m.
- Not yet: scattered rocks have no collision (they are placed on the graphics card from the ground's textures; the
  engine cannot look them up yet), scrolling in does not yet land you before an asset's door on its own, out through a
  roof is not there, `cine` and the library's orbit are not on the rig, the library does not show collision, and checks
  1, 3, 6 and 7 are not run. Near the tent's wall the eyes, at 1.7 m, can rise above the sloping roof (as before; the
  tent's ceiling only lowers them where it says).

**Second slice** (asked: a small stat in the top centre, the pointer held again, finish what was not working):

- The stat pill: top centre, small and compact, the height, its band and a scale bar (`#stat`, `.os-stat` in the
  brand file); more stats join it later. The hint moved under it.
- The pointer: held at eye level and in the follow view (street), free in town and skyline, to point and pick (asked:
  "pointer lock on for POV and follow cam"); `lock` per band in `camera/rig.js`. Coming down, the next click or key
  takes it again: a browser does not let a scroll take it.
- Rocks are bodies: `src/world/rocksolid.js` works the cards' placement hash out again on the CPU for the cells round
  a point, so the walker and the camera are stopped by the rocks they see, no list kept. Stones lower than 0.3 m are
  stepped over. Paths, which only the graphics card knows, are counted as none, so a rock may now and then stand in a
  path for the walker that is not drawn there.
- Into things: coming down from above into a thing's walls lands 2.5 m before its door, facing in; a thing that says
  `leave: 'door'` is left by its door when rising; the tent says nothing and is left through its roof.
- One pose for all: `poseAt` and `shotAt` in `src/camera/rig.js`. Films may give a shot as the rig's (`{ at, height,
  yaw }`) and `cine` turns it into its pose; the library holds the rig over its stage at the distance it wants
  (`heightFor`). Existing film shots, given as free poses, are taken as before.

**Checks, run on the second slice** (2026-11-12, 1400×800 in the browser pane):

- 1 (one continuous zoom): the pose from 4 km to eye level in 2000 steps; no value (x, y, z, tilt, lens, speed)
  stepped more than 3× its neighbours' median: 0 jumps each.
- 2 (into a tent): walked in through the door to the pole and stopped by the walls (first slice); landing: from 200 m
  over the tent's middle, down to eye level, the camera stood 4.95 m from the middle, before the door, as meant.
- 3 (never inside things): 200 random places within 40 m of the tent at random heights from 1.7 to 300 m: 0 ended
  under the ground, inside a rock or inside the tent from outside.
- 6 (films unchanged): story 01 played through to its subtitles with no console errors; its shots are free poses,
  taken as before. Stills not compared frame by frame.
- 7 (frame time): 16.5 ms at 800 m and 16.7 ms at 4 km, but **45.5 ms at 40 m** (town, the meadow's grass and stones
  seen wide and at a slant): failed; the far land's cost is intent 0002's (tiles, folding).
- 4, 5 not run as written.

**Third slice** (asked: the same camera on tablets and phones, a joystick at the left, its own settings file, zooms
with two fingers):

- `TheGame/camera/touch.js` holds the touch numbers as data: the joystick's size, knob, margin, dead zone and run;
  how fast a finger turns and looks; how fast two fingers change the height and turn.
- `src/camera/touch.js`: the joystick appears bottom left with the first touch (a mouse never sees it); one finger
  elsewhere turns and, at eye level, looks; two fingers pinch the camera up (together) and down (apart) and turn it.
  It hands the rig what the keys and mouse do (a move, a turn, a look, a change of height): one rig for every input.
- On a phone the developer's readout is hidden; it covered the pill.
- Checked in the pane at phone size (375×812) with touch events made by script (the pane's own clicks are a mouse's):
  the joystick pushed for 1.5 s walked 3.5 m; a finger dragged 50 px turned 0.26 rad; pinching in took the camera from
  1.7 m to 7.4 m and spreading brought it back to 1.7 m. Not tried on a real phone or tablet.

**Fourth slice** (asked: the phone layout, the joystick further into the corner, the readout out of the way, and
everything left open; on the way: collision jumping, one global haze, the tent's floor on uneven ground):

- Phone and tablet: the joystick sits in the bottom left corner above the bottom line (112 px); the developer's
  readout is hidden below 1100 px wide. Looked at in the pane at 375×812 and 768×1024.
- Collision that jumped: the follow camera was pulled in by every stone between it and the walker, and coming down
  into the tent jumped you to its door. Now only walls pull the camera in (rocks do not), it comes in at once and
  eases back out; the tent, left through its roof, is come into from above where you are, and a thing left by its door
  glides you to it. Rocks' bodies are 0.7 of their outline (half buried), so they stop you where you see them.
- Town at 45 ms: the grass and stones measured distance as if the camera stood on the ground below 70 m (`uDy`); they
  now count the camera's height above the ground under it. The town view at 40 m: 16.7 ms (60 fps, the screen's
  limit), 2.17 M triangles; was 45.5 ms.
- One global haze (asked: "introduce the general distance fog / haze fully globally"): `LIGHT_GLSL`'s haze is a height
  fog, thickest at the ground and thinning upwards (`uAirScale`, 1200 m), every material's; the weather's fog thickens
  it. The camera's top is 12 km again: from there the land, rivers and dry ground read through the thinner air.
- The ground under what stands: the land levels itself in a pad under each placed thing (its `clear`, meeting the land
  over 3 m), in `world/land.js` and the same in `WORLD_GLSL`, so the drawn ground is the walked ground; the tent's floor
  now meets its walls all round.
- The library shows a body: the Detail tab's Body row (its own or its kind's: walls, doors, posts, boxes) and a button
  that draws it on the stage as gold lines through the asset.
- Real devices: `bun run lan` opens the server to the local network; then the game is at
  `http://<this Mac's address>:5180/game/` on a phone or tablet on the same Wi-Fi. Not tried on a device by me.

## Propose

## Story

## Archived

---

## Todo

- [x] Samuel: approve or change the definition
- [x] The rig and its bands as data
- [x] The controls per band; the walker as the eye band
- [x] Into and out of assets
- [x] `cine` and the library on the rig
- [x] Collision defaults by kind; steps and rays for placed and scattered assets
- [x] The library shows collision

## Changelog

### 2026-11-11

- **Asked:** one universal camera, zooming from the city skyline down to walking into tents, as one general source of
  truth; every asset managing its own collision; and what an impostor is.
- **Delivered:** this intent, at Define. Found: three cameras today (walker, film, library orbit) and collision only
  for placed assets and only for the walker. An impostor was explained in the chat (a card that stands in for a far
  asset, lit like it; intent 0002, stage 2).
- **Good:** the tent's `solid` block and `src/world/solids.js` are a start for the collision engine.
- **Broke / not there yet:** nothing built.

### 2026-11-11, first slice

- **Asked:** approve, start it; on the way: should it switch lenses automatically too.
- **Delivered:** the rig and its bands as data, the walk page on it (eye, street, town, skyline by scrolling), the lens
  changing with the height, a line-of-sight test for the camera, collision defaults by kind.
- **Good:** one scroll from eye level to 4 km and back; walking into the tent through its door and being stopped by
  its walls and pole.
- **Broke / not there yet:** rocks have no collision yet; no landing at doors, no roof exit; films and library not on
  the rig; above 4 km only haze until the land reaches further.

### 2026-11-12, second slice

- **Asked:** a small distance and scale stat at the top centre, for more stats later; the pointer held again; pointer
  lock for eye and follow; finish what was not working.
- **Delivered:** the stat pill, pointer lock per band, rocks as bodies, landing at doors and leaving by them, films and
  the library on the rig; checks 1, 2, 3, 6 and 7 run.
- **Good:** no jumps in the zoom; no camera inside anything in 200 tries; landing at the tent's door.
- **Broke / not there yet:** the town band runs at 45 ms a frame on this Mac; the top stays 4 km; the library does not
  show collision yet.

### 2026-11-12, third slice

- **Asked:** the same camera on tablets and phones, with a joystick at the left and its own settings file, two-finger
  zoom; and whether the film camera stays its own virtual camera with focal point, focus pulling and lenses (yes: see
  the chat; `cine` is unchanged and takes rig shots as well as its own).
- **Delivered:** the touch settings file, the joystick, one-finger turn and look, two-finger height and turn, all on
  the one rig.
- **Good:** walking, turning and both pinches worked by scripted touch at phone size.
- **Broke / not there yet:** not tried on a real device; the tablet size was not looked at (the pane closed).

### 2026-11-12, fourth slice

- **Asked:** the phone layout and the joystick's place; the readout wrongly placed; do everything still open (town
  frame time, real devices, 12 km, the library's collision); then: collision jumps you away from tents and rocks; one
  global haze; the tent's floor on uneven ground.
- **Delivered:** all of those (see Build, fourth slice).
- **Good:** town 45 ms → 16.7 ms; the land seen from 12 km; the tent level; the library draws bodies.
- **Broke / not there yet:** no real device tried by me (a LAN start is there); the collision fix is not yet felt by
  Samuel; checks 4 and 5 not run as written.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-11 | `2ee48e7` | The intent opened, its definition written |
| 2026-11-11 | `611c4ce` | First slice: the rig and its bands as data, the walk page on it, collision defaults by kind |
| 2026-11-12 | `4c2af42` | Second slice: stat pill, pointer lock per band, rocks as bodies, doors, films and library on the rig |
| 2026-11-12 | `1632a3d` | Third slice: touch, joystick, pinch, its own settings file |
| 2026-11-12 | `3026826` | Fourth slice: phone layout, smoother collision, town frame time, height fog and 12 km, levelled ground, bodies in the library |
