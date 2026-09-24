import type { OfficeId, OfficeScope } from './office';

export interface OfficeRoutingRequest { message: string; scope: OfficeScope }
export interface OfficeRoutingRecommendation { ownerId: OfficeId; reviewerIds: OfficeId[]; reason: string; scope: OfficeScope }
export interface OfficeRoutingResult extends OfficeRoutingRecommendation { status: 'recommended'; version: string }
export const OFFICE_ROUTING_VERSION: string;
export function parseOfficeRoutingRequest(value: unknown): OfficeRoutingRequest;
export function parseOfficeRoutingRecommendation(value: unknown, request: OfficeRoutingRequest): OfficeRoutingRecommendation;
export function parseOfficeRoutingResult(value: unknown, request: OfficeRoutingRequest): OfficeRoutingResult;
