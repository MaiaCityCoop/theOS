---
id: "0023"
title: Magic Wonder (the stress world) loads again
state: propose           # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-14
story:
---

# 0023 · Magic Wonder (the stress world) loads again

## Idea

Samuel: the Magic Wonder / stress world (`/?stress`) does not load at all any more. Find out why and
fix it, keeping the look.

## Define

Asked for outright; built straight away.

**Deliverables**

1. The stress stand's passes back under WebGPU's twelve uniform buffers a shader stage
   (`maxUniformBuffersPerShaderStage`, which Safari will not raise), by what the stand itself binds, not by asking
   for a higher limit.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | `/?stress` loads and draws its world, no WebGPU error in the console | the game at `/?stress`, the console |
| 2 | the normal world still loads clean | the game at `/`, the console |

**Out of scope**

- The stand's frame rate.

## Build

- The error: `Compute pipeline creation failed … The number of uniform buffers (13) in the Compute stage exceeds the
  maximum per-stage limit (12)`, only under `?stress`, then an invalid pipeline every frame.
- Why: a uniform *array* (`uniformArray`) is a uniform buffer of its own in every shader that reads it. A tier's
  packing pass that asks the ways (rocks, trees, the ground: `offWays`/`wayAt`, src/world/ways.js) reads the land's
  numbers too, and `8864fe9` (lakes, 21:08 tonight) added the lakes' array (`LAKE`, src/world/land.nodes.js) to them.
  Under `?stress` the stand lays its ways with four arrays of its own (the nearest plots, the rings' two rows, the
  nearest-ring table): one over. Without `?stress` the ways are not laid and the passes stay under twelve.
- The fix: the stand's four ways arrays are one (`WAYU`, rows in four runs), read through the same names. Three
  buffers fewer in every pass that asks the ways, the same numbers, the same look.

## Propose

**Delivered:** the stand's ways in one uniform array; on main (`26ad60d`).

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | Samuel, after the push: "working" |
| 2 | not run by the agent | the normal world's passes do not read the stand's ways; not opened in a browser by the agent (the GPU was being measured) |

**Known gaps:** the consoles not read by the agent.

## Story

## Archived

---

## Todo

- [x] Pack the stand's ways arrays into one
- [x] `/?stress` seen working (Samuel)

## Changelog

### 2026-11-14

- **Asked:** the stress world does not load any more; find why, fix it.
- **Delivered:** the cause traced to a uniform-buffer count over WebGPU's limit; the stand's ways packed into one array.
- **Good:** —
- **Broke / not there yet:** not yet seen in the browser.

- **Asked:** merge and push to main.
- **Delivered:** on main; Samuel: "working".

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-14 | `26ad60d` | the stand's ways in one uniform array |
