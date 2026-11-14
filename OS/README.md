# OS

The dashboard over the three: the intents as a board by state, each intent and story as a
document, and the game framed to walk in or to play a story's film. It only reads: the files in
`../Intents`, `../Stories` and `../Bible` are the one source.

Stories → The Bible shows the serial's spine from `../Bible` (a story-skills project): its premise and
what stands against it, the ladder of Fibonacci steps in paying citizens, and every character, arc,
system, place, term and episode as a document. `bible.js` reads it; `/api/bible` serves it; nothing
there changes it.

`bun run dev` at the repository's root starts it on http://localhost:5180, with the game on 5173.

## What runs where

`bun run dev` starts the dashboard; it serves the game inside itself, under `/game/`, so one command is the whole of
TheOS. A second checkout (a worktree) runs on the next ports up.

| | |
| --- | --- |
| `http://localhost:5180` | the dashboard, this folder (`OS/`), with the game under `/game/` |
| `http://localhost:5173` | the game on its own, `bun run game` at the root (`TheGame/`) |

**Everything points at TheOS's own world.** Sign in, on the pill and at the foot of the way in, walks into the game
under `/game/` — not at the old play. `VITE_GAME` points it at a game served somewhere else:

```
VITE_GAME=http://localhost:5174 bun run dev
```
