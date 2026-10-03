import type { OfficeWorkBoundary, OfficeArtifactRef, OfficeTimeCalculation } from './office-connection.js';
import type { OfficeId } from './office';
export const OFFICE_ROLE_DEPTH_VERSION:string;
export const OFFICE_ROLE_DEPTH_POLICY:Readonly<{requestCoordinator:'eevee';decisionAuthority:'operator';executionActor:null;mode:'shadow';providerCalls:0;businessWrites:false;performanceAuthority:'operator';authorityEscalation:false;budgetEscalation:false}>;
export interface OfficeRoleDepth {id:OfficeId;name:string;role:string;responsibility:string;decisionRules:readonly string[];inputFields:readonly {key:string;label:string;required:boolean}[];outputFields:readonly {key:string;label:string;required:boolean}[];qualityChecks:readonly string[];boundaries:readonly string[];handoffs:readonly {to:OfficeId;when:string;packet:string}[];behavior:{goodJudgment:string;badJudgment:string;askWhen:string;exampleQuestion:string};failurePolicy:readonly string[];metrics:readonly string[]}
export const OFFICE_ROLE_DEPTH_REGISTRY:Readonly<Record<OfficeId,OfficeRoleDepth>>;
export interface OfficeRoleBrief {version:string;taskId:string;ownerId:OfficeId;epoch:number;scope:'classin'|'personal';goal:string;inputs:Record<string,string>;sources:{id:string;label:string;scope:'classin'|'personal';excerpt:string;binding?:{boundary:OfficeWorkBoundary;artifact:OfficeArtifactRef}}[];completionCriteria:string[];constraints:string[];boundary?:OfficeWorkBoundary}
export interface OfficeRoleOutput {version:string;taskId:string;ownerId:OfficeId;epoch:number;scope:'classin'|'personal';briefBinding:string;status:'draft'|'needs_input';fields:Record<string,string>;claims:{kind:'fact'|'inference'|'proposal';text:string;sourceIds:string[];quote:string|null;reason:string|null}[];uncertainties:string[];questions:{inputKey:string;question:string}[];calculations?: OfficeTimeCalculation[]; nextAction:{ownerId:OfficeId;action:string;condition:string}|null}
export interface OfficeRoleHandoffAck {status:'accepted'|'needs_input'|'rejected_out_of_scope';toOwnerId:OfficeId;consumedResultBinding:string;inputSummary:string;reason:string}
export function getOfficeRoleDepth(ownerId:string):OfficeRoleDepth;
export function renderOfficeRoleDepthInstructions(ownerId:string):string;
export function parseOfficeRoleBrief(value:unknown):OfficeRoleBrief;
export function officeRoleBriefBinding(value:unknown):string;
export function officeRoleMissingInputs(value:unknown):string[];
export function parseOfficeRoleOutput(value:unknown,brief:unknown):OfficeRoleOutput;
export function officeRoleOutputBody(value:unknown,brief:unknown):string;
export function officeRoleReviewGate(output:unknown,brief:unknown):{allowed:boolean;missingInputs:string[];checks:readonly string[];sourceTruth:'provided_quote_link_only';independentVerification:false;executionApproved:false;reason:string};
export function parseOfficeRoleHandoffAck(value:unknown,source:{id:string;ownerId:string|null;review:{binding:string}|null},target:{id:string;ownerId:string|null}):OfficeRoleHandoffAck;
