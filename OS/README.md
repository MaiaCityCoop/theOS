# OS

The dashboard over the three: the intents as a board by state, each intent and story as a
document, and the game framed to walk in or to play a story's film. It only reads: the files in
`../Intents` and `../Stories` are the one source.

`bun run dev` at the repository's root starts it on http://localhost:5180, with the game on 5173.

`bun run build` makes the deployed website (`dist/`): the dashboard with every `/api` answer written as a file
(`deploy/README.md`). The game it frames is at `VITE_GAME`, e.g. `https://play.next.maia.city`.
