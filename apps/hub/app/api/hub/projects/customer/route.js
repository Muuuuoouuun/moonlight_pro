import { NextResponse } from 'next/server';
import { getProjectCustomerContext } from '@/lib/repositories/project-customer-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await getProjectCustomerContext({ kind: params.get('kind'), id: params.get('id'), projectsOnly: params.get('view') === 'projects' }));
  } catch {
    return NextResponse.json({ status: 'error', customer: null, projects: [], message: '고객 연결 정보를 불러오지 못했어요. 다시 시도해 주세요.' });
  }
}
