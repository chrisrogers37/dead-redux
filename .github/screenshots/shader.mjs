// A world shader that does not compile or link. three.js logs it with console.error and the mesh then does not draw, so the page
// still loads, the unit tests (which run the shader text as JavaScript) still pass, and a still shows the world without it.
const SHADER_ERROR = /^THREE\.WebGLProgram: Shader Error|THREE\.WebGLShader/;
const MAX_ERROR_LINES = 3;

// The failure line for a console message, or null when it is not a shader that failed: the message's first line, and the shader log's
// ERROR: lines, at most MAX_ERROR_LINES of them. Only a console error counts, and no other: the run has other console noise.
export const shaderProblem = (type, text) => {
  if (type !== "error" || !SHADER_ERROR.test(text)) return null;
  const lines = text.split("\n");
  const errors = lines.slice(1).filter((line) => /^ERROR:/.test(line.trim())).map((line) => line.trim());
  return [lines[0].trim(), ...errors.slice(0, MAX_ERROR_LINES)].join(" | ");
};
