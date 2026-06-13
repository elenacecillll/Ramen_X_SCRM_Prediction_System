import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type {
  HorDataset,
  Matrix,
  PreventiveAction,
  RiskAgent,
  RiskEvent,
} from "./types";

const WORKBOOK_FILE = "penilaian severity, occurence, dan HOR model 1.xlsx";

type Sheet = XLSX.WorkSheet;

function cell(ws: Sheet, r: number, c: number): unknown {
  const ref = XLSX.utils.encode_cell({ r, c });
  return ws[ref]?.v ?? null;
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Cell-index constants confirmed against the workbook (all 0-indexed).
const HOR1 = {
  agentHeaderRow: 8, // A1..A24 codes
  agentColStart: 2,
  agentCount: 24,
  eventRowStart: 9, // E1..E22
  eventCount: 22,
  eventCodeCol: 1,
  severityCol: 26, // Si
};

const HOR2 = {
  paHeaderRow: 2, // PA1..PA14 codes
  paColStart: 2,
  paCount: 14,
  agentRowStart: 3, // 14 selected agents in priority order
  agentCount: 14,
  agentCodeCol: 1,
  difficultyRow: 18, // Dk
  nameKodeCol: 18, // side table: PA code
  nameTextCol: 19, // side table: PA full name
  nameRowStart: 2,
};

export function loadDataset(): HorDataset {
  // Read the bytes ourselves via node:fs rather than XLSX.readFile, whose internal
  // fs detection is stubbed out in the bundled server runtime.
  const filePath = path.join(process.cwd(), "public", WORKBOOK_FILE);
  const buffer = readFileSync(filePath);
  const wb = XLSX.read(buffer, { type: "buffer" });

  const eventsSheet = wb.Sheets["Risk Events (done isi)"];
  const agentsSheet = wb.Sheets["Risk Agents (done isi)"];
  const hor1Sheet = wb.Sheets["HOR1 Model"];
  const hor2Sheet = wb.Sheets["HOR2 Model"];
  if (!eventsSheet || !agentsSheet || !hor1Sheet || !hor2Sheet) {
    throw new Error("Workbook is missing one or more required sheets.");
  }

  // --- Risk Events (Si + names + process) ---
  // Sheet layout: header at row 4 (0-idx 3), data rows 5..26 (0-idx 4..25).
  const events: RiskEvent[] = [];
  let currentProcess = "";
  for (let i = 0; i < HOR1.eventCount; i++) {
    const r = 4 + i;
    const proc = str(cell(eventsSheet, r, 0));
    if (proc) currentProcess = proc;
    events.push({
      code: str(cell(eventsSheet, r, 2)),
      name: str(cell(eventsSheet, r, 1)),
      process: currentProcess,
      severity: num(cell(eventsSheet, r, 3)),
    });
  }

  // --- Risk Agents (Oi + names) ---
  // Header at row 4 (0-idx 3), data rows 5..28 (0-idx 4..27).
  const agents: RiskAgent[] = [];
  for (let i = 0; i < HOR1.agentCount; i++) {
    const r = 4 + i;
    agents.push({
      code: str(cell(agentsSheet, r, 2)),
      name: str(cell(agentsSheet, r, 0)),
      occurrence: num(cell(agentsSheet, r, 3)),
    });
  }

  // --- HOR1 correlation matrix [event][agent] ---
  const agentCodes: string[] = [];
  for (let c = 0; c < HOR1.agentCount; c++) {
    agentCodes.push(str(cell(hor1Sheet, HOR1.agentHeaderRow, HOR1.agentColStart + c)));
  }
  const hor1: Matrix = {};
  for (let i = 0; i < HOR1.eventCount; i++) {
    const r = HOR1.eventRowStart + i;
    const eventCode = str(cell(hor1Sheet, r, HOR1.eventCodeCol));
    const row: Record<string, number> = {};
    for (let c = 0; c < HOR1.agentCount; c++) {
      row[agentCodes[c]] = num(cell(hor1Sheet, r, HOR1.agentColStart + c));
    }
    hor1[eventCode] = row;
  }

  // --- HOR2 effectiveness matrix [agent][PA] + selected agents + Dk + PA names ---
  const paCodes: string[] = [];
  for (let c = 0; c < HOR2.paCount; c++) {
    paCodes.push(str(cell(hor2Sheet, HOR2.paHeaderRow, HOR2.paColStart + c)));
  }

  // PA full names live in a side table keyed by code (ordered by rank, not by number).
  const paNames = new Map<string, string>();
  for (let i = 0; i < HOR2.paCount; i++) {
    const r = HOR2.nameRowStart + i;
    const code = str(cell(hor2Sheet, r, HOR2.nameKodeCol));
    const name = str(cell(hor2Sheet, r, HOR2.nameTextCol));
    if (code) paNames.set(code, name);
  }

  const difficultyByPa = new Map<string, number>();
  for (let c = 0; c < HOR2.paCount; c++) {
    difficultyByPa.set(paCodes[c], num(cell(hor2Sheet, HOR2.difficultyRow, HOR2.paColStart + c)));
  }

  const actions: PreventiveAction[] = paCodes.map((code) => ({
    code,
    name: paNames.get(code) ?? code,
    difficulty: difficultyByPa.get(code) ?? 0,
  }));

  const selectedAgents: string[] = [];
  const hor2: Matrix = {};
  for (let i = 0; i < HOR2.agentCount; i++) {
    const r = HOR2.agentRowStart + i;
    const agentCode = str(cell(hor2Sheet, r, HOR2.agentCodeCol));
    selectedAgents.push(agentCode);
    const row: Record<string, number> = {};
    for (let c = 0; c < HOR2.paCount; c++) {
      row[paCodes[c]] = num(cell(hor2Sheet, r, HOR2.paColStart + c));
    }
    hor2[agentCode] = row;
  }

  return { events, agents, actions, selectedAgents, hor1, hor2 };
}
