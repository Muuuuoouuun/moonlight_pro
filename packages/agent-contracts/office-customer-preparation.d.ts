import type { OfficeWorkflowResult } from './office-workflow.js';
export const OFFICE_CUSTOMER_PREPARATION_VERSION: string;
export interface OfficeCustomerPreparation {version:string;purpose:string;materials:{title:string;reason:string;availability:'unverified'}[];questions:string[]}
export interface OfficeCustomerApproval {version:string;requestId:string;resultRevision:number;contextHash:string;reviewedContextHash:string;resultHash:string;sourcesReviewed:true;questionsReviewed:true}
export interface OfficeCustomerExecution {modelCalls:number;providerRetries:0;costStatus:'unknown'}
export function parseOfficeCustomerPreparation(value:unknown):OfficeCustomerPreparation;
export function officeCustomerApprovalPayload(result:OfficeWorkflowResult,options?:{reviewedContextHash?:string}):string;
export function createOfficeCustomerApproval(result:OfficeWorkflowResult,options:{sourcesReviewed:boolean;questionsReviewed:boolean;reviewedContextHash?:string;cryptoProvider?:Crypto}):Promise<OfficeCustomerApproval>;
export function parseOfficeCustomerApproval(value:unknown,result:OfficeWorkflowResult,expectedHash:string):OfficeCustomerApproval;
export function parseOfficeCustomerExecution(value:unknown):OfficeCustomerExecution;
