import { invokeSupabaseRpc, resolveDefaultWorkspaceId, resolveSupabaseConfig } from '@/lib/server-write';
import { isCanonicalUuid } from './uuid.js';

const LIMIT = 20;
const MESSAGE = '함께 신경 쓸 일을 불러오지 못했어요. 다시 확인해 주세요.';
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const defaults = {
  rpc: invokeSupabaseRpc,
  workspaceId: resolveDefaultWorkspaceId,
  configured: () => Boolean(resolveSupabaseConfig()),
};

const empty = (status) => ({ status, items: [], hasMore: false });
const error = () => ({ ...empty('error'), error: 'read-failed', message: MESSAGE });

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

function validTimestamp(value) {
  return typeof value === 'string' && value.length <= 80 && TIMESTAMP.test(value)
    && Number.isFinite(new Date(value).getTime());
}

function normalizeItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)
    || !isCanonicalUuid(item.proposalId) || !isCanonicalUuid(item.entryId)
    || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 4000
    || (item.checkAt !== null && !validDate(item.checkAt))
    || (item.method !== null && (typeof item.method !== 'string' || item.method.length > 1000))
    || !Number.isSafeInteger(item.stepCount) || item.stepCount < 0 || item.stepCount > 50
    || !validTimestamp(item.reviewedAt)) return null;
  const proposalId = item.proposalId.toLowerCase();
  const entryId = item.entryId.toLowerCase();
  const href = `/dashboard/work/memos?note=${entryId}`;
  if (item.href !== href) return null;
  return { proposalId, entryId, title: item.title, checkAt: item.checkAt,
    method: item.method, stepCount: item.stepCount, href, reviewedAt: item.reviewedAt };
}

export function createMeetingReviewWatchlistService(overrides = {}) {
  const deps = { ...defaults, ...overrides };
  return async function getMeetingReviewWatchlist() {
    try {
      const configured = deps.configured();
      const workspaceId = deps.workspaceId();
      if (!configured || !isCanonicalUuid(workspaceId)) return empty('preview');
      const response = await deps.rpc('meeting_review_watchlist_v1', {
        p_workspace_id: workspaceId.toLowerCase(), p_limit: LIMIT,
      });
      const data = response?.data;
      if (!response?.ok || !data || typeof data !== 'object' || Array.isArray(data) || data.status !== 'live'
        || !Array.isArray(data.items) || data.items.length > LIMIT || typeof data.hasMore !== 'boolean') return error();
      const items = data.items.map(normalizeItem);
      if (items.some((item) => item === null)
        || new Set(items.map((item) => item.proposalId)).size !== items.length) return error();
      return { status: 'live', items, hasMore: data.hasMore };
    } catch {
      return error();
    }
  };
}

export const getMeetingReviewWatchlist = createMeetingReviewWatchlistService();
