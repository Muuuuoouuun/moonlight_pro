import {fetchSupabaseRowsDetailed} from '@com-moon/supabase-rest';
import {isAgentUuid} from '@com-moon/agent-contracts';
import {SOCIAL_BRAND_REGISTRY} from '../social-brand-registry.js';
import {matchesMetaOAuthConnection,resolveMetaOAuthApp} from '../meta-oauth-apps.js';

const PROVIDERS=['instagram_api','meta_threads','youtube'];
// Never read config or token values, even inside this server-side diagnostic.
export const CONNECTION_METADATA_SELECT=[
  'id','workspace_id','provider','account_key','status','last_synced_at','created_at',
  'brand_key:config->>brandKey','brand_handle:config->>brandHandle','username:config->>username',
  'title:config->>channelTitle','app_key:config->>oauthAppKey','app_id:config->>oauthAppId',
  'expires_at:config->>expiresAt','refresh_expires_at:config->>refreshTokenExpiresAt',
].join(',');
const text=(value,max=128)=>typeof value==='string'?value.slice(0,max):null;
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const error=(httpStatus,code)=>({httpStatus,data:{status:'error',error:code,retryable:false}});

function parseQuery(query){
  if(Object.keys(query).some(key=>!['brandKey','provider','limit','offset'].includes(key)))return null;
  if(query.brandKey!==undefined&&!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(query.brandKey))return null;
  if(query.provider!==undefined&&!PROVIDERS.includes(query.provider))return null;
  const integer=(value,fallback,max)=>value===undefined?fallback:typeof value==='string'&&/^\d{1,5}$/.test(value)&&Number(value)<=max?Number(value):null;
  const limit=integer(query.limit,50,100),offset=integer(query.offset,0,10000);
  return limit&&offset!==null?{...query,limit,offset}:null;
}

function summarize(row,now){
  const brandKey=row.brand_key||(row.username==='ml_bridgemaker'?'bridgemaker':null);
  const expiresAt=timestamp(row.expires_at),refreshGrantExpiresAt=timestamp(row.refresh_expires_at);
  let tokenStatus=row.status!=='connected'?'not-connected':!expiresAt?'expiry-unknown':
    refreshGrantExpiresAt&&Date.parse(refreshGrantExpiresAt)<=now?'reauthorization-required':
    Date.parse(expiresAt)<=now?(row.provider==='youtube'?(refreshGrantExpiresAt?'refresh-required':'access-expired'):'reauthorization-required'):
    Date.parse(expiresAt)<=now+7*86400000?'expires-soon':'stored-active';
  let appBindingMatches=null;
  if(row.provider!=='youtube'){
    const app=resolveMetaOAuthApp({provider:row.provider,brandKey,brandHandle:row.username});
    appBindingMatches=app?.configured?matchesMetaOAuthConnection({account_key:row.account_key,config:{
      username:row.username,brandHandle:row.brand_handle,brandKey:row.brand_key,
      oauthAppKey:row.app_key,oauthAppId:row.app_id,
    }},app):null;
    if(!app?.configured)tokenStatus='app-config-required';
    else if(!appBindingMatches)tokenStatus='app-binding-review-required';
  }
  return {id:text(row.id),provider:row.provider,brandKey:text(brandKey,64),accountId:text(row.account_key),
    username:text(row.username,30),title:text(row.title,160),storedStatus:text(row.status,60),
    expiresAt,refreshGrantExpiresAt,tokenStatus,appBindingMatches,lastSyncedAt:timestamp(row.last_synced_at)};
}

export async function getAgentIntegrationHealth(query,context,{fetchRows=fetchSupabaseRowsDetailed,now=Date.now()}={}){
  if(!isAgentUuid(context?.workspaceId)||!context.scopes?.includes('read'))return error(403,'agent-scope-denied');
  const options=parseQuery(query);if(!options)return error(400,'invalid-integration-query');
  const filters=[['workspace_id',`eq.${context.workspaceId}`],['provider',options.provider?`eq.${options.provider}`:`in.(${PROVIDERS.join(',')})`]];
  if(options.brandKey==='bridgemaker')filters.push(['or','(config->>brandKey.eq.bridgemaker,and(config->>brandKey.is.null,config->>username.eq.ml_bridgemaker))']);
  else if(options.brandKey)filters.push(['config->>brandKey',`eq.${options.brandKey}`]);
  let result;
  try{result=await fetchRows('integration_connections',{select:CONNECTION_METADATA_SELECT,filters,order:'created_at.desc,id.desc',limit:options.limit+1,offset:options.offset,strictRows:true});}
  catch{return error(502,'integration-metadata-unavailable');}
  if(!result.configured||result.error||!Array.isArray(result.rows)||result.rows.some(row=>!row||row.workspace_id!==context.workspaceId||!PROVIDERS.includes(row.provider)))return error(502,'integration-metadata-unavailable');
  const rows=result.rows.slice(0,options.limit).map(row=>summarize(row,now));
  const metaApps=Object.values(SOCIAL_BRAND_REGISTRY).filter(brand=>!options.brandKey||brand.brandKey===options.brandKey).flatMap(brand=>
    brand.providers.filter(provider=>!options.provider||provider===options.provider).map(provider=>{
      const app=resolveMetaOAuthApp({provider,brandKey:brand.brandKey,brandHandle:brand.brandHandle});
      return {brandKey:brand.brandKey,handle:brand.brandHandle,provider,appKey:app.appKey,
        configured:app.configured,hasAppId:app.hasAppId,hasAppSecret:app.hasAppSecret,scopes:app.scopes};
    }));
  const hasMore=result.rows.length>options.limit;
  const nextOffset=options.offset+rows.length;
  return {httpStatus:200,data:{status:'live',source:'supabase',verification:'stored-metadata',asOf:new Date(now).toISOString(),
    tokenValuesRead:false,providerRequestsMade:false,refreshScheduled:false,
    data:{connections:rows,metaApps},page:{returnedCount:rows.length,hasMore,nextOffset:hasMore&&nextOffset<=10000?nextOffset:null,truncated:hasMore&&nextOffset>10000}}};
}
