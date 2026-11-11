# TheOS

| Folder | What |
| --- | --- |
| [`Intents/`](Intents/README.md) | Every piece of work: one Markdown document each, work package and changelog in one, from idea to archived |
| [`Stories/`](Stories/README.md) | A story per proposed intent, with its film for the in-game camera |
| [`TheGame/`](TheGame/README.md) | Sandbox 8: one endless procedural land in the browser, and the virtual film camera |
| [`OS/`](OS/README.md) | The dashboard over the three, and the front page |
| `brand/` | `brand.css`: the one look of every page |

`bun install` in `TheGame/` and in `OS/` once; then `bun run dev` here: one server, http://localhost:5180, the
dashboard at `/` and the game inside it at `/game/` (`/game/library.html`, `/game/lenses.html`, `/game/timeline.html`).
`bun run game` still starts the game on its own on http://localhost:5173. To try it on a phone or tablet on the same
Wi-Fi: `bun run lan`, then open `http://<this Mac's address>:5180/game/` on the device (the address: `ipconfig getifaddr en0`).
It opens the dev server to the local network while it runs; stop it when done.

How work is done here: [`.claude/skills/intents/SKILL.md`](.claude/skills/intents/SKILL.md).
