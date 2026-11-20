# TheOS

| Folder | What |
| --- | --- |
| [`Intents/`](Intents/README.md) | Every piece of work: one Markdown document each, work package and changelog in one, from idea to archived |
| [`Stories/`](Stories/README.md) | A story per proposed intent, with its film for the in-game camera |
| [`TheGame/`](TheGame/README.md) | The game: one endless procedural land in the browser, and the virtual film camera |
| [`Website/`](Website/README.md) | The dashboard over the three, and the front page |
| `Server/` | `repo.js`: the repository as both dev servers answer it and both builds write it down (the brand, intents, ideas, compass, scenes, stories) |
| `Brand/` | `brand.css`: the one look of every page |
| [`Deploy/`](Deploy/README.md) | Putting the website (`Website/`) and the game (`TheGame/`) on their host: https://next.maia.city and https://play.next.maia.city |
| `Research/` | Research an intent asked for: one Markdown report each, linked from its intent |
| `Research/` | The notes behind each report with their sources, and the scripts and outputs of what was measured for it |

`bun install` in `TheGame/` and in `Website/` once; then `bun run dev` here: one server, http://localhost:5180, the
dashboard at `/` and the game inside it at `/game/` (`/game/library.html`, `/game/lenses.html`, `/game/timeline.html`).
`bun run game` still starts the game on its own on http://localhost:5173. To try it on a phone or tablet on the same
Wi-Fi: `bun run lan`, then open `http://<this Mac's address>:5180/game/` on the device (the address: `ipconfig getifaddr en0`).
It opens the dev server to the local network while it runs; stop it when done.

How work is done here: [`.claude/skills/intents/SKILL.md`](.claude/skills/intents/SKILL.md).
