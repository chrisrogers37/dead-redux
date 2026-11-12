import { describe, expect, it, vi } from "vitest";
import { buildRig } from "../../../public/world/rig.js";

// public/world/rig.js builds the stage's rig here as stage.js builds it. Stand-ins play the parts the rig is made of. They draw nothing;
// the material keeps the values the rig makes it with, over three's own defaults.
//
// The figures stay dark under the beams because three draws the crowd after them, so a figure covers the light the beams added where it
// stands. main.js orders the two by render order, the rig's below the crowd's (main.test.ts pins both). That order holds only while three
// draws the rig with the solid things: it draws a transparent material after every solid thing, whatever its render order.

const fake = vi.hoisted(() => {
  class Part {}
  class Geometry {
    translate() {
      return this;
    }
    rotateX() {
      return this;
    }
    setAttribute() {
      return this;
    }
  }
  // As three's materials are: not transparent unless made so.
  class Material {
    transparent = false;
    constructor(values: object) {
      Object.assign(this, values);
    }
  }
  class InstancedMesh {
    material: Material;
    constructor(_geometry: Geometry, material: Material) {
      this.material = material;
    }
    setMatrixAt() {}
  }
  const three = {
    CylinderGeometry: Geometry,
    InstancedBufferAttribute: Part,
    InstancedMesh,
    Matrix4: class {
      makeTranslation() {
        return this;
      }
    },
    ShaderMaterial: Material,
    Sphere: Part,
    Vector3: Part,
    UniformsLib: { fog: {} },
    UniformsUtils: { clone: (uniforms: object) => ({ ...uniforms }) },
    AdditiveBlending: 2,
    DoubleSide: 2,
  };
  return { three };
});

vi.mock("three", () => fake.three);

describe("rig.js's beams", () => {
  it("are drawn with a material that is not transparent, so three draws them with the solid things, in their render order", () => {
    const { mesh } = buildRig({ add: () => {} }, { uC0: { value: null }, uC1: { value: null } });
    expect(mesh.material.transparent).toBe(false);
  });
});
