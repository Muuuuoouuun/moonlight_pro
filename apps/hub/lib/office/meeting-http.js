import { assertHubWriteAllowed, readHubWriteJson } from '../hub-write-guard.js';
import { officeMeetingIdentity, officeMeetingService } from './meeting-runtime.js';
const httpStatus = status => status==='invalid-input'?400:status==='conflict'?409:status==='not-found'?404:['preview','running','unknown'].includes(status)?202:status==='error'?502:200;
export function createOfficeMeetingHandler(action,{service=officeMeetingService,identity=officeMeetingIdentity,guard=assertHubWriteAllowed}={}) {
 const read=action==='get'||action==='list';
 return async (req,route={})=>{
  if(!read){const denied=guard(req);if(denied)return denied;}
  try {
   const owner=identity(req),params=await route.params;let result;
   if(action==='get')result=await service.get(params?.id,owner);
   else if(action==='list') { const query=new URL(req.url).searchParams;result=await service.list({scope:query.get('scope'),...(query.has('limit')?{limit:query.get('limit')}:{}),...(query.has('cursor')?{cursor:query.get('cursor')}:{})},owner); }
   else { const input=await readHubWriteJson(req,{maxBytes:32768});if(input.error)return input.error;
    result=action==='create'?await service.create(input.data,owner):await service[action](params?.id,input.data,owner);
   }
   if(read && !['ready','preview'].includes(result.status))result={...result,status:'error',source:'error'};
   return Response.json(result,{status:read?200:httpStatus(result.status),headers:{'cache-control':'no-store'}});
  }catch {return Response.json({status:'error',source:'error',error:'office-meeting-unavailable',persisted:false},{status:read?200:502,headers:{'cache-control':'no-store'}});}
 };
}
