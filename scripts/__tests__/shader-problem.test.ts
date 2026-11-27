import { describe, expect, it } from "vitest";
import { shaderProblem } from "../../.github/screenshots/shader.mjs";

const THREE_ERROR = [
  "THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false",
  "",
  "Material Name: ",
  "Material Type: ShaderMaterial",
  "",
  "Program Info Log: Vertex shader is not compiled.",
  "",
  "ERROR: 0:81: 'out' : Illegal use of reserved word",
  "ERROR: 0:81: 'out' : syntax error",
  "ERROR: 0:82: 'a' : undeclared identifier",
  "ERROR: 0:83: 'b' : undeclared identifier",
  "",
  "80: void main() {",
].join("\n");

describe("shaderProblem", () => {
  it("names a shader three.js could not compile: the first line and the first three ERROR lines", () => {
    expect(shaderProblem("error", THREE_ERROR)).toBe(
      [
        "THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false",
        "ERROR: 0:81: 'out' : Illegal use of reserved word",
        "ERROR: 0:81: 'out' : syntax error",
        "ERROR: 0:82: 'a' : undeclared identifier",
      ].join(" | "),
    );
  });

  it("names a THREE.WebGLShader error", () => {
    expect(shaderProblem("error", "THREE.WebGLShader: Shader couldn't compile.")).toBe("THREE.WebGLShader: Shader couldn't compile.");
  });

  it("ignores a Content-Security-Policy message, an ordinary warning and an error that is not a shader's", () => {
    expect(shaderProblem("error", "securitypolicyviolation script-src refused inline")).toBeNull();
    expect(shaderProblem("warning", "THREE.WebGLRenderer: Texture marked for update but no image data found.")).toBeNull();
    expect(shaderProblem("error", "Failed to load resource: the server responded with a status of 404")).toBeNull();
  });

  it("ignores a shader message that is not an error", () => {
    expect(shaderProblem("warning", THREE_ERROR)).toBeNull();
    expect(shaderProblem("log", THREE_ERROR)).toBeNull();
  });
});
