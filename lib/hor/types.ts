// Domain types for the HOR (House of Risk) analysis pipeline.
// Stage 1 (HOR1): Risk Event x Risk Agent correlation -> ARP per agent -> Pareto selection.
// Stage 2 (HOR2): selected Risk Agent x Preventive Action effectiveness -> TEk -> ETDk ranking.

export interface RiskEvent {
  code: string; // e.g. "E1"
  name: string;
  process: string; // Plan / Source / Make / Deliver / Return
  severity: number; // Si (1-10)
}

export interface RiskAgent {
  code: string; // e.g. "A1"
  name: string;
  occurrence: number; // Oi (1-10)
}

export interface PreventiveAction {
  code: string; // e.g. "PA1"
  name: string;
  difficulty: number; // Dk (3,4,5)
}

// A relationship matrix keyed by [rowCode][colCode] holding correlation/effectiveness
// values from the set {0, 1, 3, 9}.
export type Matrix = Record<string, Record<string, number>>;

export interface HorDataset {
  events: RiskEvent[]; // E1..E22 in source order
  agents: RiskAgent[]; // A1..A24 in source order
  actions: PreventiveAction[]; // PA1..PA14 in source order
  // The 14 agents selected by Pareto in HOR1, in priority order. Kept FIXED across
  // edit/simulation because HOR2 effectiveness data only exists for these agents.
  selectedAgents: string[];
  hor1: Matrix; // [eventCode][agentCode] -> {0,1,3,9}
  hor2: Matrix; // [agentCode][paCode] -> {0,1,3,9}
}

export const RELATION_VALUES = [0, 1, 3, 9] as const;
