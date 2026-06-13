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

// Graded blue intensity for correlation strength (0, 1, 3, 9).
function relationClass(v: number): string {
  if (v === 9) return "bg-[#0071e3] text-white";
  if (v === 3) return "bg-[#0071e3]/15 text-[#0071e3] dark:bg-[#0a84ff]/25 dark:text-[#5eabff]";
  if (v === 1) return "bg-[#0071e3]/[0.07] text-[#0071e3]/80 dark:bg-[#0a84ff]/10 dark:text-[#5eabff]/90";
  return "text-black/15 dark:text-white/15";
}

function ArrowUp() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden className="shrink-0">
      <path d="M4 1 L7.2 6.5 L0.8 6.5 Z" fill="currentColor" />
    </svg>
  );
}

function ArrowDown() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden className="shrink-0">
      <path d="M4 7 L0.8 1.5 L7.2 1.5 Z" fill="currentColor" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="inline-block">
      <path
        d="M2.5 7.5 L5.5 10.5 L11.5 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RankDelta({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums ${
        up ? "text-[#34c759]" : "text-[#ff3b30]"
      }`}
      title={up ? `naik ${delta} peringkat` : `turun ${-delta} peringkat`}
    >
      {up ? <ArrowUp /> : <ArrowDown />}
      {Math.abs(delta)}
    </span>
  );
}

// Reusable styled containers tuned to an Apple-like aesthetic.
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] dark:border-white/10 dark:bg-[#1c1c1e]">
      {children}
    </div>
  );
}

function SectionHead({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0071e3] dark:text-[#5eabff]">
        {eyebrow}
      </p>
      <h2 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.02em]">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[#6e6e73] dark:text-[#98989d]">
        {desc}
      </p>
    </div>
  );
}

const thBase =
  "px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b] dark:text-[#8d8d92]";

// Severity (Si) and Occurrence (Oi) are scored on a 1 to 10 scale.
const SCALE_VALUES = Array.from({ length: 10 }, (_, i) => i + 1);

function ScaleSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-7 w-11 cursor-pointer appearance-none rounded-md bg-[#0071e3]/[0.07] text-center text-[12px] font-semibold text-[#0071e3] outline-none transition-colors focus:ring-2 focus:ring-[#0071e3] dark:bg-[#0a84ff]/10 dark:text-[#5eabff]"
    >
      {SCALE_VALUES.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

export default function HorClient({ dataset }: { dataset: HorDataset }) {
  const [hor1, setHor1] = useState<Matrix>(() => cloneMatrix(dataset.hor1));
  const [severity, setSeverity] = useState<Record<string, number>>(() =>
    Object.fromEntries(dataset.events.map((e) => [e.code, e.severity])),
  );
  const [occurrence, setOccurrence] = useState<Record<string, number>>(() =>
    Object.fromEntries(dataset.agents.map((a) => [a.code, a.occurrence])),
  );
  const [editMode, setEditMode] = useState(false);

  // Dataset with the edited Si / Oi values folded in, used for all calculations.
  const effectiveDataset = useMemo<HorDataset>(
    () => ({
      ...dataset,
      events: dataset.events.map((e) => ({
        ...e,
        severity: severity[e.code] ?? e.severity,
      })),
      agents: dataset.agents.map((a) => ({
        ...a,
        occurrence: occurrence[a.code] ?? a.occurrence,
      })),
    }),
    [dataset, severity, occurrence],
  );

  // Baseline pipeline from the untouched Excel data, used to show simulation deltas.
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

  // Current pipeline, recomputed on every edit.
  const { arp, arpByAgent, actions } = useMemo(() => {
    const arp = computeArp(effectiveDataset, hor1);
    const arpByAgent: Record<string, number> = {};
    for (const a of arp) arpByAgent[a.code] = a.arp;
    const actions = computeHor2(effectiveDataset, arpByAgent);
    return { arp, arpByAgent, actions };
  }, [effectiveDataset, hor1]);

  const dirty = useMemo(() => {
    for (const e of dataset.events) {
      if ((severity[e.code] ?? e.severity) !== e.severity) return true;
      for (const a of dataset.agents)
        if ((hor1[e.code]?.[a.code] ?? 0) !== (dataset.hor1[e.code]?.[a.code] ?? 0))
          return true;
    }
    for (const a of dataset.agents)
      if ((occurrence[a.code] ?? a.occurrence) !== a.occurrence) return true;
    return false;
  }, [hor1, severity, occurrence, dataset]);

  function setCell(eventCode: string, agentCode: string, value: number) {
    setHor1((prev) => ({
      ...prev,
      [eventCode]: { ...prev[eventCode], [agentCode]: value },
    }));
  }

  function reset() {
    setHor1(cloneMatrix(dataset.hor1));
    setSeverity(Object.fromEntries(dataset.events.map((e) => [e.code, e.severity])));
    setOccurrence(
      Object.fromEntries(dataset.agents.map((a) => [a.code, a.occurrence])),
    );
  }

  const arpRankByAgent = new Map(arp.map((a) => [a.code, a]));
  const maxEtd = Math.max(1, ...actions.map((a) => a.etd));

  return (
    <div>
      {/* Toolbar */}
      <div className="sticky top-0 z-30 border-b border-black/[0.06] bg-[#f5f5f7]/80 backdrop-blur-xl dark:border-white/10 dark:bg-black/70">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-3 px-6 py-3.5 sm:px-10">
          <span className="mr-auto text-[15px] font-semibold tracking-[-0.01em]">
            HOR-MOORA
            <span className="ml-2 font-normal text-[#86868b]">Ramen X</span>
          </span>
          {dirty && (
            <span className="rounded-full bg-[#0071e3]/10 px-3 py-1 text-[12px] font-medium text-[#0071e3] dark:text-[#5eabff]">
              Mode simulasi
            </span>
          )}
          <button
            onClick={reset}
            disabled={!dirty}
            className="rounded-full px-4 py-2 text-[14px] font-medium text-[#0071e3] transition-colors enabled:hover:bg-[#0071e3]/[0.08] disabled:opacity-30 dark:text-[#5eabff]"
          >
            Reset
          </button>
          <button
            onClick={() => {
              const next = !editMode;
              setEditMode(next);
              if (next) {
                document
                  .getElementById("hor1-section")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
            className="rounded-full bg-[#0071e3] px-5 py-2 text-[14px] font-medium text-white transition-colors hover:bg-[#0077ed] active:bg-[#006edb]"
          >
            {editMode ? "Selesai" : "Edit matriks risiko"}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1320px] px-6 sm:px-10">
        {/* Hero */}
        <header className="py-14 sm:py-20">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#0071e3] dark:text-[#5eabff]">
            House of Risk
          </p>
          <h1 className="mt-3 text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[56px]">
            Prioritas mitigasi risiko
            <br />
            rantai pasok Ramen X.
          </h1>
          <p className="mt-5 max-w-2xl text-[19px] leading-relaxed text-[#6e6e73] dark:text-[#98989d]">
            Dihitung otomatis dari data penilaian, mulai dari ARP dan seleksi Pareto pada
            fase 1 hingga rasio ETDk pada fase 2. Ubah matriks Risk Event terhadap Risk
            Agent untuk melihat bagaimana urutan prioritas tindakan bergeser.
          </p>
        </header>

        {/* OUTPUT: ETDk ranking */}
        <section className="pb-16">
          <SectionHead
            eyebrow="Output"
            title="Peringkat tindakan mitigasi"
            desc={
              <>
                ETDk sama dengan TEk dibagi Dk. Semakin tinggi nilainya, semakin efektif
                tindakan dalam menangani risiko relatif terhadap tingkat kesulitannya.
              </>
            }
          />
          <Card>
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-black/[0.06] text-left dark:border-white/10">
                  <th className={thBase}>Rank</th>
                  <th className={thBase}>Kode</th>
                  <th className={thBase}>Tindakan mitigasi</th>
                  <th className={`${thBase} text-right`}>TEk</th>
                  <th className={`${thBase} text-right`}>Dk</th>
                  <th className={`${thBase} text-right`}>ETDk</th>
                  <th className={`${thBase} w-40`}>&nbsp;</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05] dark:divide-white/[0.07]">
                {actions.map((pa) => {
                  const base = baselineRank.get(pa.code);
                  const delta = base ? base.rank - pa.rank : 0;
                  const top3 = pa.rank <= 3;
                  return (
                    <tr
                      key={pa.code}
                      className="transition-colors hover:bg-black/[0.015] dark:hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums ${
                            top3
                              ? "bg-[#0071e3] text-white"
                              : "bg-black/[0.06] text-[#1d1d1f] dark:bg-white/10 dark:text-[#f5f5f7]"
                          }`}
                        >
                          {pa.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[13px] font-semibold text-[#86868b]">
                        {pa.code}
                      </td>
                      <td className="px-4 py-3.5 font-medium">{pa.name}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-[#6e6e73] dark:text-[#98989d]">
                        {fmtInt(pa.te)}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-[#6e6e73] dark:text-[#98989d]">
                        {pa.difficulty}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[15px] font-semibold tabular-nums">
                        {fmtEtd(pa.etd)}
                      </td>
                      <td className="py-3.5 pr-5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
                            <div
                              className={`h-full rounded-full ${
                                top3 ? "bg-[#0071e3]" : "bg-[#86868b]/60"
                              }`}
                              style={{ width: `${(pa.etd / maxEtd) * 100}%` }}
                            />
                          </div>
                          {dirty && <RankDelta delta={delta} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>

        {/* HOR1 editable matrix */}
        <section id="hor1-section" className="scroll-mt-20 pb-16">
          <SectionHead
            eyebrow="Fase 1"
            title="Matriks Risk Event terhadap Risk Agent"
            desc={
              <>
                Nilai korelasi Rij dipilih dari himpunan 0, 1, 3, dan 9. ARPj sama dengan Oj
                dikali jumlah dari Si dikali Rij. Severity Si dan occurrence Oj dinilai pada
                skala 1 sampai 10.
                {editMode
                  ? " Mode edit aktif, ubah sel korelasi, kolom Si, maupun baris Oj."
                  : " Ketuk Edit matriks risiko untuk mulai menyunting."}
              </>
            }
          />
          <Card>
            <div className="overflow-x-auto">
              <table className="border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-black/[0.06] dark:border-white/10">
                    <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b] dark:bg-[#1c1c1e]">
                      Event
                    </th>
                    <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
                      Si
                    </th>
                    {dataset.agents.map((a) => (
                      <th
                        key={a.code}
                        className="px-1.5 py-3 font-mono text-[11px] font-medium text-[#86868b]"
                        title={a.name}
                      >
                        {a.code}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataset.events.map((e) => (
                    <tr
                      key={e.code}
                      className="border-t border-black/[0.04] dark:border-white/[0.06]"
                    >
                      <th
                        className="sticky left-0 z-10 bg-white px-4 py-1.5 text-left font-mono text-[12px] font-medium dark:bg-[#1c1c1e]"
                        title={`${e.code}. ${e.name}`}
                      >
                        {e.code}
                      </th>
                      <td className="px-3 py-1 text-center tabular-nums text-[#86868b]">
                        {editMode ? (
                          <ScaleSelect
                            value={severity[e.code] ?? e.severity}
                            onChange={(v) =>
                              setSeverity((prev) => ({ ...prev, [e.code]: v }))
                            }
                          />
                        ) : (
                          (severity[e.code] ?? e.severity)
                        )}
                      </td>
                      {dataset.agents.map((a) => {
                        const v = hor1[e.code]?.[a.code] ?? 0;
                        return (
                          <td key={a.code} className="p-0.5 text-center">
                            {editMode ? (
                              <select
                                value={v}
                                onChange={(ev) =>
                                  setCell(e.code, a.code, Number(ev.target.value))
                                }
                                className={`h-7 w-9 cursor-pointer appearance-none rounded-md text-center text-[12px] font-semibold outline-none transition-colors focus:ring-2 focus:ring-[#0071e3] ${relationClass(
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
                                className={`inline-flex h-7 w-9 items-center justify-center rounded-md text-[12px] font-semibold ${relationClass(
                                  v,
                                )}`}
                              >
                                {v === 0 ? "" : v}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-t border-black/[0.08] bg-black/[0.015] dark:border-white/10 dark:bg-white/[0.03]">
                    <th className="sticky left-0 z-10 bg-[#fafafa] px-4 py-1.5 text-left text-[12px] font-semibold dark:bg-[#222]">
                      Oj
                    </th>
                    <td />
                    {dataset.agents.map((a) => (
                      <td
                        key={a.code}
                        className="px-1 py-1 text-center tabular-nums text-[#86868b]"
                      >
                        {editMode ? (
                          <ScaleSelect
                            value={occurrence[a.code] ?? a.occurrence}
                            onChange={(v) =>
                              setOccurrence((prev) => ({ ...prev, [a.code]: v }))
                            }
                          />
                        ) : (
                          (occurrence[a.code] ?? a.occurrence)
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-black/[0.015] dark:bg-white/[0.03]">
                    <th className="sticky left-0 z-10 bg-[#fafafa] px-4 py-1.5 text-left text-[12px] font-semibold dark:bg-[#222]">
                      ARPj
                    </th>
                    <td />
                    {dataset.agents.map((a) => (
                      <td
                        key={a.code}
                        className="px-1 py-1.5 text-center text-[12px] font-semibold tabular-nums"
                      >
                        {fmtInt(arpByAgent[a.code] ?? 0)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-black/[0.015] dark:bg-white/[0.03]">
                    <th className="sticky left-0 z-10 bg-[#fafafa] px-4 py-1.5 text-left text-[12px] font-semibold dark:bg-[#222]">
                      Rank
                    </th>
                    <td />
                    {dataset.agents.map((a) => {
                      const info = arpRankByAgent.get(a.code);
                      return (
                        <td
                          key={a.code}
                          className={`px-1 py-1.5 text-center tabular-nums ${
                            info?.selected
                              ? "font-semibold text-[#0071e3] dark:text-[#5eabff]"
                              : "text-[#86868b]/60"
                          }`}
                          title={info?.selected ? "Terpilih oleh Pareto" : undefined}
                        >
                          {info?.rank}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="border-t border-black/[0.06] px-4 py-3 text-[12px] text-[#86868b] dark:border-white/10">
              Peringkat berwarna biru menandai 14 risk agent terpilih oleh Pareto yang
              dibawa ke fase 2. Himpunan 14 agent ini tetap selama simulasi.
            </p>
          </Card>
        </section>

        {/* ARP ranking + Pareto */}
        <ParetoSection arp={arp} />

        {/* HOR2 matrix */}
        <Hor2Section dataset={dataset} arpByAgent={arpByAgent} actions={actions} />

        <footer className="border-t border-black/[0.06] py-10 text-[12px] text-[#86868b] dark:border-white/10">
          Sumber data dibaca langsung dari berkas penilaian Excel. Seluruh nilai turunan
          dihitung ulang secara langsung di peramban.
        </footer>
      </div>
    </div>
  );
}

function ParetoSection({ arp }: { arp: AgentArp[] }) {
  return (
    <section className="pb-16">
      <SectionHead
        eyebrow="Fase 1"
        title="Peringkat ARP dan Pareto"
        desc="Risk agent diurutkan dari ARP tertinggi. Baris bertanda biru terpilih sebagai prioritas dan dibawa ke fase 2."
      />
      <Card>
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-black/[0.06] text-left dark:border-white/10">
              <th className={thBase}>Rank</th>
              <th className={thBase}>Agent</th>
              <th className={`${thBase} text-right`}>ARPj</th>
              <th className={`${thBase} text-right`}>Kumulatif</th>
              <th className={`${thBase} text-right`}>Kumulatif persen</th>
              <th className={`${thBase} text-center`}>Terpilih</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.05] dark:divide-white/[0.07]">
            {arp.map((a) => (
              <tr
                key={a.code}
                className={`transition-colors hover:bg-black/[0.015] dark:hover:bg-white/[0.03] ${
                  a.selected ? "bg-[#0071e3]/[0.04]" : ""
                }`}
              >
                <td className="px-4 py-2.5 tabular-nums text-[#6e6e73] dark:text-[#98989d]">
                  {a.rank}
                </td>
                <td className="px-4 py-2.5 font-mono font-medium">{a.code}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                  {fmtInt(a.arp)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-[#86868b]">
                  {fmtInt(a.cumulative)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-[#6e6e73] dark:text-[#98989d]">
                  {(a.cumulativePct * 100).toFixed(2)} persen
                </td>
                <td className="px-4 py-2.5 text-center">
                  {a.selected ? (
                    <span className="text-[#0071e3] dark:text-[#5eabff]">
                      <Check />
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
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
  const byCode = new Map(actions.map((a) => [a.code, a]));
  return (
    <section className="pb-16">
      <SectionHead
        eyebrow="Fase 2"
        title="Matriks Risk Agent terhadap Preventive Action"
        desc="Nilai efektivitas Ejk dipilih dari himpunan 0, 1, 3, dan 9. TEk sama dengan jumlah dari ARPj dikali Ejk, lalu ETDk sama dengan TEk dibagi Dk."
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-black/[0.06] dark:border-white/10">
                <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b] dark:bg-[#1c1c1e]">
                  Agent
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
                  ARPj
                </th>
                {dataset.actions.map((pa) => (
                  <th
                    key={pa.code}
                    className="px-1.5 py-3 font-mono text-[11px] font-medium text-[#86868b]"
                    title={pa.name}
                  >
                    {pa.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataset.selectedAgents.map((ag) => (
                <tr
                  key={ag}
                  className="border-t border-black/[0.04] dark:border-white/[0.06]"
                >
                  <th className="sticky left-0 z-10 bg-white px-4 py-1.5 text-left font-mono text-[12px] font-medium dark:bg-[#1c1c1e]">
                    {ag}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[#86868b]">
                    {fmtInt(arpByAgent[ag] ?? 0)}
                  </td>
                  {dataset.actions.map((pa) => {
                    const v = dataset.hor2[ag]?.[pa.code] ?? 0;
                    return (
                      <td key={pa.code} className="p-0.5 text-center">
                        <span
                          className={`inline-flex h-7 w-9 items-center justify-center rounded-md font-semibold ${relationClass(
                            v,
                          )}`}
                        >
                          {v === 0 ? "" : v}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t border-black/[0.08] bg-black/[0.015] dark:border-white/10 dark:bg-white/[0.03]">
                <th className="sticky left-0 z-10 bg-[#fafafa] px-4 py-1.5 text-left text-[12px] font-semibold dark:bg-[#222]">
                  TEk
                </th>
                <td />
                {dataset.actions.map((pa) => (
                  <td
                    key={pa.code}
                    className="px-1 py-1.5 text-center text-[12px] font-semibold tabular-nums"
                  >
                    {fmtInt(byCode.get(pa.code)?.te ?? 0)}
                  </td>
                ))}
              </tr>
              <tr className="bg-black/[0.015] dark:bg-white/[0.03]">
                <th className="sticky left-0 z-10 bg-[#fafafa] px-4 py-1.5 text-left text-[12px] font-semibold dark:bg-[#222]">
                  Dk
                </th>
                <td />
                {dataset.actions.map((pa) => (
                  <td
                    key={pa.code}
                    className="px-1 py-1.5 text-center tabular-nums text-[#86868b]"
                  >
                    {pa.difficulty}
                  </td>
                ))}
              </tr>
              <tr className="bg-black/[0.015] dark:bg-white/[0.03]">
                <th className="sticky left-0 z-10 bg-[#fafafa] px-4 py-1.5 text-left text-[12px] font-semibold dark:bg-[#222]">
                  ETDk
                </th>
                <td />
                {dataset.actions.map((pa) => (
                  <td
                    key={pa.code}
                    className="px-1 py-1.5 text-center text-[12px] font-semibold tabular-nums"
                  >
                    {fmtEtd(byCode.get(pa.code)?.etd ?? 0)}
                  </td>
                ))}
              </tr>
              <tr className="bg-black/[0.015] dark:bg-white/[0.03]">
                <th className="sticky left-0 z-10 bg-[#fafafa] px-4 py-1.5 text-left text-[12px] font-semibold dark:bg-[#222]">
                  Rank
                </th>
                <td />
                {dataset.actions.map((pa) => (
                  <td
                    key={pa.code}
                    className="px-1 py-1.5 text-center text-[12px] font-semibold tabular-nums text-[#0071e3] dark:text-[#5eabff]"
                  >
                    {byCode.get(pa.code)?.rank}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
