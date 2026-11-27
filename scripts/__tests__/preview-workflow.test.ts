import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");

describe("the Preview workflow", () => {
  // The workflow without its comments.
  const workflow = readFileSync(join(ROOT, ".github/workflows/preview.yml"), "utf8").split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");

  it("lets its job post commit statuses and nothing else, with no cache, each set once for the whole workflow", () => {
    expect(workflow).toMatch(/^permissions:\n  statuses: write\n(?! )/m);
    expect(workflow).toMatch(/^cache-mode: none$/m);
    // A job that set either of its own would run with that instead.
    expect(workflow).not.toMatch(/^ +(permissions|cache-mode):/m);
  });
});
