// Recruitment bias simulation engine (pure, deterministic per seed).
export type Group = "A" | "B";
export interface Candidate {
  id: number; group: Group; skill: number; experience: number; prestige: number; gap: boolean;
  qualified: boolean;
}
export interface Params {
  n: number; seed: number; shareB: number;
  prestigeGap: number;   // historical access gap in school prestige for B
  gapRate: number;       // extra career-gap rate for B
  reviewerBias: number;  // interview score penalty for B
  prestigeWeight: number;// how much screening relies on prestige proxy
  cutoff: number;        // selection rate per stage (0-1)
}
export interface Mitigations { blind: boolean; reweigh: boolean; equalThreshold: boolean; structured: boolean; }

export const defaultParams: Params = { n: 2000, seed: 42, shareB: 0.4, prestigeGap: 0.6, gapRate: 0.25, reviewerBias: 0.4, prestigeWeight: 0.5, cutoff: 0.4 };
export const noMit: Mitigations = { blind: false, reweigh: false, equalThreshold: false, structured: false };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(r: () => number) { return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()); }

export function generate(p: Params): Candidate[] {
  const r = rng(p.seed);
  return Array.from({ length: p.n }, (_, id) => {
    const group: Group = r() < p.shareB ? "B" : "A";
    const skill = gauss(r); // true ability, identical distribution across groups
    const experience = 0.6 * skill + 0.8 * gauss(r);
    const prestige = 0.3 * skill + gauss(r) - (group === "B" ? p.prestigeGap : 0);
    const gap = r() < 0.1 + (group === "B" ? p.gapRate : 0);
    return { id, group, skill, experience, prestige, gap, qualified: skill > 0.3 };
  });
}

function selectTop(scored: { c: Candidate; s: number }[], rate: number, equal: boolean): Candidate[] {
  if (!equal) {
    const k = Math.round(scored.length * rate);
    return [...scored].sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.c);
  }
  // Group-specific thresholds -> equal selection rate (demographic parity post-processing)
  return (["A", "B"] as Group[]).flatMap((g) => {
    const sub = scored.filter((x) => x.c.group === g);
    return selectTop(sub, rate, false);
  });
}

export interface StageResult { name: string; A: number; B: number; rateA: number; rateB: number; }
export interface Metrics { disparateImpact: number; parityDiff: number; equalOpp: number; tprA: number; tprB: number; precision: number; hiredA: number; hiredB: number; }

export function run(cands: Candidate[], p: Params, m: Mitigations) {
  const r = rng(p.seed + 7);
  const nA = cands.filter((c) => c.group === "A").length, nB = cands.length - nA;
  // Reweighing (Kamiran & Calders): correct the historical "model" bias learned from past hires.
  const pw = m.reweigh ? p.prestigeWeight * 0.2 : p.prestigeWeight;
  const stages: StageResult[] = [{ name: "Applicants", A: nA, B: nB, rateA: 1, rateB: 1 }];

  const screen = cands.map((c) => ({
    c,
    s: 0.6 * c.experience + (m.blind ? 0 : pw * c.prestige - (c.gap ? 0.5 : 0)) + 0.3 * gauss(r),
  }));
  const s1 = selectTop(screen, p.cutoff + 0.15, m.equalThreshold);
  const push = (name: string, list: Candidate[], prev: StageResult) => {
    const A = list.filter((c) => c.group === "A").length, B = list.length - A;
    const st = { name, A, B, rateA: prev.A ? A / prev.A : 0, rateB: prev.B ? B / prev.B : 0 };
    stages.push(st); return st;
  };
  const st1 = push("Résumé screen", s1, stages[0]);

  const noise = m.structured ? 0.3 : 0.8;
  const interview = s1.map((c) => ({
    c,
    s: c.skill + noise * gauss(r) - (c.group === "B" ? p.reviewerBias * (m.structured ? 0.25 : 1) : 0),
  }));
  const s2 = selectTop(interview, p.cutoff + 0.1, m.equalThreshold);
  const st2 = push("Interview", s2, st1);

  const offer = s2.map((c) => ({ c, s: c.skill + 0.5 * gauss(r) }));
  const hired = selectTop(offer, 0.5, m.equalThreshold);
  push("Offer", hired, st2);

  const hA = hired.filter((c) => c.group === "A"), hB = hired.filter((c) => c.group === "B");
  const rA = hA.length / nA, rB = hB.length / nB;
  const qA = cands.filter((c) => c.group === "A" && c.qualified).length;
  const qB = cands.filter((c) => c.group === "B" && c.qualified).length;
  const tprA = hA.filter((c) => c.qualified).length / (qA || 1);
  const tprB = hB.filter((c) => c.qualified).length / (qB || 1);
  const metrics: Metrics = {
    disparateImpact: rA ? rB / rA : 0, parityDiff: rA - rB, equalOpp: tprA - tprB, tprA, tprB,
    precision: hired.filter((c) => c.qualified).length / (hired.length || 1), hiredA: hA.length, hiredB: hB.length,
  };
  return { stages, metrics };
}

export function interventions(p: Params, m: Mitigations, met: Metrics) {
  const out: { title: string; why: string; key?: keyof Mitigations }[] = [];
  if (met.disparateImpact < 0.8) out.push({ title: "Fails the four-fifths rule", why: `Group B is hired at ${(met.disparateImpact * 100).toFixed(0)}% the rate of Group A (legal threshold 80%).` });
  if (!m.blind && (p.prestigeWeight > 0.2 || p.gapRate > 0.1)) out.push({ title: "Blind résumé screening", why: "School prestige and career gaps act as proxies for group membership. Hide them.", key: "blind" });
  if (!m.reweigh && p.prestigeWeight > 0.3) out.push({ title: "Reweigh training data", why: "The screening model learned from biased past hires. Reweighing samples reduces proxy reliance.", key: "reweigh" });
  if (!m.structured && p.reviewerBias > 0.1) out.push({ title: "Structured interviews", why: "Standard questions and rubrics cut reviewer noise and subjective penalties.", key: "structured" });
  if (!m.equalThreshold && met.disparateImpact < 0.8) out.push({ title: "Group-aware thresholds", why: "Post-processing equalizes selection rates. Check local law before using it.", key: "equalThreshold" });
  if (!out.length) out.push({ title: "Pipeline looks balanced", why: "Keep monitoring per-stage rates as new data comes in." });
  return out;
}
