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

**Back to build (2026-11-15, Samuel's iPhone).** Checks 1 and 2 failed on next, in both the web app on the home screen and Safari:
the light-blue bands stayed at the top (and at the bottom in Safari), and the pill now stood 52 pt above the screen's bottom.
What was found:

- Both screenshots are the dashboard (next.maia.city) with the game in its frame (`#game iframe`, fixed, `inset:0`,
  `background: var(--sky)` = `#9fc2e6`). That colour *is* the bands: Safari paints its status bar and toolbar with the colour of
  the fixed thing at that edge of the page. Measured on the screenshots: top band 62 pt and bottom band 98 pt, both `#a6c1e2`,
  while the picture beside them was navy (`#242e3c`) and brown (`#9c8560`).
- As a web app the page only goes under the status bar with `apple-mobile-web-app-status-bar-style: black-translucent`,
  which no page had.
- In Safari's tab a page that does not scroll cannot be drawn under its bars at all: only their colour can be the picture's.
- `--edge-b` was 18px **plus** the home bar (34 pt): the pill stood 52 pt up. It should be the larger of the two.
- An iframe is not reliably given the phone's safe area (`env()` is the top page's), so the framed game must be told it.
- Seen on the way: on a phone the stat pill (`1.7 m eye ...`) ran over the weather pill. `.os-top`'s `max-width` (made for the
  side columns) went below zero under 528 px wide, so the stat shrank to a dot and its figures spilled over. It was like
  that before this intent.

**Deliverables, again**

3. As a web app on the home screen the picture goes under the status bar: `black-translucent` on the dashboard and the game's pages.
4. The overlays keep clear of the status bar and the home bar, and no further: `--edge-t: max(14px, safe top)`,
   `--edge-b: max(18px, safe bottom)`. The dashboard tells its framed game its safe area (`--safe-*`); the dashboard's own
   views (the city's tiles, the intents' sheet, the studio) keep clear of the status bar too.
5. In Safari's tab the bars take the picture's own colours: the game reads its top and bottom rows every 1.5 s (async, no
   stall) and gives them to the page's background, a thin strip at each edge, and the dashboard's frame and strips.
6. On a phone the top row is two: the weather, then the stat (or the page's nav), nothing over anything.

**Checks, again**

| # | Check | How |
| --- | --- | --- |
| 4 | Web app: the frame fills the screen, the weather pill sits at the status bar's line, the dashboard's pill 34 pt up | Chromium as an iPhone 16 Pro (402×874) with the safe area set to 62/34 through DevTools' `Emulation.setSafeAreaInsetsOverride` |
| 5 | The framed game is told 62/34 and its overlays follow | the same: `--safe-t`/`--safe-b` read inside the frame |
| 6 | Safari: the edges take the picture's colours once the world is drawn (the veil's until then) | Chromium as the part of an iPhone 16 Pro between Safari's bars (402×714), touch: `--os-edge-t`/`-b` read over time |
| 7 | Stat and weather on a phone: two rows, apart; the hint under both | the overlays' boxes at 402 px wide |
| 8 | Nothing moves on a computer | Chromium 1440×900: one row at 14 px, the pill 18 px up, no strips |
| 9 | On Samuel's iPhone, as a web app and in Safari | next.maia.city, after the deploy (the web app may need adding to the home screen again for the status bar to change) |

## Build

- The canvases already use `100vh`, which is the large viewport in iOS Safari. Only `viewport-fit=cover` was missing, so nothing was drawn under the bars.
- The side lists and cards in the library and on `me.html` now use `100dvh` minus both insets for their max height, so they don't run under the bars.
- (again) `--safe-t/r/b/l` in `brand.css` default to `env(safe-area-inset-*)`; a framed page sets them from the dashboard's
  message (`cine/menu.js` asks with `safe?`, `OS/src/main.js` answers from a probe element and again on load and resize).
  Chromium happens to give iframes the top page's `env()`; WebKit's is not known here, so the message decides.
- (again) The framed game's "Sign in" sits at `88px + --safe-t`: the same place on the screen as before, now that the frame
  starts under the status bar.
- (again) Edge colours: `TheGame/src/ui/edges.js`, three lines in `src/main.js`. Read with
  `readRenderTargetPixelsAsync` from the screen's own target (two rows, the middle 60%); WebGPU's rows run from the top,
  WebGL's from the bottom. Only on a touch screen in a browser's tab, only for the whole window (not `?embed`, not a
  film's player). Until the first read, the loading veil's edge colours as the iPhone screenshot showed them.
- (again) In the dashboard the frame's own background is the top colour (what Safari took for both bars) and two 4 px
  strips carry top and bottom. How Safari picks the colour is not documented: the strips are for a sampler that looks
  at the very edge, the background for one that does not.

## Propose

**Delivered, first round:** `viewport-fit=cover` on the 7 pages, and the safe-area-aware `--edge`, `--edge-t` and `--edge-b`, with every top overlay on `--edge-t`.

**Delivered, again (after Samuel's iPhone):** `black-translucent` on the dashboard and the game's pages; `--safe-*` and
`--edge-t/-b` as the larger of the margin and the inset; the dashboard telling its framed game the safe area; the
dashboard's views clear of the status bar and the home bar; `TheGame/src/ui/edges.js` and the dashboard's frame and strips
for Safari's bars; the stat and the weather in two rows on a phone.

**Checks, as they were**

| # | Result | Evidence |
| --- | --- | --- |
| 1 | failed (first round) | Samuel's iPhone, 16:22 and 16:24: light-blue bands at the top (web app and Safari) and the bottom (Safari) |
| 2 | failed (first round) | the same: the pill 52 pt above the screen's bottom in the web app |
| 3 | passed | Chromium, iPhone 14 Pro emulation: topbar at y=14, nav pill bottom at 642 of 660, the canvas fills 393×660, no page errors |
| 4 | passed | Chromium as an iPhone 16 Pro, safe area 62/34: the frame fills 0,0 to 402×874; the dashboard's pill ends 34 px above the bottom (was 52) |
| 5 | passed | inside the frame `--safe-t` 62px and `--safe-b` 34px, told by the dashboard; weather at y=62, "Sign in" at 150 (88 + 62, where it stood on the screen before), hint at 154 |
| 6 | passed in parts | the logic with a renderer answering at once, both backends: sky rows to the top (`#96b4dc`), ground rows to the bottom (`#5a783c`), the page's background the sky's, no second read within 1.5 s, nothing read and no strips on a computer. The dashboard took the frame's colours onto its frame and strips, and refused them from elsewhere and when they were not colours. Row order on three r187: WebGPU's row 0 is the top, WebGL's the bottom. **Not seen end to end here:** this container draws on a software GPU (0.3 frames a second) and a read waits behind the whole queue: the game's own 512×512 read took 16.5 s, the edges' did not come back within 30 s |
| 7 | passed | 402 px wide: the weather at (99, 62, 205×30), the stat under it at (111, 98, 180×30), apart; the hint at 154 under both |
| 8 | passed | 1440×900: one row at 14 px (stat 523–704, weather 712–917), the pill 18 px up, no strips |
| 9 | not run | needs the deploy and Samuel's iPhone |

**Known gaps:**

- In Safari's tab the picture itself cannot go under the bars of a page that does not scroll; only their colour follows it.
- How Safari picks the bars' colour is not documented. The screenshots show it took the frame's background for both
  bars; the strips are for a sampler that looks at the very edge. Only the iPhone shows which one it is.
- iOS may keep the status bar a web app was added with: if it stays blue, remove the app from the home screen and add it again.
- The game opened on its own in Safari (play.next.maia.city) sizes its canvas by `100vh` and its picture by `innerHeight`:
  not touched here.
- The story folder is not spawned yet.

## Story

## Archived

---

## Todo

- [x] viewport-fit=cover on every page
- [x] safe-area insets in the edge tokens
- [ ] Samuel checks on his iPhone (first round: failed)
- [x] black-translucent for the web app
- [x] the safe area as the larger of margin and inset, told to the framed game
- [x] the dashboard's views clear of the status bar
- [x] Safari's bars in the picture's colours
- [x] the stat and the weather apart on a phone
- [ ] Samuel checks again on his iPhone, as a web app and in Safari

## Changelog

### 2026-11-15

- **Asked:** Make the background span the full height on iOS, without moving the nav controls into the unsafe areas.
- **Delivered:** viewport-fit=cover, plus safe-area-aware edge tokens.
- **Good:** It is one place in brand.css, so every screen follows.
- **Broke / not there yet:** Not seen on a real iPhone yet.

### 2026-11-15, onto next

- **Asked:** "Allow auto merge so the CI to next runs." next.maia.city deploys from main only, so checks 1 and 2 need the merge first.
- **Delivered:** PR #6 taken out of draft and merged into main by hand once CI passed (auto-merge is off in the repository). CI's `next` job is skipped on main (`AUTO_DEPLOY_NEXT` is not on), so the Deploy workflow was started for the merge commit `b137a56`: it passed at 15:14 UTC.
- **Good:** CI `check` was green before the merge and on main after it.
- **Broke / not there yet:** Still not seen on a real iPhone. That is Samuel's check on next.

### 2026-11-15, on the iPhone

- **Asked:** "Top isn't spanning yet iOS and bottom the space is to much now can you see (one is PWA and one mobile safari). And on Safari mode it didn't work either can you see" (two screenshots: the web app at 16:22, Safari at 16:24).
- **Delivered:** see Build (again): black-translucent for the web app; safe area as the larger of the margin and the inset, told to the framed game; the dashboard's views clear of the status bar; Safari's bars in the picture's colours; the stat and weather apart on a phone.
- **Good:** The bands were found to be one colour: the dashboard's frame (`#9fc2e6`), measured on the screenshots. Chromium can be told a phone's safe area (DevTools' `Emulation.setSafeAreaInsetsOverride`), so the web app's layout was measured, not guessed.
- **Broke / not there yet:** In Safari's tab the bars can only take the picture's colours, not the picture. The colour reading could not be seen end to end here (a software GPU); it is checked in parts. The stat's overlap with the weather was older than this intent and was only seen now.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-15 | `a6d9f31` | viewport-fit=cover and safe-area edge tokens |
| 2026-11-15 | `e806905` | black-translucent, safe area told to the frame, Safari's bars in the picture's colours, stat and weather apart on a phone |
