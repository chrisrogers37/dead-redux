#!/bin/bash
# three 0.185.0 from the npm registry, its tarball checked against the registry's integrity value, and the two files the site loads from the CDN
# checked against the digests that the Screenshots job prints for them.
set -euo pipefail
dir="$RUNNER_TEMP/three"
pack="$RUNNER_TEMP/three-pack"
rm -rf "$dir" "$pack"
mkdir -p "$dir" "$pack"
cd "$pack"
npm pack three@0.185.0 --silent > /dev/null
want=$(npm view three@0.185.0 dist.integrity)
got="sha512-$(openssl dgst -sha512 -binary three-0.185.0.tgz | openssl base64 -A)"
echo "registry integrity: $want"
echo "tarball:            $got"
test "$want" = "$got"
tar -xzf three-0.185.0.tgz -C "$dir" --strip-components=1 package/package.json package/build/three.module.min.js package/build/three.core.min.js package/examples/jsm/utils/BufferGeometryUtils.js
for pair in "build/three.module.min.js:QHQk1LzjJlJYNdthXjKCmffpDRZL3EqJ7LfqBzyKyvGgjAYM2ZVuYtFGg42NcAJ/" "examples/jsm/utils/BufferGeometryUtils.js:05mkYituMJObxUkTK7xbW9SA45DEaxOge7FQUGrhW3dsFz0fckzykM6RMAPN26rD"; do
  name=${pair%%:*}
  expected=${pair##*:}
  actual=$(openssl dgst -sha384 -binary "$dir/$name" | openssl base64 -A)
  echo "$name sha384-$actual"
  test "$actual" = "$expected"
done
echo "three 0.185.0 matches the registry and the CDN digests"
