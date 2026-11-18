---
name: artifacts
description: Maia City's artifact library in TheOS (Artifacts/items/), the outside sources we learn from, one JSON each, checked against Artifacts/schema.json and shown in the dashboard's Artifacts app. Use whenever Samuel pastes or names a link (YouTube, a video, a podcast, an x.com post, a social media post, a blog post, an article, a website, a Wikipedia article, a research paper, a book, a repo) or pastes a transcript or article text, says "add this", "keep this", "save this as an artifact", "add to the library", asks what we have on a topic, or wants a source tagged, summarised or found again; also whenever research of our own uses a source worth keeping (a plant's numbers, a claim in a story). Every change is a call of `bun Artifacts/artifacts.js`.
---

# Artifacts

The library of everything outside that we learn from: one folder per source in `Artifacts/items/<id>/`.

| File | What | In git |
| --- | --- | --- |
| `artifact.json` | ours: the link, its type, our title, description, summary, category and tags | yes |
| `source.md` | the original, extracted verbatim: the transcript, the article, the paper, the post | **no**: it is the author's work, and the repository is public |
| `thumb.jpg` | the source's own image (thumbnail, og:image) | **no**, for the same reason; `thumb.url` points at the original, which the published site shows |

The schema is `Artifacts/schema.json`, and it is the only definition of an artifact; read it before writing one. The dashboard's **Artifacts** app (`#artifacts`) shows the library: filter by type, category and tag, search, and open one to read it.

## Adding a link

1. **Draft:** `bun Artifacts/artifacts.js new <url> [--id <kebab-id>]`. It detects the type from the host, finds the title, author, date and length where it can (YouTube by oEmbed and the page; other pages by their meta tags), and keeps the thumbnail.
2. **The original, verbatim:** `bun Artifacts/artifacts.js source <id> <file> --how "<how>"`, or pipe it with `-`.
   - **YouTube:** use the transcript Samuel pasted. Otherwise use yt-dlp subtitles (`yt-dlp --skip-download --write-auto-subs --sub-format vtt`) if it is installed, stripped to plain text. If neither is there, ask Samuel to paste it.
   - **Articles, blogs, wiki:** use the page's main text. **Papers:** the abstract and the text if it is open access. **Posts:** the post itself.
   - If there is no original, set `source.kind` to `none`.
3. **Read the original** and write our parts into `artifact.json`, in our voice (the Compass's: say what it is and what it gives us):
   - `title`: short and compact, at most 80 characters, in our words, without the channel's or site's name (that is `author`).
   - `description`: at most 200 words, plain text. What it is, its key claim, and why it matters to Maia City.
   - `summary`: at most 3 paragraphs, one string each, with a bolded lead sentence per paragraph.
   - `category`: the one shelf from the schema's list.
   - `tags`: all of its tags, lowercase kebab-case. Reuse tags that already exist (`bun Artifacts/artifacts.js list` shows them) before inventing new ones.
   - `origin`: `human` when Samuel or another person brought it, `agent` when found in our own research.
   - `usedIn`: the files that draw on it. `intent`: the intent it was added under.
4. **Check:** `bun Artifacts/artifacts.js check`. It must pass; it is the schema plus the 200-word and 3-paragraph limits.
5. **If it changes how we build**, carry the lesson into the Compass in our own words, citing the artifact by its id (as `Compass/worldbuilding/systems/the-tribe.md` does). Never copy the source's words into the Compass.

Other commands:

- `bun Artifacts/artifacts.js list [--tag t] [--category c] [--type t]`
- `bun Artifacts/artifacts.js thumb <id> [<image url>]`

## Rules

- **One artifact per source.** If the link is already in the library, update that artifact; don't add a second.
- **Never commit `source.md` or `thumb.jpg`.** `.gitignore` keeps them out; do not force-add them. They live on the machine that added them.
- **Quoting:** what we publish (the summary, the Compass) is our own wording. Quotes are short and attributed.
- **Ask Samuel only** when the link cannot be read and no transcript or text was given.
- **maia-play** has its own artifacts (`add_artifact`, with title, description, summary and authors). This library is the repository's copy, and the fields are kept close so the two can be synced later.
