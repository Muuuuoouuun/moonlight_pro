import type { OfficeId, OfficeMode, OfficeScope } from './office';

export type OfficeWorkKind = 'schedule_plan' | 'weekly_summary' | 'customer_contact' | 'content_draft' | 'scope_definition' | 'tech_diagnosis' | 'cost_compare' | 'direction_choice' | 'risk_review';
export type OfficePacketExit = 'office' | 'task' | 'skill_request';
export type OfficePacketState = 'waiting' | 'ready' | 'done' | 'skipped';
export interface OfficeBreakdownRequest { message: string; scope: OfficeScope }
export interface OfficeWorkPacket {
  key: string; kind: OfficeWorkKind; scope: 'classin' | 'personal';
  ownerId: OfficeId; mode: OfficeMode; ownerSource: 'kind' | 'operator';
  ask: string; inputs: string[]; deliverable: string; doneWhen: string;
  dependsOn: string[]; reviewerIds: OfficeId[]; exit: OfficePacketExit;
}
export interface OfficeBreakdown { scope: OfficeScope; summary: string; decisionNeeded: string | null; packets: OfficeWorkPacket[]; holds: string[]; questions: string[] }
export interface OfficeBreakdownResult extends OfficeBreakdown { status: 'recommended'; version: string }
export interface OfficePacketRequest { ownerId: OfficeId; mode: OfficeMode; scope: 'classin' | 'personal'; message: string; participants: OfficeId[] }

export const OFFICE_HARNESS_VERSION: string;
export const OFFICE_BREAKDOWN_LIMITS: Readonly<Record<'agenda' | 'packets' | 'inputs' | 'holds' | 'questions' | 'reviewers' | 'packetMessage' | 'priorResult' | 'resultBytes', number>>;
export const OFFICE_WORK_KINDS: Readonly<Record<OfficeWorkKind, Readonly<{ ownerId: OfficeId; mode: OfficeMode; label: string }>>>;
export const OFFICE_WORK_KIND_IDS: readonly OfficeWorkKind[];
export const OFFICE_HANDOFFS: Readonly<Record<OfficeId, readonly OfficeId[]>>;
export const OFFICE_PACKET_EXITS: readonly OfficePacketExit[];
export const OFFICE_PACKET_STATES: readonly OfficePacketState[];
export function officeReviewerCandidates(ownerId: OfficeId): OfficeId[];
export function parseOfficeBreakdownRequest(value: unknown): OfficeBreakdownRequest;
export function parseOfficeBreakdownProposal(value: unknown, request: OfficeBreakdownRequest): OfficeBreakdown;
export function parseOfficeBreakdownResult(value: unknown, request: OfficeBreakdownRequest): OfficeBreakdownResult;
export function officeBreakdownResult(proposal: OfficeBreakdown): OfficeBreakdownResult;
export function withOfficePacketOwner<T extends OfficeBreakdown>(breakdown: T, key: string, ownerId: OfficeId): T;
export function officePacketStates(breakdown: OfficeBreakdown, marks?: Record<string, 'done' | 'skipped'>): Record<string, OfficePacketState>;
export function officePacketRequest(breakdown: OfficeBreakdown, key: string, options: { agenda: string; priorResults?: Record<string, string>; withReviewers?: boolean }): OfficePacketRequest;
