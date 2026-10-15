import { acknowledgeStudioSave, buildStudioSave, hasStudioContent, isDurableStudioSave, studioErrorMessage } from './content-workflow-client.js';

const isSceneValidationRejection = result => result?.status === 'invalid-input'
  && typeof result.error === 'string' && result.error.startsWith('invalid-reels-script-');

export function isDefinitiveStudioRejection(result, { outcomeUncertain = false } = {}) {
  // A later scene validator cannot prove an older, unanswered save was rejected.
  if (outcomeUncertain && isSceneValidationRejection(result)) return false;
  if (['invalid-input', 'payload-too-large', 'invalid-json', 'forbidden', 'unauthorized'].includes(result?.status)) return true;
  return result?.status === 'conflict' && ['stale-item', 'stale-variant', 'stale-transform-source', 'transform-selection-mismatch', 'transform-not-ready', 'version-conflict', 'stale-source', 'stale-context'].includes(result.error);
}

// A receipt reaches browser storage before a request can reach the server.
// The caller commits the acknowledged draft and cleared receipt together.
export function createStudioSaveQueue({ get, commit, send, requestId = () => crypto.randomUUID(),
  initialPending = null, persistPending = async () => {}, isCurrent = () => true }) {
  let pending = initialPending ? { ...structuredClone(initialPending), outcomeUncertain: true } : null, inFlight = null;
  const assertCurrent = () => { if (!isCurrent()) throw new Error('document-changed'); };
  async function persist(checkpoint) {
    assertCurrent();
    while (pending || get().dirty || checkpoint) {
      assertCurrent();
      if (!pending) {
        if (!get().draft.contentId && !hasStudioContent(get().draft)) return get().draft;
        const sent = structuredClone(get().draft);
        pending = { sent, request: buildStudioSave(sent, requestId(), checkpoint) };
      }
      await persistPending(pending);
      assertCurrent();
      let result;
      try { result = await send(pending.request); }
      catch (error) {
        assertCurrent();
        pending.outcomeUncertain = true;
        await persistPending(pending);
        assertCurrent();
        throw error;
      }
      assertCurrent();
      if (!isDurableStudioSave(result)) {
        if (isDefinitiveStudioRejection(result, { outcomeUncertain: pending.outcomeUncertain })) {
          await persistPending(null);
          assertCurrent();
          pending = null;
        } else {
          pending.outcomeUncertain = true;
          await persistPending(pending);
          assertCurrent();
        }
        const messageResult = pending?.outcomeUncertain && isSceneValidationRejection(result)
          ? { status: 'unknown', error: 'workflow-receipt-unconfirmed' } : result;
        const error = new Error(studioErrorMessage(messageResult));
        error.result = result;
        throw error;
      }
      const state = acknowledgeStudioSave(get().draft, pending.sent, result);
      await commit(state, result, pending);
      assertCurrent();
      pending = null;
      checkpoint = false;
    }
    return get().draft;
  }
  return {
    flush(checkpoint = false) {
      if (inFlight) return inFlight.then(() => this.flush(checkpoint));
      inFlight = persist(checkpoint).finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
