import type { OfficeId, OfficeMode, OfficeDeliberation, OfficeDiscussion } from './office.js';
export type OfficeWorkflowIntent = 'weekly_report'|'customer_reply'|'freeform';
export type OfficeWorkflowScope = 'classin'|'personal';
export type OfficeWorkflowOrigin = {periodStart:string;periodEnd:string;timezone:string}|{entityType:'lead'|'customer_account'|'deal';entityId:string}|Record<string, never>;
export interface OfficeWorkflowRequest {requestId:string;intent:OfficeWorkflowIntent;ownerId:OfficeId;mode:OfficeMode;participants:OfficeId[];scope:OfficeWorkflowScope;originRef:OfficeWorkflowOrigin;expectedContextHash:string;message:string;boundedHistory:{role:'user'|'assistant';text:string}[];parentRequestId?:string;deliberation?:OfficeDeliberation}
export interface OfficeWorkflowContext {status:'ready'|'preview'|'error';scope:OfficeWorkflowScope;originRef:OfficeWorkflowOrigin;originKey:string;facts:Record<string,unknown>;sourceRefs:{id:string;type:string;entityId?:string;updatedAt?:string;label?:string}[];missing:string[];asOf:string;contextHash:string;capabilities:{generate:boolean;applyTask:boolean}}
export interface OfficeWorkflowAnswer {summary:string;artifact:{kind:'text'|'markdown'|'code';body:string};evidence:{sourceRefId:string;explanation:string}[];uncertainties:string[];dissent:string[];council?:{perspectives:{ownerId:OfficeId;judgment:string;tradeoff:string}[];recommendation:string};nextStep:null|{kind:'create_task';label:string;fields:{title:string;description?:string;nextAction?:string;dueAt?:string;projectId?:string;dealId?:string;priority?:'low'|'medium'|'high'|'critical'}}}
export interface OfficeWorkflowGeneration {policyVersion:string;promptHash:string;model:string;usage:null|{promptTokens:number;outputTokens:number;totalTokens:number};elapsedMs:number}
interface OfficeWorkflowMeta {version:string;requestId:string;ownerId:OfficeId;mode:OfficeMode;participants:OfficeId[];scope:OfficeWorkflowScope}
export type OfficeWorkflowResult = OfficeWorkflowMeta & ((OfficeWorkflowAnswer & {status:'generated';resultRevision:1;context:{asOf:string;contextHash:string;missing:string[]};generation:OfficeWorkflowGeneration;discussion?:OfficeDiscussion})|{status:'preview'|'error';error:string});
export const OFFICE_WORKFLOW_VERSION:string;
export const OFFICE_WORKFLOW_INTENTS:readonly OfficeWorkflowIntent[];
export const OFFICE_WORKFLOW_LIMITS:Readonly<{message:number;history:number;historyChars:number;factsBytes:number;resultBytes:number}>;
export function parseOfficeWorkflowOrigin(value:unknown,intent:OfficeWorkflowIntent):OfficeWorkflowOrigin;
export function parseOfficeWorkflowRequest(value:unknown):OfficeWorkflowRequest;
export function parseOfficeWorkflowContext(value:unknown,request:OfficeWorkflowRequest):OfficeWorkflowContext;
export function parseOfficeWorkflowAnswer(value:unknown,request:OfficeWorkflowRequest,context:OfficeWorkflowContext):OfficeWorkflowAnswer;
export function parseOfficeWorkflowResult(value:unknown,request:OfficeWorkflowRequest,context:OfficeWorkflowContext):OfficeWorkflowResult;
