# Dead Redux — Mission

Dead Redux features one Grateful Dead show a day and plays it in a 3D world (`README.md`). Where it goes next is set by its owner, Chris Rogers, in his own words below. This file adds nothing to them. Where they leave a choice open, the choice is listed as a question for him.

## In Chris's words

> pretty soon, i want to expect dead redux to be immersive with rich graphics and other npcs etc

2026-11-06

> how advanced is dead redux at this point after days of dev? time to revisit the claude, readme, and project mission docs?

2026-11-13

> pretty cool, still pretty basic, though

2026-11-13, on the live site

## Open questions for Chris

Choices the words above leave open. None is decided here.

1. **Other NPCs: around the visitor, or with them?** Today's figures follow the music: five bears walk the setlist, six players play on the stage, and a crowd dances on the hill. Apart from the crowd stepping aside for the visitor, none of them responds to the visitor, and none speaks. The roadmap (#121) has no arc in which one does. Should some?
2. **Rich graphics: built in code, or from files?** Everything in the world is built in code, from shapes and shaders, with no models, textures or images. The roadmap's arcs are "built in code, with no files from outside the site and no change to the security policy" (#121). Should richer graphics stay within that, or may the world load models, textures or images? Some of those would change the site's security policy.
3. **On which devices?** A phone draws a smaller world than a desktop: three bears to its five, at most 150 of the crowd where a desktop fills every seat, no shadows, and a budget of 45 draw calls a frame to its 70 (`public/world/quality.js`, `.github/screenshots/assets.mjs`). Should the richer world reach phones too, or may it stay richer on larger screens?
4. **How immersive?** A visitor walks the island in first or third person and, where the browser allows, hears the stage louder as they near it. The site refuses fullscreen and VR headsets (its Permissions-Policy, `next.config.ts`). Should immersive include either?
5. **For whom, and how will you know it's working?** The words say what the world should become, not who it is for or what would show it has arrived.
