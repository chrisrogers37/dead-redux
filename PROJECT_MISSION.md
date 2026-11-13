# Dead Redux — Mission

Dead Redux features one Grateful Dead show a day and plays it in a 3D world (`README.md`). Where it goes next is set by its owner, Chris Rogers, in his own words below. The recommendations after them answer the choices his words leave open, for him to accept or turn down.

## In Chris's words

> pretty soon, i want to expect dead redux to be immersive with rich graphics and other npcs etc

2026-11-06

> pretty cool, still pretty basic, though

2026-11-13, on the live site

## Recommendations for Chris

Five choices his words leave open, each with a recommended answer, grounded in what the site does today. None is decided until he says yes.

### 1. Other NPCs

**Recommended:** The roadmap's next arc, Dusk to Dawn, plans wildlife that answers the music (#121). Let it notice the visitor too, keeping its distance, and leave figures that speak for later.

**Why:** It is the smallest step past the crowd stepping aside, inside an arc the roadmap already holds.

**What it costs:**
- No change to the security policy, and no files to host.
- Its draw calls come out of the phone's room (see 3).
- Under reduced motion a creature's reaction must be a change of place on an input, as the crowd's parting is, and the shoot needs one more pose.
- Figures that speak would cost more: a plate in the page for their lines, and the lines to write and review.

### 2. Rich graphics

**Recommended:** Keep the world built in code, from shapes and shaders, through Dusk to Dawn. Once that arc lands, decide from the live site whether the world should load models, textures or images.

**Why:** The next arc's richness is light, a night with stars, fireflies and the stage's glow on the sea, which code draws well, so files would add cost before anyone knows they're needed.

**What it costs:**
- Nothing new: no new three.js file, no policy change, nothing to host or license.
- If "still pretty basic" means the shapes themselves, this arc won't answer it. His next look at the live site is the test.
- Files, if he wants them later: a model loader is one more pinned three.js file (`src/lib/import-map.ts`), and models and textures would be the first binary files in `public/` to host and license. Compressed ones need WebAssembly, which the policy refuses today (`src/lib/csp.ts`), so a policy change and a security review.

### 3. Devices

**Recommended:** Bring every new part of the world to phones, scaled by the phone's tier as the world is today, and keep nothing to larger screens alone.

**Why:** Every device already gets the world, scaled to it, and a phone has room to spare.

**What it costs:**
- Each new part fits the phone's room: the CI shoot's walk across the island peaks at 29 draw calls a frame on a phone, against a budget of 45 (`.github/screenshots/assets.mjs`).
- Each part also needs its own count per tier and a place in the downgrade ladder, so a slow phone can shed it (`public/world/quality.js`).
- More phone shots in the CI shoot, which add to its time.
- The shoot counts draw calls, not a real phone's speed, so a part that costs fill, such as glowing points, may still need fewer of them on a phone.

### 4. Immersion

**Recommended:** Let "immersive" mean the world itself: its figures, its light and its sound from the stage. Keep fullscreen and VR refused for now.

**Why:** His sentence sets immersive beside rich graphics and other NPCs, which are about what is in the world, and the site already has a lean-back view and opens without browser bars once installed.

**What it costs:**
- Nothing new.
- Fullscreen later is small: one Permissions-Policy entry (`next.config.ts`), the test that pins the header, a control, and a shot of it.
- VR later is large: a Permissions-Policy change, likely one more pinned three.js file, a second way to move and look, each frame drawn for two eyes within the same budgets, a security review, and no headset in the CI shoot to review it.

### 5. Who it's for, and how to know it's working

**Recommended:** Make it for whoever opens the site for the day's show, and let Chris's own look at the live site be the test. Add no analytics.

**Why:** His verdict so far came from looking at the live site, the roadmap ships in steps he can see, and the site's code counts no visitors today.

**What it costs:**
- Nothing new.
- Nobody will know how many people visit or how long they stay. The evidence stays the live site, and the stills and recordings the CI shoot makes of every preview.
- Counting visitors later means a new package or script, a policy change (a page connects only to the site itself, `src/lib/csp.ts`), and a security review.
