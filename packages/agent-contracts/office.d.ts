export type OfficeAgentId =
  | 'eevee'
  | 'vaporeon'
  | 'jolteon'
  | 'flareon'
  | 'espeon'
  | 'umbreon'
  | 'leafeon'
  | 'glaceon'
  | 'sylveon';

export type OfficeMode = 'chat' | 'task' | 'critique' | 'council';

export interface OfficeAgentMeta {
  id: OfficeAgentId;
  nameKo: string;
  nameEn: string;
  role: string;
  roleKey: string;
  domain: string;
  tagline: string;
  focus: string;
  boundary: string;
  resultFocus: string;
  directionFocus: string;
  decisionRubric: string;
  tensionWith: readonly OfficeAgentId[];
}

export type OfficeGate = 'PASS' | 'REVISE' | 'REJECT';

export interface OfficeHarshPenalty {
  reason: string;
  points: number;
}

export interface OfficeHarshRubric {
  metric: string;
  passingThreshold: number;
  criticalGate: boolean;
  penalties: readonly OfficeHarshPenalty[];
}

export interface OfficeChatInput {
  agentId?: OfficeAgentId;
  mode?: OfficeMode;
  message?: string;
  draft?: string | null;
  participants?: OfficeAgentId[];
  lens?: string | null;
  context?: Record<string, unknown> | null;
  evaluate?: boolean;
}

export interface SanitizedOfficeChatInput {
  agentId: OfficeAgentId;
  mode: OfficeMode;
  message: string;
  draft: string | null;
  participants: OfficeAgentId[];
  lens: string | null;
  context: Record<string, unknown> | null;
  evaluate: boolean;
}

export declare class OfficeContractError extends Error {
  code: string;
  constructor(message: string, code?: string);
}

export declare const OFFICE_MODES: readonly OfficeMode[];
export declare const OFFICE_GATES: readonly OfficeGate[];
export declare const OFFICE_HARSH_RUBRICS: Readonly<Record<OfficeAgentId, OfficeHarshRubric>>;
export declare const OFFICE_AGENTS: Readonly<Record<OfficeAgentId, OfficeAgentMeta>>;
export declare const OFFICE_AGENT_IDS: readonly OfficeAgentId[];

export declare function isOfficeAgentId(id: unknown): id is OfficeAgentId;
export declare function isOfficeMode(mode: unknown): mode is OfficeMode;
export declare function parseOfficeChatInput(input: unknown): SanitizedOfficeChatInput;
