# Dead Redux

A new Grateful Dead show every day, played in a 3D world built from its setlist.

https://dead-redux.vercel.app

## The daily pick

Each day features one show. Everyone who visits that day gets the same one, and a date keeps its show for good.

- The day turns over at midnight Eastern time (`src/lib/site-day.ts`).
- `data/pick-schedule.json` names every date's show. From launch on 2026-02-16 to 2026-10-31, each day keeps the show the site served on it. From 2026-11-01 a fixed rotation runs through every show that has a recording, once each, and saves the shows featured before it for last. Its first pass ends on 2032-07-09, and then it starts over.
- `data/shows.json` is the catalog: 2,079 shows, from 1965-11-01 to 1995-07-09. `npm run fetch-shows` refreshes it from [Relisten](https://relisten.net). New shows join the rotation just before its first repeat, which moves no date before that point (`src/lib/pick-schedule.ts`).
- When a page renders, it asks Relisten for the show's recordings and picks one: labelled tracks first, then a soundboard, then the best rated (`src/lib/relisten.ts`). The audio streams from the Live Music Archive at archive.org. If there is no recording, or the look-up fails, the page says which.
- `/archive` lists the days before today, by month, and `/<YYYY-MM-DD>` is any day's page.

## The world

The home page and every day's page are an island, drawn in the browser with three.js. A stage stands at its north-east edge, with six players in silhouette and a rig of light beams, and the hill before it is the seating.

- **The setlist is the path.** Each song is a landmark on a loop over the island: set 2's opener on the summit, Drums in the left cave and Space in the right (`public/world/path.js`). Five bears walk it as the show plays, three on a phone.
- **The visitor is one more bear.** The first move starts the show: a walking key, or a tap or click on the world. Walk in third person or first, walk with the bears, or lean back while the camera drifts.
- **A crowd fills the hill.** Faceless figures dance to the band's beat, rise as the music builds to a peak, sit at set break and in Space, and step aside as the visitor walks through (`public/world/crowd.js`, `seats.js`).
- **The music drives it in three layers** (`public/world/main.js`):
  1. The setlist: sets, segues, Drums and Space, and the sky's colours for each set.
  2. The live sound: where the browser routes the audio through the world, it plays from the stage, louder as you near it, and an analyser drives the sky, the lights, the flame, the crowd and the bears' stride (`audio.js`).
  3. The show's map: a reading of the recording's loudness, tempo and peaks, made ahead of its day (`public/maps/<show date>.json`). It builds the light toward each peak, sets the beat the figures move to, and stands in for the live sound where the browser can't analyse it (`maps.js`).
- **Every device gets the world, scaled to it.** Desktop, phone and TV each have a tier, and a slow device steps quality down (`public/world/quality.js`). With reduced motion set, the world holds still. Without WebGL 2, a still picture shows and the player works as before.

### Controls

| | |
|---|---|
| Walk and turn | Arrow keys or W A S D; Q and E step sideways; Shift runs |
| Look around | Drag, or T and G |
| Walk with the bears | B |
| First person | V |
| Lean back | F; Esc leaves it |
| Play or pause | Space or K |
| Back or ahead 10 s | J or L |
| Previous or next song | P or N |
| On a phone | The pad walks and turns; a drag turns and looks |

The letter keys can be switched off under Details (Single-key shortcuts). They still work while the world has focus.

## The stack

- Next.js 16, React 19, TypeScript and Tailwind CSS 4.
- The world is plain JavaScript modules in `public/world/`, outside the bundle: the page loads `/world/main.js` as a module script. three.js 0.185.0 comes from jsDelivr through an import map that pins each file's hash (`src/lib/import-map.ts`).
- Each page gets a Content-Security-Policy with a fresh nonce (`src/proxy.ts`).
- Vitest for tests, GitHub Actions for CI, and Vercel for hosting.

## Run and test

Node 24, as CI uses.

```sh
npm ci
npm run dev    # http://localhost:3000
```

The world loads three.js from jsDelivr, so the dev server needs a network connection. The dev server sends no Content-Security-Policy; a build does.

| Command | What it does |
|---|---|
| `npm run build`, then `npm start` | A production build, served locally |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type-check |
| `npm run test:run` | Every test, once |
| `npm test` | Tests in watch mode |
| `npx vitest run src/lib/__tests__/quality.test.ts` | One test file |
| `npm run fetch-shows` | Refreshes `data/shows.json` from Relisten |

Tests are in `src/lib/__tests__/` and `scripts/__tests__/`.

## Deploys

Vercel deploys `main` to production at https://dead-redux.vercel.app, and each other pushed branch as a preview, except `maps` (`vercel.json`). Pages render on every visit, since each depends on the day.

GitHub Actions run three workflows (`.github/workflows/`):

- **CI** runs Lint, Type-check and Unit tests on every pull request and every push to `main`. The repo's ruleset takes changes into `main` only through pull requests that pass all three.
- **Screenshots** shoots each ready preview in stills and recordings. It fails a frame over its tier's draw-call budget, two reduced-motion stills that differ, a CDN file that doesn't match its pinned hash, or a failed install check. It runs on production on demand.
- **Maps** runs daily at 06:20 UTC. It makes the maps the next 14 featured days still need, at most two a run, from the recording each day's page plays, and commits them to the `maps` branch. The recording is analysed in memory and only the map is kept. Maps reach the site when `maps` is merged into `main`.

## Recordings

The recordings stream from the [Live Music Archive](https://archive.org/details/GratefulDead) at archive.org, and show data comes from [Relisten](https://relisten.net). The site stores no audio.

## More

- [`PROJECT_MISSION.md`](PROJECT_MISSION.md): where Dead Redux is going.
- [`CLAUDE.md`](CLAUDE.md): the rules for working in this repo.
- [#121](https://github.com/chrisrogers37/dead-redux/issues/121): the world's roadmap.
