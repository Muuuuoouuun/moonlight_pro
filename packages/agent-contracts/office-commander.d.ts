import type {OfficeWorkBoundary} from './office-connection';
import type {OfficeRoleBrief,OfficeRoleOutput,OfficeRoleHandoffAck} from './office-role-depth';
export const OFFICE_COMMANDER_VERSION:string;
export const OFFICE_COMMANDER_SPECIALISTS:readonly string[];
export const OFFICE_COMMANDER_POLICY:Readonly<{mode:'shadow';commanderId:'eevee';maxTasks:3;maxOperations:40;maxDependencyDepth:2;providerCalls:0;businessWrites:false;costStatus:'unknown';schedulesEnabled:false;authorityEscalation:false;budgetEscalation:false}>;
export interface CommanderIdentity {workspaceId:string;actorId:string}
export interface CommanderIntake {requestId:string;scope:'classin'|'personal';goal:string|null;source:string;boundary?:OfficeWorkBoundary|null}
export interface CommanderResult {revision:number;ownerId:string;epoch:number;body:string;evidence:string[];uncertainties:string[];sourceTruth:'operator_provided_unverified';roleBrief:OfficeRoleBrief|null;roleOutput:OfficeRoleOutput|null}
export interface CommanderTask {id:string;title:string;ownerId:string|null;dependencies:string[];state:'needs_user'|'queued_shadow'|'working_shadow'|'blocked'|'failed'|'result_provided'|'reviewed_shadow'|'cancelled';epoch:number;result:CommanderResult|null;review:{binding:string}|null;error:string|null;brief:OfficeRoleBrief|null;connection?:any;handoffAcks:(OfficeRoleHandoffAck&{fromTaskId:string})[]}
export interface CommanderState extends CommanderIdentity,CommanderIntake {version:string;mode:'shadow';commanderId:'eevee';intakeKey:string;revision:number;cancelled:boolean;tasks:CommanderTask[];operationIds:string[];report:{revision:number;body:string;complete:boolean;sourceTruth:'session_shadow_unverified'}|null;state:'needs_user'|'active_shadow'|'partial_shadow'|'ready_shadow'|'compiled_shadow'|'cancelled';providerCalls:0;businessWrites:false;persistence:false}
export interface CommanderAction {operationId:string;expectedRevision:number;type:string;taskId?:string;payload:Record<string,unknown>}
export function officeCommanderIntakeKey(input:Pick<CommanderIntake,'scope'|'goal'|'source'>):string;
export function officeCommanderRecommendOwner(title:string):string|null;
export function parseOfficeCommanderIntake(value:unknown):CommanderIntake&{parts:string[]};
export function parseOfficeCommanderState(value:unknown):CommanderState;
export function createOfficeCommanderState(input:CommanderIntake,identity:CommanderIdentity):CommanderState;
export function officeCommanderReviewBinding(task:CommanderTask):string|null;
export function officeCommanderReviewCurrent(task:CommanderTask):boolean;
export function officeCommanderRootState(state:CommanderState):CommanderState['state'];
export function officeCommanderExecutionGate():{allowed:false;mode:'shadow';reason:string;costStatus:'unknown';providerCalls:0;businessWrites:false};
export function applyOfficeCommanderAction(snapshot:CommanderState,action:CommanderAction,identity:CommanderIdentity):{state:CommanderState;duplicate:boolean;gate:ReturnType<typeof officeCommanderExecutionGate>|null};
