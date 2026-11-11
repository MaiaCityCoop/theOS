# 0001 · Intents, stories, one dashboard

The story of [intent 0001](../../Intents/0001-intents-stories-os.md). Its facts are that intent's
[changelog](../../Intents/0001-intents-stories-os.md#changelog); its film is
[`timeline.json`](timeline.json), played live in the game:
`http://localhost:5173/timeline.html?story=0001-intents-stories-os`.

_A first draft, written at Propose. It is told in full once the intent is accepted._

## Beats

1. **Eighteen cycles, one long log.** The world had been built in eighteen request cycles, each a
   paragraph in a devlog with a commit hash. It worked as a diary. It did not say what was being
   worked on, what was agreed, or what was left.
2. **"Work packages and changelog at the same time."** Samuel asked for intents: one document per
   piece of work, its states as its sections, filled as the work moves; a todo, a changelog and a
   trail of commits at its end.
3. **A step that was not in the old system: story.** After a proposal and before the archive, the
   work is told: what was wanted, what was made. Each proposed intent gets a folder here, with the
   story and a file for the in-game camera.
4. **The film is a file.** `timeline.json` holds the camera's moves and the lines over them. The
   game plays it live, the same every time. This story's film borrows the river's camera moves:
   this intent changed nothing in the world.
5. **One board.** OS reads the intents and the stories from the repository, shows where each
   stands, and plays a story inside the game.

## The film

| At | Line |
| --- | --- |
| 0:01 | Intent 0001 · Intents, stories, one dashboard |
| 0:08 | Samuel: "Intents are work packages and changelog at the same time." |
| 0:16 | One Markdown document per intent. Its states are its sections: idea, define, build, propose, story, archived. |
| 0:24 | Samuel: "A story should have the changelog of the intent referenced, and a JSON config for our in-game camera timeline." |
| 0:33 | Each proposed intent gets a folder in TheStory: the story, and this timeline. The camera moves and these lines are that file, played live. |
| 0:41 | Samuel: "OS should be the dashboard that wires TheGame, TheStory and Intents together." |
| 0:49 | OS reads the intents and the stories from the repository, shows them as a board, and plays a story inside the game. |
