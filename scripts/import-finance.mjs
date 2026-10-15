// Private financial source bundles stay outside the repository. Default: validate only.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {validateFinanceImport,projectFinance} from '../apps/hub/lib/finance-ledger.js';
import {runFinanceCommand} from '../apps/hub/lib/finance-service.js';
import {resolveSupabaseConfig} from '@com-moon/supabase-rest';
export async function importFinanceFile(path,{apply=false,expectRef,run=runFinanceCommand,config=resolveSupabaseConfig()}={}) {
 const payload=JSON.parse(await readFile(path,'utf8'));
 const validation=validateFinanceImport(payload);if(!validation.ok)throw new Error('Invalid finance bundle: '+validation.reason);
 const projection=projectFinance(payload.entries,payload.subscriptions,[]);
 const summary={entryCount:payload.entries.length,subscriptionCount:payload.subscriptions.length,monthly:projection.monthly,totals:projection.totals};
 if(!apply)return {status:'validated',...summary};
 const ref=config?new URL(config.url).hostname.split('.')[0]:null;
 if(!expectRef||ref!==expectRef)throw new Error('Explicit matching --expect-ref required for import');
 const result=await run({action:'import',payload});
 if(!['imported','duplicate'].includes(result.status))throw new Error('Finance import did not complete: '+result.status);
 return {status:result.status,importId:result.importId,...summary};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 for(const path of ['.env.local','apps/hub/.env.local']) {try{process.loadEnvFile(path);}catch(e){if(e.code!=='ENOENT')throw e;}}
 const args=process.argv.slice(2),path=args.find(a=>!a.startsWith('--')&&args[args.indexOf(a)-1]!=='--expect-ref');
 if(!path)throw new Error('Usage: node scripts/import-finance.mjs <private-bundle.json> [--apply --expect-ref <project-ref>]');
 try{console.log(JSON.stringify(await importFinanceFile(path,{apply:args.includes('--apply'),expectRef:args[args.indexOf('--expect-ref')+1]}),null,2));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
