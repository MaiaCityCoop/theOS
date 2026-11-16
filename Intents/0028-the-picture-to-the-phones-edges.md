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

**Back to build again (2026-11-16, Samuel's iPhone, 12:58).** Check 9 failed: "The iOS full screen still doesn't work, can
you see?" Two screenshots: the web app on the home screen (the picture starts under an opaque light status bar; the thin
strips show, coloured as the picture: the colours were read) and play.next.maia.city in Safari's tab while loading (both
bars light blue, `#a8c3e3`). What was found, from WebKit's own source (`LocalFrameView::fixedContainerEdges`,
`Page::updateFixedContainerEdges`, trunk `d3afea7`) and a published study of it on devices (Joe Bell's apple-web-app
notes: the iOS 26.5 Simulator, an iPhone 17 Pro on iOS 27.0):

- Safari looks at one point per edge, the middle of the edge 4px in. It takes the background colour of the first fixed
  or sticky element from there up if that element is at least 90% of the page's width and more than 10px deep; with
  none, the page's background (the body's before the root's). The 4px strips were never under that point: Safari took
  the game's `body` background, `#9fc2e6`. `pointer-events` does not matter; a pseudo-element (the loading veil) is not
  counted and hides what is under it.
- Safari reads the colours again only when a fixed element comes or goes (or its bars change, or a page loads), not when
  an element changes colour. A page that does not scroll keeps its first colours.
- A web app on the home screen honours `black-translucent` only with `apple-mobile-web-app-capable`. Without it, iOS 26
  opens it as a web app anyway, with an opaque status bar and the page under it, as the screenshot shows. iOS keeps the
  style a web app was added with: it has to be added again.
- Known in WebKit (bug 301994): on iOS 26.1, and again reported on 26.5.2 and iOS 27's betas, `black-translucent` gives an
  opaque bar and a top inset of 0. Nothing a page can change.

**Deliverables, third time**

7. Safari's tab: at each edge a strip the page's width and 12px deep (more than Safari's 10), with a short fade into the
   picture, above the loading veil while it stands and under every control, coloured with the picture's edge and made
   anew when the colour changes; until the game's scripts run, the page's background the veil's night (iOS only). Only in
   Safari's tab on iOS (`navigator.standalone === false`): not on a computer, not on other phones, not in a web app.
   The dashboard the same, with the colours its framed game tells it.
8. The web app on the home screen: `apple-mobile-web-app-capable` (and the standard `mobile-web-app-capable`) on the
   dashboard and the game's pages, so that `black-translucent` holds.

**Checks, third time**

| # | Check | How |
| --- | --- | --- |
| 10 | The game in Safari's tab: Safari's rule finds the strips at both edges, with the veil's colours while loading and the picture's after, made anew | Chromium as the part of an iPhone 16 Pro between Safari's bars (402×714, touch, `navigator.standalone` false), WebKit's rule re-implemented over the page (the element at the middle of each edge 4px in, `pointer-events` ignored, the first fixed one from there up, 90% wide, more than 10px deep); the GPU's answer replaced by two known colours |
| 11 | The dashboard the same, through its own strips | the same at `/#game`, the game framed |
| 12 | No strips on a computer, on another phone, or in a web app | Chromium at 1440×900; at 402×714 touch with no `navigator.standalone`; with `navigator.standalone` true |
| 13 | Both sites build, the five pages with the capable tag | `vite build` for TheGame and OS; the tag in the built HTML |
| 14 | On Samuel's iPhone: Safari's tab (the bars in the picture's colours, following it) and the web app added again (the picture under the status bar) | next.maia.city and play.next.maia.city after the deploy |

**Back to build a fourth time (2026-11-16, Samuel).** "Do they need actual solid colors or can the bars be also images
or game screen? If only solid color is possible give it our brand blue. […] What are the thin 4px strips good for? Use no
tacky workarounds but only clean solutions." Safari's tab paints each bar in one solid colour: WebKit keeps one colour a
side, and a page that does not scroll is never drawn under the bars. Only the web app on the home screen shows the
picture under the status bar. So the brand's blue, and nothing else on the page for it.

**Deliverables, fourth time**

9. Safari's tab: both bars the brand's blue (`--navy`, `#173655`), from the page's own background: no strips, no reading
   of the picture's colours.
10. The dashboard's game the same: the frame part of the page, the page's background the brand's blue while the game shows.

**Checks, fourth time**

| # | Check | How |
| --- | --- | --- |
| 15 | The game in Safari's tab: nothing fixed at the middle of either edge, the page's background `#173655`, while loading and once drawn | Chromium as the iPhone's tab, Safari's rule over the page (check 10's) |
| 16 | The dashboard, from the front page into the game: the same; the frame the whole window, the page not scrolling; on a computer too | the same at `/` then `#game`, 402×714 touch and 1440×900 |
| 17 | Both sites build | `vite build` for TheGame and OS |
| 18 | On Samuel's iPhone: both bars the brand's blue in Safari's tab, the picture under the status bar in the web app added again | next.maia.city and play.next.maia.city after the deploy |

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

- (third) The strips: `brand.css` `.os-edge` (the game) and `OS/index.html` `#game .edge` (the dashboard): 12px, an empty
  `::after` 24px deep for the fade (a child of a fixed element is not what Safari hits at 4px in), z-index 1 under the
  game's controls, 99995 over the loading veil (99990) while it stands. `TheGame/src/ui/edges.js` makes them anew on each
  new colour, or tells the dashboard, which does the same (`OS/src/main.js`: `replaceWith(cloneNode())`). Two strips the
  same, one in the frame and one over it, doubled the fade: the framed game now makes none.
- (third) Who gets the strips: `navigator.standalone === false`, iOS's own property, and a coarse pointer. The earlier
  `(display-mode: browser)` also matched other phones' browsers, which do not read a page for their bars, and the web app
  as iOS 26 opens it without the capable tag (the screenshot shows the strips there).
- (third) The rule was read in WebKit's source, fetched from GitHub (`raw.githubusercontent.com`); the study's pages and
  WebKit's bug tracker could not be reached from here, its notes on GitHub could.

- (fourth) What Safari can paint there: one colour a side (WebKit `FixedContainerEdges`); a picture only goes under the
  bars where the page scrolls under them, and the game's pages do not scroll. So the page's background, which Safari
  takes when nothing fixed stands at an edge's middle, is the brand's blue: `background: var(--navy)` on the game's five
  pages (`index`, `library`, `lenses`, `me`, `timeline`). The strips, their fade and the reading of the picture's rows
  every 1.5 s are gone: `src/ui/edges.js` and its three lines in `src/main.js`, `brand.css` `.os-edge`, the dashboard's
  strips and its `edges` message. `brand.css` keeps the rule in a comment, where the bars are said.
- (fourth) The dashboard's frame was fixed over the page, the size of the window. For such a layer Safari keeps an edge's
  colour it already has (WebKit: `preferExistingColor` for a container the size of the viewport), and the front page's
  sticky header gives the top one: from the front page into the game, the status bar would have kept the front page's
  colour. The frame is now in the page's flow, the page the window's height (`100dvh`) and not scrolling, its background
  `--navy` in play (`body.play`): nothing fixed stands at the edges, Safari takes the page's background.

## Propose

**Delivered, first round:** `viewport-fit=cover` on the 7 pages, and the safe-area-aware `--edge`, `--edge-t` and `--edge-b`, with every top overlay on `--edge-t`.

**Delivered, again (after Samuel's iPhone):** `black-translucent` on the dashboard and the game's pages; `--safe-*` and
`--edge-t/-b` as the larger of the margin and the inset; the dashboard telling its framed game the safe area; the
dashboard's views clear of the status bar and the home bar; `TheGame/src/ui/edges.js` and the dashboard's frame and strips
for Safari's bars; the stat and the weather in two rows on a phone.

**Delivered, third time (after Samuel's iPhone, 2026-11-16):** for Safari's tab, the strips Safari really reads: 12px,
over the veil while loading, made anew with each colour, only in Safari's tab on iOS, in the game and the dashboard; the
veil's night as the page's background until the game's scripts run. For the web app, `apple-mobile-web-app-capable`.

**Delivered, fourth time (Samuel: a solid colour, the brand's blue, clean):** both bars of Safari's tab the brand's blue,
from the page's own background, on the game's pages and the dashboard's game; the strips and the reading of the
picture's colours removed; the dashboard's game part of the page instead of a frame fixed over it.

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
| 9 | failed (second round) | Samuel's iPhone, 12:58: the web app's status bar opaque and the picture under it; in Safari's tab both bars light blue (`#a8c3e3`) |
| 10 | passed | loading: at both edges the hit is the strip (`i.os-edge.t`/`.b`, 402×12, z 99995), `rgb(36, 46, 60)` above, `rgb(156, 133, 96)` below; drawn (WebGL here), the GPU's answer two known colours: the strips made anew (none of the old elements left), above `rgb(110, 90, 50)`, below `rgb(40, 120, 200)`, the body the colour above; no page errors |
| 11 | passed | `html.ios-tab`, the frame at `/game/?in=os`; loading: the hit is the dashboard's strip (`i.edge.t`/`.b`, 402×12, z 2) at both edges, the veil's colours; drawn: made anew with the frame's colours. The page's errors (SVG paths with `NaN`, four 404s: no API here) are the same on main |
| 12 | passed | computer: no strips in the game or the dashboard; touch with no `navigator.standalone`: none; `navigator.standalone` true: none |
| 13 | passed | `vite build` passes for both; the tag in `dist/index.html`, `library.html`, `lenses.html`, `me.html` and OS `dist/index.html` |
| 14 | not run | it went to next (PR #16, 12:29 UTC) and Samuel asked for the brand's blue instead before trying it |
| 15 | passed | the game at 402×714 touch: while loading the hit at both edges is the root (the veil, a pseudo-element, is not counted), once drawn the canvas: no fixed element at either edge; the page's background `rgb(23, 54, 85)`; no strips. No page errors |
| 16 | passed | front page, then `#game`: at both edges the hit is the frame, in the page's flow, nothing fixed up from it; the page's background `rgb(23, 54, 85)`; the page 714 high in a window of 714 (900 in 900 on a computer); the frame at 0,0, 402×714 (1440×900). Screenshots: the game's loading veil in the frame, the dashboard's pill over it, as before |
| 17 | passed | `vite build` passes for both |
| 18 | not run | needs the deploy and Samuel's iPhone; the web app must be removed from the home screen and added again |

**Known gaps:**

- In Safari's tab the picture itself cannot go under the bars of a page that does not scroll; only their colour follows it.
- How Safari picks the bars' colour is not documented. The screenshots show it took the frame's background for both
  bars; the strips are for a sampler that looks at the very edge. Only the iPhone shows which one it is.
- iOS keeps the status bar a web app was added with: it has to be removed from the home screen and added again.
- On iOS versions with WebKit bug 301994 (26.1; reported again on 26.5.2 and iOS 27's betas) the web app's status bar
  stays opaque and the picture starts under it, whatever the page says. The layout holds there (`max(14px, inset)`).
- In Safari's tab the bars are the brand's blue, not the picture: a page that does not scroll is never drawn under them.
  Samuel's iOS version is not known; the rule was read in WebKit's source and seen on iOS 26.5 and 27.0 by others, not on
  his phone.
- Anything wide and fixed added later at the middle of the top or the bottom edge would give Safari its colour instead
  (said in `brand.css`).
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
- [ ] Samuel checks again on his iPhone, as a web app and in Safari (second round: failed)
- [x] strips Safari reads: 12px, over the veil, made anew with each colour, only in Safari's tab on iOS
- [x] apple-mobile-web-app-capable for the web app
- [ ] Samuel checks a third time: Safari's tab, and the web app added to the home screen again (not tried: he chose the brand's blue first)
- [x] the bars the brand's blue from the page's background; strips and colour reading removed
- [x] the dashboard's game part of the page, not a frame fixed over it
- [ ] Samuel checks: the brand's blue in Safari's tab, the web app added again

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

### 2026-11-16, on the iPhone again

- **Asked:** "The iOS full screen still doesn't work, can you see?" (two screenshots, 12:58: the web app on the home screen and play.next.maia.city in Safari's tab).
- **Delivered:** see Build (third): strips Safari really reads (12px, over the loading veil, made anew with each colour, only in Safari's tab on iOS), and `apple-mobile-web-app-capable` for the web app.
- **Good:** The rule was read in WebKit's own source, not guessed: why the 4px strips never counted, and why a colour that changes is not read again. The web app's screenshot showed the colours were being read on the iPhone. Checked here with Safari's rule re-implemented over the page, in the game and the dashboard, and that nothing is drawn on a computer, on other phones or in a web app.
- **Broke / not there yet:** Rounds one and two guessed at how Safari picks its colours, and both guesses were wrong. Not seen on the iPhone yet. The web app has to be added to the home screen again, and on iOS versions with WebKit bug 301994 its status bar stays opaque whatever the page does.

### 2026-11-16, the brand's blue

- **Asked:** "Do they need actual solid colors or can the bars be also images or game screen? If only solid color is possible give it our brand blue. […] What are the thin 4px strips good for? Use no tacky workarounds but only clean solutions."
- **Delivered:** see Build (fourth): the bars the brand's blue from the page's own background; the strips and the reading of the picture's colours removed; the dashboard's game in the page's flow.
- **Good:** One CSS value a page instead of strips and a read of the GPU every second and a half. The dashboard's frame turned out to be a layer Safari treats as an overlay (it would have kept the front page's colour); found in WebKit's source before Samuel saw it.
- **Broke / not there yet:** The 4px strips of round two did nothing for Safari (it ignores anything 10px deep or less) and only showed as thin lines; round three's 12px strips were a band on purpose and are gone now. Not seen on the iPhone yet.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-15 | `a6d9f31` | viewport-fit=cover and safe-area edge tokens |
| 2026-11-15 | `e806905` | black-translucent, safe area told to the frame, Safari's bars in the picture's colours, stat and weather apart on a phone |
| 2026-11-16 | `e140504` | strips Safari reads (12px, over the veil, made anew, only in Safari's tab on iOS); apple-mobile-web-app-capable |
| 2026-11-16 | `9bcc81c` | the bars the brand's blue from the page's background; strips and colour reading out; the dashboard's game in the page's flow |
