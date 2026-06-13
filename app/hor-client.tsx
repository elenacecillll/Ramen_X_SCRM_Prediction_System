"use client";

import { useMemo, useState } from "react";
import {
  computeArp,
  computeHor2,
  type ActionResult,
  type AgentArp,
} from "@/lib/hor/compute";
import { RELATION_VALUES, type HorDataset, type Matrix } from "@/lib/hor/types";

// Deep clone the correlation matrix so editing never mutates the server payload.
function cloneMatrix(m: Matrix): Matrix {
  const out: Matrix = {};
  for (const row of Object.keys(m)) out[row] = { ...m[row] };
  return out;
}

const fmtInt = (n: number) => n.toLocaleString("id-ID");
const fmtEtd = (n: number) =>
  n.toLocaleString("id-ID", { maximumFractionDigits: 2 });

function relationClass(v: number): string {
  if (v === 9) return "bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-200";
  if (v === 3)
    return "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-200";
  if (v === 1)
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200";
  return "text-zinc-300 dark:text-zinc-700";
}

function RankDelta({ delta }: { delta: number }) {
  if (delta === 0)
    return <span className="text-zinc-400" title="rank tetap">—</span>;
  if (delta > 0)
    return (
      <span className="text-emerald-600 dark:text-emerald-400" title={`naik ${delta} peringkat`}>
        ▲{delta}
      </span>
    );
  return (
    <span className="text-red-600 dark:text-red-400" title={`turun ${-delta} peringkat`}>
      ▼{-delta}
    </span>
  );
}

export default function HorClient({ dataset }: { dataset: HorDataset }) {
  const [hor1, setHor1] = useState<Matrix>(() => cloneMatrix(dataset.hor1));
  const [editMode, setEditMode] = useState(false);

  // Baseline pipeline from the untouched Excel data — used to show simulation deltas.
  const baseline = useMemo(() => {
    const arp = computeArp(dataset, dataset.hor1);
    const arpByAgent: Record<string, number> = {};
    for (const a of arp) arpByAgent[a.code] = a.arp;
    return { actions: computeHor2(dataset, arpByAgent) };
  }, [dataset]);

  const baselineRank = useMemo(() => {
    const m = new Map<string, { rank: number; etd: number }>();
    for (const a of baseline.actions) m.set(a.code, { rank: a.rank, etd: a.etd });
    return m;
  }, [baseline]);

  // Current pipeline — recomputed on every edit.
  const { arp, arpByAgent, actions } = useMemo(() => {
    const arp = computeArp(dataset, hor1);
    const arpByAgent: Record<string, number> = {};
    for (const a of arp) arpByAgent[a.code] = a.arp;
    const actions = computeHor2(dataset, arpByAgent);
    return { arp, arpByAgent, actions };
  }, [dataset, hor1]);

  const dirty = useMemo(() => {
    for (const e of dataset.events)
      for (const a of dataset.agents)
        if ((hor1[e.code]?.[a.code] ?? 0) !== (dataset.hor1[e.code]?.[a.code] ?? 0))
          return true;
    return false;
  }, [hor1, dataset]);

  function setCell(eventCode: string, agentCode: string, value: number) {
    setHor1((prev) => ({
      ...prev,
      [eventCode]: { ...prev[eventCode], [agentCode]: value },
    }));
  }

  function reset() {
    setHor1(cloneMatrix(dataset.hor1));
  }

  const severityByEvent = new Map(dataset.events.map((e) => [e.code, e.severity]));
  const arpRankByAgent = new Map(arp.map((a) => [a.code, a]));

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          HOR–MOORA · Analisis Risiko Rantai Pasok
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Ramen X — pipeline HOR fase 1 (ARP &amp; Pareto) → HOR fase 2 (ETDₖ).
          Edit matriks <em>Risk Event × Risk Agent</em> untuk mensimulasikan dampaknya
          terhadap prioritas tindakan mitigasi.
        </p>
      </header>

      {/* Toolbar */}
      <div className="sticky top-0 z-20 -mx-4 mb-8 flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 dark:border-zinc-800 dark:bg-zinc-950/90">
        <button
          onClick={() => {
            setEditMode((v) => !v);
            if (!editMode) {
              document
                .getElementById("hor1-section")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            editMode
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          }`}
        >
          {editMode ? "✓ Selesai mengedit" : "✎ Edit matriks risiko"}
        </button>
        <button
          onClick={reset}
          disabled={!dirty}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors enabled:hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:enabled:hover:bg-zinc-800"
        >
          ↺ Reset ke data Excel
        </button>
        {dirty && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            mode simulasi — nilai diubah dari Excel
          </span>
        )}
        {editMode && (
          <span className="text-xs text-zinc-500">
            Klik sel pada matriks HOR1 (nilai 0 / 1 / 3 / 9). Hasil ETDₖ otomatis dihitung ulang.
          </span>
        )}
      </div>

      {/* ============ OUTPUT: ETDk priority ranking ============ */}
      <section className="mb-10">
        <h2 className="mb-1 text-xl font-semibold">
          Prioritas Tindakan Mitigasi — Ranking ETDₖ
        </h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          ETDₖ = TEₖ / Dₖ. Semakin tinggi, semakin <em>cost-effective</em> tindakan mitigasinya.
        </p>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-zinc-50 text-left dark:bg-zinc-900">
                <th className="px-3 py-2 font-semibold">Rank</th>
                <th className="px-3 py-2 font-semibold">Δ</th>
                <th className="px-3 py-2 font-semibold">Kode</th>
                <th className="px-3 py-2 font-semibold">Tindakan Mitigasi (PA)</th>
                <th className="px-3 py-2 text-right font-semibold">TEₖ</th>
                <th className="px-3 py-2 text-right font-semibold">Dₖ</th>
                <th className="px-3 py-2 text-right font-semibold">ETDₖ</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((pa) => {
                const base = baselineRank.get(pa.code);
                const delta = base ? base.rank - pa.rank : 0;
                const top3 = pa.rank <= 3;
                return (
                  <tr
                    key={pa.code}
                    className={`border-t border-zinc-100 dark:border-zinc-800/70 ${
                      top3 ? "bg-emerald-50/60 dark:bg-emerald-950/30" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          top3
                            ? "bg-emerald-600 text-white"
                            : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {pa.rank}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs font-medium">
                      {dirty ? <RankDelta delta={delta} /> : null}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold">{pa.code}</td>
                    <td className="px-3 py-2">{pa.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(pa.te)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pa.difficulty}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {fmtEtd(pa.etd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ============ HOR1 editable correlation matrix ============ */}
      <section id="hor1-section" className="mb-10">
        <h2 className="mb-1 text-xl font-semibold">
          HOR Fase 1 — Matriks Risk Event × Risk Agent
        </h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Korelasi (Rᵢⱼ ∈ {"{0, 1, 3, 9}"}). ARPⱼ = Oⱼ × Σ(Sᵢ × Rᵢⱼ).
          {editMode ? " Mode edit aktif — ubah nilai sel di bawah." : ""}
        </p>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-900">
                <th className="sticky left-0 z-10 bg-zinc-50 px-2 py-2 text-left dark:bg-zinc-900">
                  Event
                </th>
                <th className="px-2 py-2 text-right">Sᵢ</th>
                {dataset.agents.map((a) => (
                  <th
                    key={a.code}
                    className="px-1.5 py-2 font-mono font-medium"
                    title={a.name}
                  >
                    {a.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataset.events.map((e) => (
                <tr key={e.code} className="border-t border-zinc-100 dark:border-zinc-800/70">
                  <th
                    className="sticky left-0 z-10 max-w-[180px] truncate bg-white px-2 py-1 text-left font-mono font-medium dark:bg-zinc-950"
                    title={`${e.code} — ${e.name}`}
                  >
                    {e.code}
                  </th>
                  <td className="px-2 py-1 text-right tabular-nums text-zinc-500">
                    {e.severity}
                  </td>
                  {dataset.agents.map((a) => {
                    const v = hor1[e.code]?.[a.code] ?? 0;
                    return (
                      <td key={a.code} className="p-0 text-center">
                        {editMode ? (
                          <select
                            value={v}
                            onChange={(ev) =>
                              setCell(e.code, a.code, Number(ev.target.value))
                            }
                            className={`h-7 w-9 cursor-pointer appearance-none rounded text-center text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500 ${relationClass(
                              v,
                            )}`}
                          >
                            {RELATION_VALUES.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`inline-flex h-7 w-9 items-center justify-center text-xs font-semibold ${relationClass(
                              v,
                            )}`}
                          >
                            {v === 0 ? "·" : v}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Oi row */}
              <tr className="border-t-2 border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                <th className="sticky left-0 z-10 bg-zinc-50 px-2 py-1 text-left dark:bg-zinc-900">
                  Oⱼ
                </th>
                <td />
                {dataset.agents.map((a) => (
                  <td key={a.code} className="px-1 py-1 text-center tabular-nums text-zinc-500">
                    {a.occurrence}
                  </td>
                ))}
              </tr>
              {/* ARP row */}
              <tr className="bg-zinc-50 dark:bg-zinc-900">
                <th className="sticky left-0 z-10 bg-zinc-50 px-2 py-1 text-left dark:bg-zinc-900">
                  ARPⱼ
                </th>
                <td />
                {dataset.agents.map((a) => (
                  <td
                    key={a.code}
                    className="px-1 py-1 text-center font-semibold tabular-nums"
                  >
                    {fmtInt(arpByAgent[a.code] ?? 0)}
                  </td>
                ))}
              </tr>
              {/* Rank row */}
              <tr className="bg-zinc-50 dark:bg-zinc-900">
                <th className="sticky left-0 z-10 bg-zinc-50 px-2 py-1 text-left dark:bg-zinc-900">
                  Rank
                </th>
                <td />
                {dataset.agents.map((a) => {
                  const info = arpRankByAgent.get(a.code);
                  return (
                    <td
                      key={a.code}
                      className={`px-1 py-1 text-center tabular-nums ${
                        info?.selected ? "font-bold text-emerald-600 dark:text-emerald-400" : "text-zinc-400"
                      }`}
                      title={info?.selected ? "Terpilih (Pareto)" : undefined}
                    >
                      {info?.rank}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Sₐ disorot hijau = 14 risk agent terpilih (Pareto) yang dibawa ke HOR fase 2.
          Catatan: set 14 agent ini tetap (fixed) saat simulasi.
        </p>
      </section>

      {/* ============ ARP ranking + Pareto ============ */}
      <ParetoSection arp={arp} />

      {/* ============ HOR2 matrix ============ */}
      <Hor2Section
        dataset={dataset}
        arpByAgent={arpByAgent}
        actions={actions}
      />
    </div>
  );
}

function ParetoSection({ arp }: { arp: AgentArp[] }) {
  return (
    <section className="mb-10">
      <h2 className="mb-1 text-xl font-semibold">
        HOR Fase 1 — Ranking ARP &amp; Pareto 80/20
      </h2>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Risk agent diurutkan dari ARP tertinggi. Baris hijau = terpilih sebagai prioritas
        (dibawa ke HOR fase 2).
      </p>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-50 text-left dark:bg-zinc-900">
              <th className="px-3 py-2 font-semibold">Rank</th>
              <th className="px-3 py-2 font-semibold">Agent</th>
              <th className="px-3 py-2 text-right font-semibold">ARPⱼ</th>
              <th className="px-3 py-2 text-right font-semibold">Kumulatif</th>
              <th className="px-3 py-2 text-right font-semibold">Kumulatif %</th>
              <th className="px-3 py-2 text-center font-semibold">Terpilih</th>
            </tr>
          </thead>
          <tbody>
            {arp.map((a) => (
              <tr
                key={a.code}
                className={`border-t border-zinc-100 dark:border-zinc-800/70 ${
                  a.selected ? "bg-emerald-50/60 dark:bg-emerald-950/30" : ""
                }`}
              >
                <td className="px-3 py-1.5 tabular-nums">{a.rank}</td>
                <td className="px-3 py-1.5 font-mono font-medium">{a.code}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtInt(a.arp)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">
                  {fmtInt(a.cumulative)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {(a.cumulativePct * 100).toFixed(2)}%
                </td>
                <td className="px-3 py-1.5 text-center">
                  {a.selected ? (
                    <span className="text-emerald-600 dark:text-emerald-400">●</span>
                  ) : (
                    <span className="text-zinc-300 dark:text-zinc-700">○</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Hor2Section({
  dataset,
  arpByAgent,
  actions,
}: {
  dataset: HorDataset;
  arpByAgent: Record<string, number>;
  actions: ActionResult[];
}) {
  // Display PAs in natural order (PA1..PA14) for the matrix columns.
  const byCode = new Map(actions.map((a) => [a.code, a]));
  return (
    <section className="mb-10">
      <h2 className="mb-1 text-xl font-semibold">
        HOR Fase 2 — Matriks Risk Agent × Preventive Action
      </h2>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Efektivitas (Eⱼₖ ∈ {"{0, 1, 3, 9}"}). TEₖ = Σ(ARPⱼ × Eⱼₖ); ETDₖ = TEₖ / Dₖ.
      </p>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="border-collapse text-xs">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-900">
              <th className="sticky left-0 z-10 bg-zinc-50 px-2 py-2 text-left dark:bg-zinc-900">
                Agent
              </th>
              <th className="px-2 py-2 text-right">ARPⱼ</th>
              {dataset.actions.map((pa) => (
                <th key={pa.code} className="px-1.5 py-2 font-mono" title={pa.name}>
                  {pa.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataset.selectedAgents.map((ag) => (
              <tr key={ag} className="border-t border-zinc-100 dark:border-zinc-800/70">
                <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-mono font-medium dark:bg-zinc-950">
                  {ag}
                </th>
                <td className="px-2 py-1 text-right tabular-nums text-zinc-500">
                  {fmtInt(arpByAgent[ag] ?? 0)}
                </td>
                {dataset.actions.map((pa) => {
                  const v = dataset.hor2[ag]?.[pa.code] ?? 0;
                  return (
                    <td
                      key={pa.code}
                      className={`px-1.5 py-1 text-center font-semibold ${relationClass(v)}`}
                    >
                      {v === 0 ? "·" : v}
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* TEk */}
            <tr className="border-t-2 border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
              <th className="sticky left-0 z-10 bg-zinc-50 px-2 py-1 text-left dark:bg-zinc-900">
                TEₖ
              </th>
              <td />
              {dataset.actions.map((pa) => (
                <td key={pa.code} className="px-1 py-1 text-center font-semibold tabular-nums">
                  {fmtInt(byCode.get(pa.code)?.te ?? 0)}
                </td>
              ))}
            </tr>
            {/* Dk */}
            <tr className="bg-zinc-50 dark:bg-zinc-900">
              <th className="sticky left-0 z-10 bg-zinc-50 px-2 py-1 text-left dark:bg-zinc-900">
                Dₖ
              </th>
              <td />
              {dataset.actions.map((pa) => (
                <td key={pa.code} className="px-1 py-1 text-center tabular-nums text-zinc-500">
                  {pa.difficulty}
                </td>
              ))}
            </tr>
            {/* ETDk */}
            <tr className="bg-zinc-50 dark:bg-zinc-900">
              <th className="sticky left-0 z-10 bg-zinc-50 px-2 py-1 text-left dark:bg-zinc-900">
                ETDₖ
              </th>
              <td />
              {dataset.actions.map((pa) => (
                <td key={pa.code} className="px-1 py-1 text-center font-semibold tabular-nums">
                  {fmtEtd(byCode.get(pa.code)?.etd ?? 0)}
                </td>
              ))}
            </tr>
            {/* Rank */}
            <tr className="bg-zinc-50 dark:bg-zinc-900">
              <th className="sticky left-0 z-10 bg-zinc-50 px-2 py-1 text-left dark:bg-zinc-900">
                Rankₖ
              </th>
              <td />
              {dataset.actions.map((pa) => (
                <td
                  key={pa.code}
                  className="px-1 py-1 text-center font-bold tabular-nums text-emerald-600 dark:text-emerald-400"
                >
                  {byCode.get(pa.code)?.rank}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
