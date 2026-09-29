export type OfficeId = 'eevee'|'vaporeon'|'jolteon'|'flareon'|'espeon'|'umbreon'|'leafeon'|'glaceon'|'sylveon';
export type OfficeMode = 'chat'|'draft'|'review'|'council';
export type OfficeScope = 'all'|'classin'|'personal';
export interface OfficeDeliberation {profile:'balanced'|'urgent'|'explore'|'scrutiny';challenge:number;depth:number;warmth:number;convergence:number;influence:Partial<Record<OfficeId,number>>}
export interface OfficeDiscussionTurn {ownerId:OfficeId;round:'position'|'response';position:string;evidence:string[];objection:string;revisionCondition:string;changed:boolean;replyTo:OfficeId[];changeReason:string}
export interface OfficeDiscussion {version:string;settings:OfficeDeliberation;turns:OfficeDiscussionTurn[];modelCalls:number}
export interface OfficeRequest {ownerId:OfficeId;mode:OfficeMode;scope:OfficeScope;message:string;participants:OfficeId[];lens:null;history:{role:'user'|'assistant';text:string}[];includeProjects:boolean;deliberation?:OfficeDeliberation}
export interface OfficeAnswer {answer:string;nextAction:string;recommendation?:string;evidence?:string[];dissent?:string[]}
export interface OfficeContext {source:'provided'|'live'|'partial'|'preview'|'error';scope:OfficeScope;projects:{id:string;name:string;status:string;scope:'classin'|'personal'|'unknown'}[];note:string}
export const OFFICE_VERSION:string;
export const OFFICE_ROSTER:readonly {id:OfficeId;name:string;role:string;character:string;quote:string;pitch:string}[];
export const OFFICE_IDS:readonly OfficeId[];
export const OFFICE_MODES:readonly OfficeMode[];
export const OFFICE_SCOPES:readonly OfficeScope[];
export const OFFICE_LENSES:readonly never[];
export class OfficeInputError extends Error {}
export function parseOfficeRequest(value:unknown):OfficeRequest;
export function parseOfficeAnswer(value:unknown,mode:OfficeMode):OfficeAnswer;
export function parseOfficeContext(value:unknown,scope:OfficeScope):OfficeContext;
export const OFFICE_DISCUSSION_VERSION:string;
export const OFFICE_DELIBERATION_PROFILES:Readonly<Record<OfficeDeliberation['profile'],Readonly<{label:string;challenge:number;depth:number;warmth:number;convergence:number}>>>;
export function parseOfficeDeliberation(value?:unknown,participants?:readonly OfficeId[]):OfficeDeliberation;
export function officeDiscussionRounds(settings:OfficeDeliberation):number;
export function parseOfficeDiscussion(value:unknown,request:{mode:OfficeMode;participants:OfficeId[];deliberation?:OfficeDeliberation}):OfficeDiscussion;
export function parseOfficeDiscussionTurn(value:unknown,context:{ownerId:OfficeId;round:OfficeDiscussionTurn['round'];participants:OfficeId[]}):OfficeDiscussionTurn;
export type OfficeFailurePhase = 'draft'|'review'|'position'|'response'|'synthesis';
export type OfficeFailureCategory = 'provider'|'json'|'source-review'|'contract'|'deadline'|'model-mismatch';
export interface OfficeFailure {phase:OfficeFailurePhase;category:OfficeFailureCategory}
export const OFFICE_FAILURE_PHASES:readonly OfficeFailurePhase[];
export const OFFICE_FAILURE_CATEGORIES:readonly OfficeFailureCategory[];
export const OFFICE_FAILURE_LABELS:Readonly<Record<OfficeFailureCategory|'unknown',string>>;
export function parseOfficeFailure(value:unknown):OfficeFailure|null;
export function officeFailureMessage(failure:{category?:string}|null|undefined):string;
