// Pure calculation functions for the HOR pipeline. No I/O — runs identically on the
// server (initial render) and the client (recompute after edits).

import type { HorDataset, Matrix } from "./types";

export interface AgentArp {
  code: string;
  occurrence: number; // Oi
  sumSR: number; // Σ(Si × Rij) over all events
  arp: number; // ARPj = Oi × Σ(Si × Rij)
  rank: number; // 1 = highest ARP
  cumulative: number; // running ARP total in rank order
  cumulativePct: number; // running share of total ARP (Pareto)
  selected: boolean; // part of the fixed HOR2 set
}

// ARPj = Oi × Σ(Si × Rij). Computed for every agent, then ranked descending so the
// Pareto cumulative can be displayed.
export function computeArp(ds: HorDataset, hor1: Matrix): AgentArp[] {
  const severityByEvent = new Map(ds.events.map((e) => [e.code, e.severity]));
  const selected = new Set(ds.selectedAgents);

  const base = ds.agents.map((a) => {
    let sumSR = 0;
    for (const e of ds.events) {
      const si = severityByEvent.get(e.code) ?? 0;
      const rij = hor1[e.code]?.[a.code] ?? 0;
      sumSR += si * rij;
    }
    return {
      code: a.code,
      occurrence: a.occurrence,
      sumSR,
      arp: a.occurrence * sumSR,
      selected: selected.has(a.code),
    };
  });

  const ranked = [...base].sort((x, y) => y.arp - x.arp);
  const total = ranked.reduce((s, r) => s + r.arp, 0);
  let running = 0;
  return ranked.map((r, i) => {
    running += r.arp;
    return {
      ...r,
      rank: i + 1,
      cumulative: running,
      cumulativePct: total > 0 ? running / total : 0,
    };
  });
}

export interface ActionContribution {
  agent: string;
  arp: number;
  effect: number; // Ejk
  product: number; // ARPj × Ejk
}

export interface ActionResult {
  code: string;
  name: string;
  difficulty: number; // Dk
  te: number; // TEk = Σ(ARPj × Ejk) over selected agents
  etd: number; // ETDk = TEk / Dk
  rank: number; // 1 = highest ETDk (top priority)
  contributions: ActionContribution[]; // non-zero terms, for the breakdown view
}

// TEk = Σ over selected agents (ARPj × Ejk); ETDk = TEk / Dk. Returned sorted by ETDk
// descending (rank 1 = highest priority mitigation).
export function computeHor2(
  ds: HorDataset,
  arpByAgent: Record<string, number>,
): ActionResult[] {
  const results = ds.actions.map((pa) => {
    let te = 0;
    const contributions: ActionContribution[] = [];
    for (const agent of ds.selectedAgents) {
      const effect = ds.hor2[agent]?.[pa.code] ?? 0;
      const arp = arpByAgent[agent] ?? 0;
      const product = arp * effect;
      te += product;
      if (effect > 0) contributions.push({ agent, arp, effect, product });
    }
    return {
      code: pa.code,
      name: pa.name,
      difficulty: pa.difficulty,
      te,
      etd: pa.difficulty > 0 ? te / pa.difficulty : 0,
      rank: 0,
      contributions,
    };
  });

  const sorted = results.sort((a, b) => b.etd - a.etd);
  sorted.forEach((r, i) => (r.rank = i + 1));
  return sorted;
}

// Convenience: run the full pipeline and return everything needed for display.
export function runPipeline(ds: HorDataset, hor1: Matrix) {
  const arp = computeArp(ds, hor1);
  const arpByAgent: Record<string, number> = {};
  for (const a of arp) arpByAgent[a.code] = a.arp;
  const actions = computeHor2(ds, arpByAgent);
  return { arp, arpByAgent, actions };
}
