import { createReviewDraftStore } from './daily-review-state';

const protectDrafts = (event) => { event.preventDefault(); event.returnValue = ''; };

// Shared by the Hub shell and review page. Restoring in the shell protects
// earlier drafts even when a refresh lands on a different dashboard page.
export const dailyReviewDraftStore = createReviewDraftStore({
  keys: () => Array.from({ length: window.sessionStorage.length }, (_, index) => window.sessionStorage.key(index)),
  getItem: (key) => window.sessionStorage.getItem(key),
  setItem: (key, value) => window.sessionStorage.setItem(key, value),
  removeItem: (key) => window.sessionStorage.removeItem(key),
}, { onPendingChange: (pending) => {
  if (pending) window.addEventListener('beforeunload', protectDrafts);
  else window.removeEventListener('beforeunload', protectDrafts);
} });
