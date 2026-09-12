import { acknowledgeStudioSave, buildStudioSave, isDurableStudioSave, studioErrorMessage } from './content-workflow-client.js';

export function isDefinitiveStudioRejection(result) {
  if (['invalid-input', 'payload-too-large', 'invalid-json', 'forbidden', 'unauthorized'].includes(result?.status)) return true;
  return result?.status === 'conflict' && ['stale-item', 'stale-variant', 'stale-transform-source', 'transform-selection-mismatch', 'transform-not-ready', 'version-conflict', 'stale-source', 'stale-context'].includes(result.error);
}

// A receipt reaches browser storage before a request can reach the server.
// The caller commits the acknowledged draft and cleared receipt together.
export function createStudioSaveQueue({ get, commit, send, requestId = () => crypto.randomUUID(),
  initialPending = null, persistPending = async () => {}, isCurrent = () => true }) {
  let pending = initialPending ? structuredClone(initialPending) : null, inFlight = null;
  const assertCurrent = () => { if (!isCurrent()) throw new Error('document-changed'); };
  async function persist(checkpoint) {
    assertCurrent();
    while (pending || get().dirty || checkpoint) {
      assertCurrent();
      if (!pending) {
        const sent = structuredClone(get().draft);
        pending = { sent, request: buildStudioSave(sent, requestId(), checkpoint) };
      }
      await persistPending(pending);
      assertCurrent();
      const result = await send(pending.request);
      assertCurrent();
      if (!isDurableStudioSave(result)) {
        if (isDefinitiveStudioRejection(result)) {
          await persistPending(null);
          assertCurrent();
          pending = null;
        }
        const error = new Error(studioErrorMessage(result));
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
