export type OfficeId = 'eevee'|'vaporeon'|'jolteon'|'flareon'|'espeon'|'umbreon'|'leafeon'|'glaceon'|'sylveon';
export type OfficeMode = 'chat'|'draft'|'review'|'council';
export type OfficeScope = 'all'|'classin'|'personal';
export interface OfficeRequest {ownerId:OfficeId;mode:OfficeMode;scope:OfficeScope;message:string;participants:OfficeId[];lens:null;history:{role:'user'|'assistant';text:string}[];includeProjects:boolean}
export interface OfficeAnswer {answer:string;nextAction:string;recommendation?:string;evidence?:string[];dissent?:string[]}
export interface OfficeContext {source:'provided'|'live'|'partial'|'preview'|'error';scope:OfficeScope;projects:{id:string;name:string;status:string;scope:'classin'|'personal'|'unknown'}[];note:string}
export const OFFICE_VERSION:string;
export const OFFICE_ROSTER:readonly {id:OfficeId;name:string;role:string;character:string;quote:string}[];
export const OFFICE_IDS:readonly OfficeId[];
export const OFFICE_MODES:readonly OfficeMode[];
export const OFFICE_SCOPES:readonly OfficeScope[];
export const OFFICE_LENSES:readonly never[];
export class OfficeInputError extends Error {}
export function parseOfficeRequest(value:unknown):OfficeRequest;
export function parseOfficeAnswer(value:unknown,mode:OfficeMode):OfficeAnswer;
export function parseOfficeContext(value:unknown,scope:OfficeScope):OfficeContext;
