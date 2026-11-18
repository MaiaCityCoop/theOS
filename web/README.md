# Intent 0038, task D: the website before and after (PR #75)

One JPEG per view and width, 1600 px wide: main (`d1c3805`) above, the branch (`ee09b5d`) below.
- Desktop (1440 × 900 @1x) pages are scaled to the width.
- A phone's (390 × 844 @2x) long page is cut into four columns.
- The captures are full-page, taken in headless Chrome from each side's own dev server, with the game under `/game/`
  answered by a blank page on both sides.

| View | Desktop | Phone |
| --- | --- | --- |
| Front page | [home-desktop.jpg](home-desktop.jpg): 1,249 px differ, all inside Samuel's photo ([diff](home-desktop-diff.png)) | [home-phone.jpg](home-phone.jpg): 4,785 px differ, all inside the photo ([diff](home-phone-diff.png)) |
| Dashboard | [city-desktop.jpg](city-desktop.jpg): identical | [city-phone.jpg](city-phone.jpg): identical |
| Intents | [intents-desktop.jpg](intents-desktop.jpg): identical | [intents-phone.jpg](intents-phone.jpg): identical |
| Stories | [stories-desktop.jpg](stories-desktop.jpg): identical | [stories-phone.jpg](stories-phone.jpg): identical |
| Join | [join-desktop.jpg](join-desktop.jpg): identical | [join-phone.jpg](join-phone.jpg): identical |
| The game's frame | [game-desktop.jpg](game-desktop.jpg): identical | [game-phone.jpg](game-phone.jpg): identical |
| Legal (site notice) | [legal-desktop.jpg](legal-desktop.jpg): identical | [legal-phone.jpg](legal-phone.jpg): identical |

Main against main (`noise-diff.json`): 0 px in all 14, so the captures are deterministic. `diff.json` has every count.
`look.mjs` made all of it: `bun look.mjs capture <url> <dir>`, then `bun look.mjs compare <a> <b> <out> <label a> <label b>`.
