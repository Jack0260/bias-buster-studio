import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { defaultParams, generate, interventions, noMit, run, type Mitigations, type Params } from "@/lib/sim";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hiring Bias Simulator: Model and Mitigate Recruitment Bias" },
      { name: "description", content: "Simulate bias in hiring pipelines with synthetic candidates, fairness metrics and mitigation strategies." },
      { property: "og:title", content: "Hiring Bias Simulator" },
      { property: "og:description", content: "Measure disparate impact and test fairness interventions on synthetic recruitment data." },
    ],
  }),
  component: Index,
});

const sliders: { k: keyof Params; label: string; min: number; max: number; step: number; hint: string }[] = [
  { k: "n", label: "Applicants", min: 200, max: 5000, step: 100, hint: "Synthetic pool size" },
  { k: "shareB", label: "Share of Group B", min: 0.1, max: 0.6, step: 0.05, hint: "Underrepresented group" },
  { k: "prestigeGap", label: "School access gap", min: 0, max: 1.5, step: 0.1, hint: "Historical access gap for B" },
  { k: "gapRate", label: "Extra career-gap rate", min: 0, max: 0.5, step: 0.05, hint: "e.g. caregiving" },
  { k: "prestigeWeight", label: "Screen relies on prestige", min: 0, max: 1.5, step: 0.1, hint: "Proxy feature weight" },
  { k: "reviewerBias", label: "Interviewer bias", min: 0, max: 1.2, step: 0.1, hint: "Score penalty for B" },
  { k: "cutoff", label: "Selectivity", min: 0.15, max: 0.6, step: 0.05, hint: "Pass rate per stage" },
];
const mits: { k: keyof Mitigations; label: string; desc: string }[] = [
  { k: "blind", label: "Blind screening", desc: "Hide school prestige and career gaps" },
  { k: "reweigh", label: "Reweighing", desc: "Pre-processing: reweigh biased training data" },
  { k: "structured", label: "Structured interviews", desc: "Rubric-based scoring, less noise" },
  { k: "equalThreshold", label: "Group-aware thresholds", desc: "Post-processing: equal selection rates" },
];
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function Index() {
  const [p, setP] = useState<Params>(defaultParams);
  const [m, setM] = useState<Mitigations>(noMit);
  const cands = useMemo(() => generate(p), [p]);
  const base = useMemo(() => run(cands, p, noMit), [cands, p]);
  const cur = useMemo(() => run(cands, p, m), [cands, p, m]);
  const tips = interventions(p, m, cur.metrics);
  const sample = cands.slice(0, 8);

  const stageData = cur.stages.slice(1).map((s) => ({ name: s.name, "Group A": +(s.rateA * 100).toFixed(1), "Group B": +(s.rateB * 100).toFixed(1) }));
  const compare = [
    { name: "Disparate impact", Baseline: +base.metrics.disparateImpact.toFixed(2), Mitigated: +cur.metrics.disparateImpact.toFixed(2) },
    { name: "TPR gap", Baseline: +base.metrics.equalOpp.toFixed(2), Mitigated: +cur.metrics.equalOpp.toFixed(2) },
    { name: "Hire precision", Baseline: +base.metrics.precision.toFixed(2), Mitigated: +cur.metrics.precision.toFixed(2) },
  ];
  const di = cur.metrics.disparateImpact;

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">Fairness lab · synthetic data</p>
          <h1 className="mt-3 font-display text-5xl leading-tight md:text-6xl">Hiring bias simulator</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Both groups have the same true skill. Bias comes in through proxy features and reviewers. Adjust the levers and see where candidates drop out.
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-8">
          <section>
            <h2 className="mb-4 font-display text-xl">Bias sources</h2>
            <div className="space-y-5">
              {sliders.map((s) => (
                <div key={s.k}>
                  <div className="flex justify-between text-sm"><span>{s.label}</span><span className="font-mono text-muted-foreground">{p[s.k]}</span></div>
                  <Slider className="mt-2" min={s.min} max={s.max} step={s.step} value={[p[s.k]]} onValueChange={([v]) => setP({ ...p, [s.k]: v })} />
                  <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setP({ ...p, seed: Math.floor(Math.random() * 1e6) })}>New synthetic dataset</Button>
            </div>
          </section>
          <section>
            <h2 className="mb-4 font-display text-xl">Mitigations</h2>
            <div className="space-y-4">
              {mits.map((x) => (
                <label key={x.k} className="flex cursor-pointer items-start justify-between gap-3">
                  <span><span className="block text-sm font-medium">{x.label}</span><span className="text-xs text-muted-foreground">{x.desc}</span></span>
                  <Switch checked={m[x.k]} onCheckedChange={(v) => setM({ ...m, [x.k]: v })} />
                </label>
              ))}
            </div>
          </section>
        </aside>

        <div className="space-y-8">
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
            <Metric label="Disparate impact" value={di.toFixed(2)} sub={di >= 0.8 ? "Passes 4/5 rule" : "Fails 4/5 rule"} bad={di < 0.8} />
            <Metric label="Parity difference" value={pct(cur.metrics.parityDiff)} sub="Hire rate A − B" bad={Math.abs(cur.metrics.parityDiff) > 0.02} />
            <Metric label="Equal opportunity gap" value={pct(cur.metrics.equalOpp)} sub="Qualified hire rate A − B" bad={Math.abs(cur.metrics.equalOpp) > 0.05} />
            <Metric label="Hires (A / B)" value={`${cur.metrics.hiredA} / ${cur.metrics.hiredB}`} sub={`${pct(cur.metrics.precision)} qualified`} />
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="font-display text-xl">Pass rate at each stage</h2>
            <p className="mb-4 text-sm text-muted-foreground">Share of each group that makes it through each step</p>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={stageData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis unit="%" stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
                  <Legend />
                  <Bar dataKey="Group A" fill="var(--group-a)" />
                  <Bar dataKey="Group B" fill="var(--group-b)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid gap-8 md:grid-cols-2">
            <section className="rounded-lg border border-border bg-card p-6">
              <h2 className="font-display text-xl">Funnel</h2>
              <div className="mt-4 space-y-3">
                {cur.stages.map((s) => {
                  const max = cur.stages[0].A + cur.stages[0].B;
                  return (
                    <div key={s.name}>
                      <div className="flex justify-between text-sm"><span>{s.name}</span><span className="font-mono text-muted-foreground">{s.A} / {s.B}</span></div>
                      <div className="mt-1 flex h-3 overflow-hidden rounded-sm bg-muted">
                        <div className="bg-group-a" style={{ width: `${(s.A / max) * 100}%` }} />
                        <div className="bg-group-b" style={{ width: `${(s.B / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="rounded-lg border border-border bg-card p-6">
              <h2 className="font-display text-xl">Before vs. after mitigation</h2>
              <div className="mt-4 h-56">
                <ResponsiveContainer>
                  <BarChart data={compare} layout="vertical">
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis type="category" dataKey="name" width={110} stroke="var(--muted-foreground)" fontSize={11} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
                    <Legend />
                    <Bar dataKey="Baseline" fill="var(--muted-foreground)" />
                    <Bar dataKey="Mitigated" fill="var(--success)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 font-display text-xl">Suggested interventions</h2>
            <ul className="divide-y divide-border">
              {tips.map((t) => (
                <li key={t.title} className="flex items-center justify-between gap-4 py-3">
                  <div><p className="font-medium">{t.title}</p><p className="text-sm text-muted-foreground">{t.why}</p></div>
                  {t.key && <Button size="sm" onClick={() => setM({ ...m, [t.key!]: true })}>Apply</Button>}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 font-display text-xl">Sample candidate profiles</h2>
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="py-2">ID</th><th>Group</th><th>True skill</th><th>Experience</th><th>Prestige</th><th>Career gap</th><th>Qualified</th></tr>
                </thead>
                <tbody>
                  {sample.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="py-2">#{c.id}</td>
                      <td className={c.group === "A" ? "text-group-a" : "text-group-b"}>{c.group}</td>
                      <td>{c.skill.toFixed(2)}</td><td>{c.experience.toFixed(2)}</td><td>{c.prestige.toFixed(2)}</td>
                      <td>{c.gap ? "yes" : "no"}</td><td>{c.qualified ? "✓" : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value, sub, bad }: { label: string; value: string; sub: string; bad?: boolean }) {
  return (
    <div className="bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
      <p className={`mt-1 text-xs ${bad ? "text-destructive" : "text-success"}`}>{sub}</p>
    </div>
  );
}
