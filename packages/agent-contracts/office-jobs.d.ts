import type { OfficeId, OfficeMode } from './office';
export interface OfficeRoomJob { id: string; label: string; scope: 'personal' | 'classin' | null; ownerId: OfficeId; reviewerIds: OfficeId[]; mode: OfficeMode; template: string; placeholder: string; link?: undefined }
export interface OfficeLinkJob { id: string; label: string; link: string; hint: string }
export type OfficeJob = OfficeRoomJob | OfficeLinkJob;
export const OFFICE_JOB_TEMPLATES: Readonly<Record<string, string>>;
export const OFFICE_JOBS: readonly OfficeJob[];
export const OFFICE_ROOM_JOBS: readonly OfficeRoomJob[];
export const OFFICE_LINK_JOBS: readonly OfficeLinkJob[];
export function officeJobById(id: string): OfficeJob | null;
export function officeJobMatches(job: OfficeJob | null, session: { ownerId?: string; mode?: string; reviewers?: string[] } | null): boolean;
export function officeActiveJob(session: { ownerId?: string; mode?: string; reviewers?: string[] } | null): OfficeRoomJob | null;
export function officeJobPatch(job: OfficeRoomJob, draft?: string): { ownerId: OfficeId; reviewers: OfficeId[]; mode: OfficeMode; presetId: null; draft?: string };
