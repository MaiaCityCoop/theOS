# The gate

`tools/gate.js` is the one driver of intent 0038's quality gate; its commands are listed at its top. Its parts:

| File | What it is |
| --- | --- |
| `views.js` | The fixed views (1.7 m to 12 km), what each shows (its kind and distance, for the real half), and the paths |
| `flip.js` | NVIDIA's LDR-FLIP, ported; the 32-pixel tiles; PNGs read and written |
| `clock.js` | The gate's clock: an init script that puts a page's frames and its clock under the gate's hand |
| `motion.js` | `motion`: the paths drawn frame by frame, as the game draws them and as the truth does; the filmstrip |
| `change.js` | The change detail made in one frame, measured in a worker of its own |
| `tiles.js` | `stills --tiles`: a view drawn in tiles and laid together (the truth past 800 m) |
| `real.js`, `real.py` | `real`: renders against photographs; the numbers (CMMD, image statistics) in Python |
| `lock.js` | `GATE_LOCK`: the GPU shared between runs |
| `sheet.js` | Labelled JPEG sheets (`diff --jpeg`) |

The gate is two halves (intent 0038, Define): **invisible** (detail never shows: `stills`, `diff` against `?truth`,
and `motion`) and **real** (the full-detail picture is held against photographs: `real`).

## Motion: nothing pops (check 4)

`bun tools/gate.js motion --url <your server> --fresh [--paths walk,zoom] [--fps 60]`

Every frame of each path is drawn twice, in two passes of a page each (one world in memory at a time: the bench's Mac
has 8 GB): as the game draws it (L, its frames kept on disk, squeezed, till the second pass), and at full detail (R).
Both pages run on the gate's clock (`clock.js`): no frame is drawn until the gate asks for it, at the same moment of the
world's clock in both (each path at its own hour, 3600 s and on, the same in every run). **The truth's frame is a
settled still at its step:** the camera and the clock standing, drawn as `?truth` draws a still (every pixel the canvas
has, over its 32 places of a pixel) until `settle()` resolves: nothing out (the land's pages among it) and the picture
come to rest. So the reference neither shimmers nor lacks, as check 4 defines it ("supersampled so it doesn't
shimmer"). The game's frame is drawn once, as the game draws it. Frames are read once drawn. For every frame the gate
measures `FLIP(L now, L before + (R now − R before))`: that picture differs from L exactly by
((L − R) now) − ((L − R) a frame before), the change detail made, seen in the frame as it was drawn. What the camera,
the wind and the clock did, the truth did too, so it falls out; what the game's own frame does besides (a level that
switches, a page that comes, the shimmer of what it draws in motion) is counted.

A truth drawn in motion as the game draws a frame (train 1, 2026-11-18) was no reference: its own shimmer in the
canopy changed frame to frame unlike the game's, and the measure read the two shimmers (a median of 0.52), and its land
pages lagged behind a climbing zoom.

- **The merge rule:** no frame's worst 32-pixel tile over the line (`lineOf` in `motion.js`): ERROR_PX × INSIDE / the
  tile, 1 × 4/3 / 32 = 0.042. A switch within the dial moves an edge by at most ERROR_PX pixels drawn, INSIDE canvas
  pixels each, so across a tile at full contrast it changes the tile's mean by at most that. The line follows the dial. **Not binding**
  until train 2's GPU run shows the settled-still truth.
- **What it costs:** a truth still a step, about 35 frames of about a second each: a minute a step, offline. The zoom's
  20 s at 5 frames a second is about 1.7 hours; `--to` and `--fps` make a smoke of it.
- **Out:** `.gate/motion-<tag>/report.json` (every frame's worst tile, its 99th percentile and mean), and a filmstrip
  JPEG per path: every frame's worst tile over the path, then the worst frames, each with the squares round its worst
  tile at full size (LOD before and now, truth before and now, FLIP's heat map of the change).
- **`--fps`:** frames a second of the path. 60 is every frame the game draws at its gate. Fewer is quicker and
  stricter: a pop is the same pop at any rate, and a fade over n frames is counted in fewer, larger steps.
- **What it does not see:** what reaches the page while the gate reads a frame back reaches it sooner, in the path's
  time, than it would on a screen; a pop when it comes is caught all the same, a late arrival is not.
- **`--floor`:** the game's frames against a second pass of the game's own: what the measure reads where detail made
  no change it did not also make the first time (what streams in at another frame, the wind's noise).

Every page of `stills` is held on the gate's clock from its start, and settles with the world's clock standing: with
it running, the wind uncovers ground that asks for more of the land's pages, and on slow frames (`?truth`) that can
outrun the time they take to settle.

## The truth past 800 m: tiles

`?truth=<m>` draws everything within m metres at its finest. Past about 800 m the WebGPU device is lost: too much in
one frame. `stills --truth --reach <m> --tiles <n>` draws each view in n × n tiles, each at all the canvas's pixels
(the camera's view offset: `src/core/temporal.js` keeps its part of a pixel inside the tile). Each tile's frustum holds
about 1/n² of the whole picture's things, and the picture is n² times supersampled when the tiles are brought down by
n and laid side by side. The film camera holds the camera for stills, so no lens glass (which is laid by screen
position) is drawn in either.

## Real: held against photographs (check 4a)

`bun tools/gate.js real <tag | folder> --photos <folder> [--device mps]`

The renders (a set of stills in `.gate/<tag>/`, named by view, or any folder of pictures) against the photographs of a
folder. Every render named by a gate view is held against the photos of its kind from about as far (within a factor of
two), every kind's renders against that kind's photos, and all against all. For each group:

- **CMMD** (Jayasumana et al., CVPR 2024): the maximum mean discrepancy between CLIP ViT-L/14 (336 px, OpenAI)
  embeddings, Gaussian kernel σ = 10, × 1000. Each picture gives as many square crops as its width holds.
- **Image statistics:** the earth mover's distance between the L* histograms, the difference of the mean colours
  (CIE76), and the renders' less the photos' chroma, contrast (RMS and in 32-px patches) and power-spectrum slope.

**The table.** `real` prints the view classes first: the photos' kinds against the gate's views of each kind, those
rendered here and those not, and the kinds with no view or no photo yet. Then it prints, per class (and per view
below it), each distance and, in brackets, the photos' own spread: the class's photos split in two by turns, one half
against the other. That spread is the floor a render's distance stands on; between two sets of real stands, CMMD reads
about 0.6. A class with only two or three photos has a noisy floor. The numbers go to `.gate/real.json`.

**The rule** (check 4a: each distance falls stage by stage and never rises). `tools/gate/real-ratchet.json` keeps
every class's distances as main last measured them, from the truth stills at every view. A branch farther than that
(by more than a small tolerance: 0.02 of CMMD, 0.2 of a statistic, or 3 %) fails `real` (exit 1). Main's run with
`--ratchet` lowers each distance to what it measures and never raises one; its first run sets them. The end is
Samuel's blind test.

### The photographs' folder

A folder of pictures and a `manifest.json` in it. The format is the one the reference photos came in
(`~/src/github/MaiaCityCoop/References/0038/`, listed in `research_notes/0038-species-and-references.md`):

```json
{
  "intent": "0038",
  "photos": [
    { "file": "16-a-tree-at-10-m.jpg", "kind": "tree", "distance_m": [10, 10], "licence": "CC BY-SA 4.0",
      "author": "Ryan Hodnett", "page": "https://commons.wikimedia.org/wiki/File:…", "view": "A tree at 10 m" },
    { "file": "tent-13m.jpg", "kind": "tent", "distance_m": 13, "licence": "own", "gate": "bench-tent-eye-level" }
  ]
}
```

| Field | Needed | What |
| --- | --- | --- |
| `file` | yes | The picture, in the folder |
| `kind` | yes | One of `views.js` KINDS: `eye-level` (in the stand), `tree`, `shrub`, `rock`, `floor`, `above` (the stand from above), `hills`, `tent`, `firepit`, `meadow`, `river`, `town` |
| `distance_m` | yes, may be null | Metres from the camera to what it shows: `[near, far]`, one number, or `null` (inside it, or not known: then its kind alone matches) |
| `licence` | yes | Its licence (`own` for Samuel's) |
| `gate` | no | The one gate view it is of (`views.js` names): matched to that view alone |
| `author`, `page`, `source`, `view`, `what` | no | Who, where it came from, and what it shows, in words |

The pictures stay outside git (they are kept by hash, as `Stories/objects/` keeps media); GPS is stripped from
anything committed. A folder without a manifest is read as a set of gate stills: each picture named by a gate view is
of that view, and the rest are of no kind (held against all the renders, as one set). So any two folders of pictures
can be compared, and two sets of stills view by view.

### Setting up the Python it runs in

A venv outside the repository (torch is about 1 GB, the CLIP weights about 900 MB more, fetched on the first run into
`~/.cache/huggingface`):

```bash
/opt/homebrew/bin/python3.11 -m venv ~/.venvs/theos-real
~/.venvs/theos-real/bin/pip install torch open_clip_torch pillow numpy scipy
```

The gate runs `~/.venvs/theos-real/bin/python` unless `GATE_PYTHON` names another. CLIP runs on the CPU by default
(about a second a picture on an M2, so the GPU stays free for timed runs); `--device mps` puts it on the GPU.

## A page that does not answer

The gate's own waits (`settle()`'s timeout, the race in `settled`) are timers inside the page, and a renderer that is
frozen, swapped out or has lost its device runs none of them. Train 1c's truth hung 20 minutes on its fourth view, the
renderer at 0 % CPU and 35 MB resident, the machine's swap at 3.24 of 4 GB. So every `page.evaluate` and
`waitForFunction` the gate makes is held to a time outside the page (`guard.js`): the call's own wait and a minute
more, else 5 minutes. A page that does not answer in that time is said: crashed or hung, with the browser's memory
by process (physical footprint, resident, CPU) and the machine's swap. Its Chrome is closed (killed if it will not
close), the view is marked failed in `gate.json`, and the run stops with exit 1. `stills` also records the
browser's memory through the run and prints its peak: the truth is the largest single consumer on an 8 GB machine.

## A GPU shared between runs

On a machine where several runs share the GPU (and some time their frames), `GATE_LOCK=<dir>` makes the gate take a
lock for each part of a run that draws (a page coming, a view or a tile, a path in motion) by making that directory,
writing who and when into `<dir>/owner`, and removing it after. Meanwhile its pages are held on its clock and draw
nothing. A lock held for over an hour is not broken: the gate stops and says so.

```bash
GATE_LOCK=~/src/github/MaiaCityCoop/.gate-lock GATE_WHO='0038 task C' bun tools/gate.js motion --url http://localhost:5197/game/ --fresh
```
