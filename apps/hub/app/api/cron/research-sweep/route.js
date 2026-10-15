import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { runResearchSweep } from '@/lib/research-run-service';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(req){const secret=process.env.CRON_SECRET?.trim(),expected=Buffer.from(secret?`Bearer ${secret}`:''),supplied=Buffer.from(req.headers.get('authorization')||'');
  if(!secret||expected.length!==supplied.length||!timingSafeEqual(expected,supplied))return NextResponse.json({status:'forbidden',reason:'research-cron-unauthorized'},{status:401});
  try{return NextResponse.json(await runResearchSweep(),{headers:{'Cache-Control':'private, no-store'}});}catch{return NextResponse.json({status:'error',reason:'research-sweep-interrupted'},{status:502});}}
