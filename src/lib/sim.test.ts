import { describe, it, expect } from "vitest";
import { generate, run, defaultParams, noMit } from "./sim";

describe("bias simulator", () => {
  const c = generate(defaultParams);
  it("biased baseline fails four-fifths rule", () => {
    expect(run(c, defaultParams, noMit).metrics.disparateImpact).toBeLessThan(0.8);
  });
  it("group-aware thresholds reach near parity", () => {
    const m = run(c, defaultParams, { ...noMit, equalThreshold: true }).metrics;
    expect(m.disparateImpact).toBeGreaterThan(0.9);
  });
  it("blind + structured improves disparate impact", () => {
    const base = run(c, defaultParams, noMit).metrics.disparateImpact;
    const mit = run(c, defaultParams, { ...noMit, blind: true, structured: true }).metrics.disparateImpact;
    expect(mit).toBeGreaterThan(base);
  });
});
