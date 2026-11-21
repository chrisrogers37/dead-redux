# Dusk to Dawn: the stills, recordings and logs of #162 to #166

Shot on 2026-11-21 for the five pull requests that carry the island through a night (#121's Dusk to Dawn), each from its own Vercel preview, on the fixed day `/2026-10-20` (the show of 1986-07-04) with its test hooks.

Everything here was drawn by headless Chromium on a Mac's GPU, at the top rung of the quality ladder. None of it says anything about a real phone's frame rate.

| File | What it shows | Shot from |
|---|---|---|
| `night-desktop.png` | main at four hours of the show, the night at the same four from behind the crowd, the walk at three hours, and the path at daybreak | #163's preview at `b1c1cd4`; main's row from #162's preview, whose world is main's |
| `night-phone.png` | the same four hours on a phone, main above the night | the same |
| `recording/desktop-crowd-night-passing.webm`, `recording/phone-crowd-night-passing.webm` | the night passing as the show clock is moved from set 1 to Drums to the encore, a hold at each | #163's preview at `b1c1cd4` |
| `bears.png`, `bears-phone.png` | the bears on main and in #164 | #164's preview at `0d0ec9e` |
| `crowd.png` | the crowd's figures on main and in #165, standing, seated in Space, and the seated rows at dusk; each an enlarged crop | #165's preview at `1a59734` |
| `shelves-desktop.png`, `shelves-phone.png` | the HUD's three shelves out and away | #166's preview at `e5d510c` |

## Logs

- `logs/ci-shoot-459f391-night-lines.log`: from the Screenshots run of #163 at `459f391` (run 44936734180): the night shots' stats lines, the walk's sweep and the reduced-motion compare.
- `logs/sweep-local-87b7c76.log` and `logs/sweep-local-main.log`: the walk's sweep (2,825 poses) at five hours of the show, paused and playing, on each tier, on the local branch the pull requests were cut from and on main.
- `logs/reduced-motion.log`: pairs of stills 5 s apart under reduced motion on #163's preview.
- `logs/seek-and-join.log`: the world's hour beside the show's, every half second, through a join mid-show and seeks, with the real player.
- `logs/flash-windows-A-B-C.json` and `logs/flash-windows-D-S.json`: swings of 10 % in relative luminance per 2×2 block in five windows of the show, the branch beside main, the whole frame and the light alone. A: Fire On The Mountain, 140 to 162 s. B: Drums, 120 to 130 s. C: Jack Straw, 60 to 70 s. D: U.S. Blues, 250 to 272 s. S: 28 s with three seeks, dusk to Drums to the encore and back.

## The working branch, `world/next`

`next/desktop.png` and `next/phone.png`: the five pull requests together with the work that follows them (the land's turf and worn tracks, the sea's swell and foam, grass, flowers and stones, fireflies), shot from the branch's preview at `257e873`, at four hours of the show. `next/bears.png`: the bears with their ruff and tail, from the local dev server at `92b461c`.

## After the five: #168 and #169

`after/land-desktop.png` and `after/land-phone.png`: main above, #169 below (the land, the sea, the flora and the fireflies), from #169's preview at `864f2ed`. `after/notes-night.png` and `after/notes-bears.png`: main beside #168 (the night's light tuned; the bears' ruff and tail), from #168's preview at `0d0540e`. Main's stills are from #167's preview, whose world is main's.
