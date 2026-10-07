import type { OfficeId, OfficeScope } from './office';

export interface OfficeRoutingRequest { message: string; scope: OfficeScope }
export interface OfficeRoutingPlan { ownerDeliverable: string; reviews: { reviewerId: OfficeId; question: string }[] }
export interface OfficeRoutingRecommendation { ownerId: OfficeId; reviewerIds: OfficeId[]; reason: string; scope: OfficeScope; plan: OfficeRoutingPlan }
export interface OfficeRoutingCurrentResult extends OfficeRoutingRecommendation { status: 'recommended'; version: '2026-10-04.v2' }
export interface OfficeRoutingLegacyResult extends Omit<OfficeRoutingRecommendation, 'plan'> { status: 'recommended'; version: '2026-09-24.v1' }
export type OfficeRoutingResult = OfficeRoutingCurrentResult | OfficeRoutingLegacyResult;
export const OFFICE_ROUTING_VERSION: '2026-10-04.v2';
export function parseOfficeRoutingRequest(value: unknown): OfficeRoutingRequest;
export function parseOfficeRoutingRecommendation(value: unknown, request: OfficeRoutingRequest): OfficeRoutingRecommendation;
export function parseOfficeRoutingResult(value: unknown, request: OfficeRoutingRequest): OfficeRoutingResult;
