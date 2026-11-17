// The import map the root layout emits, which lets the world's modules import three.js and its addons by bare name.
//
// `integrity` pins each file the world loads from the CDN to the sha384 of that file in the three version's npm package
// (`openssl dgst -sha384 -binary FILE | openssl base64 -A` on the file `npm pack` fetches), never to a hash of what the CDN serves. A
// browser that reads it refuses a file whose hash differs; one that does not read it loads the file as before. The Screenshots
// workflow checks that the CDN serves each pinned file with its hash. Integrity is per URL, so each file needs its own entry.
const THREE = "https://cdn.jsdelivr.net/npm/three@0.185.0/";

export const importMap: { imports: Record<string, string>; integrity: Record<string, string> } = {
  imports: {
    three: `${THREE}build/three.module.min.js`,
    "three/addons/": `${THREE}examples/jsm/`,
  },
  integrity: {
    [`${THREE}build/three.module.min.js`]: "sha384-QHQk1LzjJlJYNdthXjKCmffpDRZL3EqJ7LfqBzyKyvGgjAYM2ZVuYtFGg42NcAJ/",
    // three.module.min.js imports it.
    [`${THREE}build/three.core.min.js`]: "sha384-hVJglfJ3ExjEf/gZlu5Oiq3Zi9zgxOs4Kut5eM2Ts9j5xj0UcGQ6Np1eU3Qpw/5c",
    [`${THREE}examples/jsm/utils/BufferGeometryUtils.js`]: "sha384-05mkYituMJObxUkTK7xbW9SA45DEaxOge7FQUGrhW3dsFz0fckzykM6RMAPN26rD",
  },
};
