---
id: "0028"
title: The picture to the phone's edges
state: propose
outcome:
opened: 2026-11-15
story:
---

# 0028 · The picture to the phone's edges

## Idea

> Also have the bg span full height on iOS without moving the nav controls into the non safe areas.

On an iPhone (next.maia.city in Safari), the library's picture stopped short of the status bar at the top and the browser bar at the bottom, leaving flat blue bands. The world should fill the whole screen, while the pills and cards stay where a thumb and an eye can reach them.

## Define

Samuel asked for this directly and the definition holds no surprise, so it was built straight away.

**Deliverables**

1. Every page of the game and the OS asks the phone to draw it to the screen's edges (`viewport-fit=cover`).
2. The overlays keep clear of the notch, the status bar and the home bar: `--edge-t` (top), `--edge-b` (bottom) and `--edge` (sides) in `brand/brand.css` add the phone's safe-area insets. Everything placed at the top now uses `--edge-t`.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | The picture reaches the top and the bottom of the screen on an iPhone | open next.maia.city/library.html in Safari on an iPhone |
| 2 | The weather pill sits below the status bar, and the nav pill sits above the home bar | the same page |
| 3 | Nothing moves on a desktop or in a screen without insets | Chromium at iPhone 14 Pro size: the insets are 0, so the overlays stay 14px from the top and 18px from the bottom |

**Out of scope**

- Android's display cutouts beyond what `env(safe-area-inset-*)` reports.

## Build

- The canvases already use `100vh`, which is the large viewport in iOS Safari. Only `viewport-fit=cover` was missing, so nothing was drawn under the bars.
- The side lists and cards in the library and on `me.html` now use `100dvh` minus both insets for their max height, so they don't run under the bars.

## Propose

**Delivered:** `viewport-fit=cover` on the 7 pages, and the safe-area-aware `--edge`, `--edge-t` and `--edge-b`, with every top overlay on `--edge-t`.

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 | not run | needs a real iPhone; Chromium cannot simulate a notch |
| 2 | not run | the same |
| 3 | passed | Chromium, iPhone 14 Pro emulation: topbar at y=14, nav pill bottom at 642 of 660, the canvas fills 393×660, no page errors |

**Known gaps:** Checks 1 and 2 still need Samuel's phone. The story folder is not spawned yet; it is a small change and may be folded into a larger day's story.

## Story

## Archived

---

## Todo

- [x] viewport-fit=cover on every page
- [x] safe-area insets in the edge tokens
- [ ] Samuel checks on his iPhone

## Changelog

### 2026-11-15

- **Asked:** Make the background span the full height on iOS, without moving the nav controls into the unsafe areas.
- **Delivered:** viewport-fit=cover, plus safe-area-aware edge tokens.
- **Good:** It is one place in brand.css, so every screen follows.
- **Broke / not there yet:** Not seen on a real iPhone yet.

## Trail

| When | Commit | What |
| --- | --- | --- |
