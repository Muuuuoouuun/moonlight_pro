// A scoped Agent API credential is deliberately separate from the legacy Hub secret.
import {boundedJson,hubEndpoint} from './transport-security.js';
const MAX_RESPONSE_BYTES = 128 * 1024;
export const hasAgentToken = () => Boolean(process.env.COM_MOON_AGENT_API_TOKEN?.trim());
export async function agentRequest(path, {method='GET', body, timeoutMs}={}) {
  const token=process.env.COM_MOON_AGENT_API_TOKEN?.trim();
  if(!token) return {ok:false,httpStatus:0,data:{status:'error',error:'COM_MOON_AGENT_API_TOKEN is not set. Configure the scoped Agent API before using this tool.',retryable:false}};
  let endpoint;
  try{endpoint=hubEndpoint(path,{agent:true});}
  catch{return {ok:false,httpStatus:0,data:{status:'error',error:'Invalid Hub URL or Agent API path. Use an HTTPS Hub origin (HTTP is allowed only on loopback).',code:'invalid-hub-target',retryable:false}};}
  const isCommand=['/commands','/goals/commands','/ai-assistance'].includes(path)&&method==='POST';
  const receiptTool=path==='/ai-assistance'?'get_assistance_receipt':path==='/goals/commands'?'get_goal_receipt':'get_command_receipt';
  const isJobWrite=method==='POST'&&(path==='/jobs'||/^\/jobs\/[^/]+\/(resume|cancel)$/.test(path));
  const isSkillReceipt=method==='POST'&&/^\/skill-requests\/[^/]+\/receipts$/.test(path);
  const timeout=Number(timeoutMs)||Number(process.env.COM_MOON_MCP_TIMEOUT_MS)||15_000;
  try {
    const res=await fetch(String(endpoint.url),{
      method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(Math.max(100,Math.min(timeout,120_000))),
    });
    const data=await boundedJson(res,MAX_RESPONSE_BYTES);
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('invalid-agent-response');
    const ok=res.ok&&!['error','unauthorized','forbidden','invalid-input','conflict','failed'].includes(data.status);
    return {ok,httpStatus:res.status,data};
  }catch(error){
    return {ok:false,httpStatus:0,data:{status:'error',error:isCommand?`Command outcome is unknown. Call ${receiptTool} with this commandId before retrying.`:isSkillReceipt?'Skill receipt outcome is unknown. Call get_skill_request with the same requestId before retrying.':isJobWrite?'Job outcome is unknown. Check the job list or saved job before retrying; reuse the same requestId and unchanged content, or the same expectedTurnCount for cancellation.':'Agent API is unavailable; check Hub and COM_MOON_HUB_URL.',code:error?.name==='TimeoutError'?'timeout':'agent-unavailable',retryable:!isCommand&&!isJobWrite&&!isSkillReceipt,...(isCommand||isJobWrite||isSkillReceipt?{persisted:null}:{}),...(isJobWrite||isSkillReceipt?{requestId:isSkillReceipt?path.split('/')[2]:body?.requestId??null,expectedTurnCount:body?.expectedTurnCount??null}:{}),...(body?.commandId?{commandId:body.commandId}:{})}};
  }
}
export function agentToolResult(result){return {content:[{type:'text',text:JSON.stringify(result.data)}],structuredContent:result.data,...(!result.ok?{isError:true}:{})};}
