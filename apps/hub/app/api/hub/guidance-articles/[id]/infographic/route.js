import { loadGuruInfographic } from '@/lib/guru-infographic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
};

export async function GET(_request, { params }) {
  const { id } = await params;
  const infographic = await loadGuruInfographic(id);
  if (infographic.status !== 'ok') {
    return Response.json(infographic, { status: 200, headers: HEADERS });
  }
  return new Response(new Uint8Array(infographic.bytes), {
    status: 200,
    headers: { ...HEADERS, 'content-type': 'image/webp' },
  });
}
