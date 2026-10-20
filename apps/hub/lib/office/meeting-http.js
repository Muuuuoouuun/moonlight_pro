import { boundMeetingResponse } from './meeting-pages.js';
import { assertHubWriteAllowed, readHubWriteJson } from '../hub-write-guard.js';
import { officeMeetingIdentity, officeMeetingService } from './meeting-runtime.js';
const httpStatus = status => status==='invalid-input'?400:status==='conflict'?409:status==='not-found'?404:['preview','running','unknown'].includes(status)?202:status==='error'?502:200;
export function createOfficeMeetingHandler(action,{service=officeMeetingService,identity=officeMeetingIdentity,guard=assertHubWriteAllowed}={}) {
 const read=action==='get'||action==='list';
 return async (req,route={})=>{
  if(!read){const denied=guard(req);if(denied)return denied;}
  try {
   const owner=identity(req),params=await route.params,url=new URL(req.url);let result,command;
   const negotiated=req.headers.get('x-office-read-version')==='1' || (read && url.searchParams.has('readVersion'));
   if(action==='get') {
    const query=url.searchParams;
    if(query.has('readVersion')) {
     result=query.get('readVersion')==='1' && service.getPage
      ? await service.getPage(params?.id,{scope:query.get('scope'),...(query.has('cursor')?{cursor:query.get('cursor')}:{})},owner,{origin:url.origin})
      : {status:'error',source:'error',error:'office-meeting-page-version-unsupported'};
    } else result=await service.get(params?.id,owner);
   }
   else if(action==='list') { const query=new URL(req.url).searchParams;result=await service.list({scope:query.get('scope'),...(query.has('limit')?{limit:query.get('limit')}:{}),...(query.has('cursor')?{cursor:query.get('cursor')}:{})},owner); }
   else { const input=await readHubWriteJson(req,{maxBytes:32768});if(input.error)return input.error;
    command=input.data;
    result=action==='create'?await service.create(input.data,owner):await service[action](params?.id,input.data,owner);
   }
   if(read && !['ready','preview'].includes(result.status))result={...result,status:'error',source:'error'};
   result=boundMeetingResponse(result,{read,negotiated,meetingId:params?.id ?? command?.meetingId,requestId:command?.requestId});
   return Response.json(result,{status:read?200:httpStatus(result.status),headers:{'cache-control':'no-store'}});
  }catch {return Response.json({status:'error',source:'error',error:'office-meeting-unavailable',persisted:false},{status:read?200:502,headers:{'cache-control':'no-store'}});}
 };
}
