import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { getReportsArchive } from '@/lib/repositories/reports-ledger';
import { runReportCommand } from '@/lib/reports-service';
import { officeOperatorIdentity } from '@/lib/office/workflow-runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
export async function GET(req) {
  try {
    const query = new URL(req.url).searchParams;
    return json(await getReportsArchive({ ...officeOperatorIdentity(req), report: query.get('report'), cursor: query.get('cursor') }));
  }
  catch { return json({ status: 'error', reports: [], failedSources: ['reports'] }); }
}
export async function POST(req) {
  const denied = assertHubWriteAllowed(req); if (denied) return denied;
  const parsed = await readHubWriteJson(req, { maxBytes: 150000 }); if (parsed.error) return parsed.error;
  const { httpStatus, ...result } = await runReportCommand(parsed.data);
  return json(result, httpStatus);
}
