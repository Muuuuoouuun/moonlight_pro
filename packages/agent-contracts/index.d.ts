export type AgentScope = 'read' | 'tasks:write' | 'contact-outcomes:write' | 'jobs:read' | 'jobs:write';
export type AgentResourceName = 'tasks' | 'projects' | 'followups' | 'work-orders';
export type AgentDetail = 'summary' | 'rows' | 'full';
export interface AgentContext { workspaceId: string; actorId: string; scopes: AgentScope[] }
export interface AgentResource {
  table: string | null;
  fields: Record<string, string | null>;
  defaults: string[];
  textFields: string[];
  filters: Record<string, string[] | 'uuid' | 'date'>;
}
export interface AgentQuery {
  resource: AgentResourceName;
  detail: AgentDetail;
  limit: number;
  fields: string[];
  filters: Record<string, string | string[]>;
  cursor: string | null;
  fresh: boolean;
  order: string;
}
export interface AgentEntityQuery {
  resource: Exclude<AgentResourceName, 'followups'>;
  id: string;
  detail: AgentDetail;
  fields: string[];
  nextSectionCursor: string | null;
  fresh: boolean;
}
export const AGENT_SCHEMA_VERSION: '1.0';
export const AGENT_SCOPES: readonly AgentScope[];
export const AGENT_RESPONSE_LIMITS: Readonly<Record<AgentDetail, number>>;
export const AGENT_QUERY_ORDER: 'created_at.asc,id.asc';
export const AGENT_CURSOR_TTL_MS: number;
export const AGENT_RESOURCES: Readonly<Record<AgentResourceName, AgentResource>>;
export class AgentInputError extends Error { code: string; constructor(message: string, code?: string) }
export function isAgentUuid(value: unknown): value is string;
export function stableStringify(value: unknown): string;
export function agentHash(value: unknown): string;
export function parseAgentQuery(input: unknown): AgentQuery;
export function parseAgentEntityQuery(type: string, id: string, input?: unknown): AgentEntityQuery;
export function sealAgentCursor(payload: Record<string, unknown>, binding: unknown, secret: string, options?: { now?: number }): string;
export function openAgentCursor(token: string, binding: unknown, secret: string, options?: { now?: number }): Record<string, unknown>;
export function projectAgentCommandResponse(value: Record<string, unknown>, options?: { action?: string }): Record<string, unknown>;
