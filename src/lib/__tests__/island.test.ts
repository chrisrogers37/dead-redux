import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { takesPool } from "../../../public/world/island.js";

describe("takesPool", () => {
  it("adds the stage's glow to three's Lambert shader as the pinned version writes it: its place from the vertex shader, its light in the fragment shader", () => {
    const { vertexShader, fragmentShader } = THREE.ShaderLib.lambert;
    // Each line the edit hangs on is in the shader once. A three upgrade that renames one would leave the ground without its glow.
    for (const [source, anchor] of [[vertexShader, "#include <common>"], [vertexShader, "#include <project_vertex>"], [fragmentShader, "#include <common>"], [fragmentShader, "#include <lights_fragment_end>"]]) {
      expect(source.split(anchor)).toHaveLength(2);
    }
    const uPool = { value: new THREE.Color(0xff7a30) };
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader, fragmentShader };
    takesPool(new THREE.MeshLambertMaterial(), uPool).onBeforeCompile(shader);
    expect(shader.uniforms.uPool).toBe(uPool);
    expect(shader.vertexShader).toContain("varying vec3 vPoolAt;");
    expect(shader.vertexShader).toContain("vPoolAt = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    expect(shader.fragmentShader).toContain("uniform vec3 uPool;");
    expect(shader.fragmentShader).toContain("reflectedLight.directDiffuse += uPool * diffuseColor.rgb * poolLit");
  });
});
