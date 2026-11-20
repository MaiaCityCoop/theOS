# OS

The dashboard over the three: the intents as a board by state, each intent and story as a
document, and the game framed to walk in or to play a story's film. It only reads: the files in
`../Intents`, `../Stories` and `../Compass` are the one source.

Stories → The Compass shows the serial's core from `../Compass` (a story-skills project): its core
message, its premise, and every character, arc, system, place, term and episode as a document.
`compass.js` reads it; `/api/compass` serves it; nothing there changes it.

`bun run dev` at the repository's root starts it on http://localhost:5180, with the game on 5173.

## What runs where

`bun run dev` starts the dashboard; it serves the game inside itself, under `/game/`, so one command is the whole of
TheOS. A second checkout (a worktree) runs on the next ports up.

| | |
| --- | --- |
| `http://localhost:5180` | the dashboard, this folder (`Website/`), with the game under `/game/` |
| `http://localhost:5173` | the game on its own, `bun run game` at the root (`TheGame/`) |

**Everything points at TheOS's own world.** Sign in, on the pill and at the foot of the way in, walks into the game
under `/game/` — not at the old play. `VITE_GAME` points it at a game served somewhere else:

```
VITE_GAME=http://localhost:5174 bun run dev
```

`bun run build` makes the deployed website (`dist/`): the dashboard with every `/api` answer written as a file
(`Deploy/README.md`). The game it frames is at `VITE_GAME`, e.g. `https://play.next.maia.city`.
