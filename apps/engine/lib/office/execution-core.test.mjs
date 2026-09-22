import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { parseOfficeRequest } from '@com-moon/agent-contracts/office';
import { parseOfficeWorkflowRequest, parseOfficeWorkflowContext } from '@com-moon/agent-contracts/office-workflow';
import { runOfficeResponse } from './response-core.ts';
import { runOfficeWorkflow } from './workflow-core.ts';

const model = 'execution-core-test-provider';
const participants = ['flareon', 'umbreon'];

function responseInputs(mode) {
  return {
    request: parseOfficeRequest({ ownerId: 'flareon', mode, scope: 'classin', participants: mode === 'council' ? participants : [], message: '자료 제공 여부를 확인할 답장을 작성해 주세요.' }),
    context: { source: 'provided', scope: 'classin', projects: [], note: '자료 제공 여부는 아직 확인되지 않았습니다.' },
  };
}
function workflowInputs(mode) {
  const request = parseOfficeWorkflowRequest({
    requestId: '10000000-0000-4000-8000-000000000001', intent: 'customer_reply', ownerId: 'flareon', mode, scope: 'classin',
    participants: mode === 'council' ? participants : [], originRef: { entityType: 'lead', entityId: '20000000-0000-4000-8000-000000000001' },
    expectedContextHash: 'a'.repeat(64), message: '자료 제공 여부를 확인할 답장을 작성해 주세요.',
  });
  const context = parseOfficeWorkflowContext({
    status: 'ready', scope: 'classin', originRef: request.originRef, originKey: `customer:lead:${request.originRef.entityId}`,
    facts: { statement: '자료 제공 여부는 아직 확인되지 않았습니다.' }, sourceRefs: [{ id: 'source-message', type: 'lead', entityId: request.originRef.entityId }],
    missing: ['자료 제공 여부'], asOf: '2026-09-22T00:00:00Z', contextHash: request.expectedContextHash, capabilities: { generate: true, applyTask: true },
  }, request);
  return { request, context };
}
function responseAnswer(request) {
  return { answer: '자료 제공 여부를 확인하겠습니다.', nextAction: '제공 여부를 확인합니다.', ...(request.mode === 'council' ? { recommendation: '확인 후 안내합니다.', evidence: [], dissent: [] } : {}) };
}
function workflowAnswer(request) {
  return {
    summary: '자료 제공 여부를 확인합니다.', artifact: { kind: 'text', body: '자료 제공 여부를 확인하겠습니다.' },
    evidence: [], uncertainties: ['자료 제공 여부'], dissent: [], nextStep: null,
    ...(request.mode === 'council' ? { council: { perspectives: request.participants.map(ownerId => ({ ownerId, judgment: '제공 여부를 먼저 확인합니다.', tradeoff: '확인 전 확약을 보류합니다.' })), recommendation: '확인 후 안내합니다.' } } : {}),
  };
}
function phaseOf(input, request) {
  return request.mode === 'council' ? JSON.parse(input.prompt).phase ?? 'synthesis' : input.responseJsonSchema.properties.sourceIndexes ? 'review' : 'draft';
}
function validReply(input, request, answer) {
  const data = JSON.parse(input.prompt);
  const value = data.phase ? {
    position: `${data.roleId}의 ${data.phase} 판단입니다.`, evidence: [], objection: '', revisionCondition: '자료 제공 여부를 확인하면 판단을 갱신합니다.',
    changed: false, replyTo: data.phase === 'response' ? request.participants.filter(id => id !== data.roleId) : [],
    changeReason: data.phase === 'response' ? '동료의 의견을 검토했으나 미확인 여부가 달라지지 않았습니다.' : '',
  } : answer(request);
  return { ok: true, text: JSON.stringify({ ...(input.responseJsonSchema.properties.sourceIndexes ? { sourceIndexes: [], corrections: [] } : {}), ...value }), model };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function waitForAbort(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}
function assertFailure(result) {
  assert.equal(result.status, 'error');
  for (const field of ['answer', 'artifact', 'discussion', 'generation']) assert.equal(result[field], undefined);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_CANCELLATION/);
}

const cores = [
  { name: 'response core', run: runOfficeResponse, inputs: responseInputs, answer: responseAnswer },
  { name: 'workflow core', run: runOfficeWorkflow, inputs: workflowInputs, answer: workflowAnswer },
];

for (const core of cores) {
  test(`${core.name} requires an explicit real signal and provider before execution`, async () => {
    const { request, context } = core.inputs('chat');
    let calls = 0;
    const generate = async () => { calls++; };
    const signal = new AbortController().signal;
    for (const execution of [undefined, null, {}, { generate }, { signal: null, generate }, { signal: {}, generate }, { signal }, { signal, generate: null }]) {
      await assert.rejects(core.run(request, context, execution), TypeError);
    }
    assert.equal(calls, 0);
  });

  for (const mode of ['chat', 'council']) {
    test(`${core.name} ${mode} uses the supplied job signal without creating an HTTP deadline`, async t => {
      const controller = new AbortController(), calls = [];
      let deadlines = 0;
      t.mock.method(AbortSignal, 'timeout', () => { deadlines++; throw new Error('The job owns its deadline.'); });
      const { request, context } = core.inputs(mode);
      const result = await core.run(request, context, { signal: controller.signal, generate: async input => {
        calls.push(input);
        return validReply(input, request, core.answer);
      } });
      assert.equal(result.status, 'generated');
      assert.equal(deadlines, 0);
      assert.equal(calls.length, mode === 'council' ? 5 : 2);
      assert.equal(calls.at(-1).signal, controller.signal);
      assert.equal(calls.at(-1).model, model);
      if (mode === 'council') {
        assert.deepEqual(result.discussion.turns.map(({ ownerId, round }) => ({ ownerId, round })), ['position', 'response'].flatMap(round => participants.map(ownerId => ({ ownerId, round }))));
        assert.equal(result.discussion.modelCalls, calls.length);
      } else assert.ok(calls.every(input => input.signal === controller.signal));
      controller.abort();
      assert.ok(calls.every(input => input.signal.aborted));
    });

    test(`${core.name} ${mode} never calls a provider for an already cancelled job`, async () => {
      const controller = new AbortController();
      controller.abort(new Error('PRIVATE_CANCELLATION'));
      const { request, context } = core.inputs(mode);
      let calls = 0;
      const result = await core.run(request, context, { signal: controller.signal, generate: async input => {
        calls++;
        return validReply(input, request, core.answer);
      } });
      assert.equal(calls, 0);
      assertFailure(result);
    });
  }

  // Controlled promises hold real pending calls across an external abort; no elapsed-time sleeps.
  for (const phase of ['draft', 'review', 'position', 'response', 'synthesis']) {
    test(`${core.name} rejects a late successful ${phase} after the job is cancelled`, async () => {
      const mode = ['draft', 'review'].includes(phase) ? 'chat' : 'council';
      const { request, context } = core.inputs(mode);
      const controller = new AbortController(), started = deferred(), release = deferred(), calls = [], events = [];
      let pending = 0;
      const expectedPending = ['position', 'response'].includes(phase) ? participants.length : 1;
      const running = core.run(request, context, { signal: controller.signal, onDiagnostic: event => events.push(event), generate: async input => {
        calls.push(input);
        if (phaseOf(input, request) === phase) {
          if (++pending === expectedPending) started.resolve();
          await release.promise;
        }
        return validReply(input, request, core.answer);
      } });
      await started.promise;
      controller.abort(new Error('PRIVATE_CANCELLATION'));
      release.resolve();
      assertFailure(await running);
      assert.equal(calls.length, { draft: 1, review: 2, position: 2, response: 4, synthesis: 5 }[phase]);
      assert.ok(calls.every(input => input.signal.aborted));
      if (core.name === 'response core') {
        assert.equal(events.length, expectedPending);
        assert.ok(events.every(event => event.phase === phase && event.category === 'deadline'));
      }
    });
  }

  for (const phase of ['position', 'response']) {
    test(`${core.name} cancellation takes precedence over late ${phase} missing-key failures`, async () => {
      const { request, context } = core.inputs('council');
      const controller = new AbortController(), started = deferred(), release = deferred(), calls = [];
      let pending = 0;
      const running = core.run(request, context, { signal: controller.signal, generate: async input => {
        calls.push(input);
        if (phaseOf(input, request) !== phase) return validReply(input, request, core.answer);
        if (++pending === participants.length) started.resolve();
        await release.promise;
        return { ok: false, reason: 'missing-api-key' };
      } });
      await started.promise;
      controller.abort(new Error('PRIVATE_CANCELLATION'));
      release.resolve();
      const result = await running;
      assertFailure(result);
      assert.doesNotMatch(result.error, /AI 연결/);
      assert.equal(calls.length, phase === 'position' ? 2 : 4);
      assert.ok(calls.every(input => input.signal.aborted));
    });

    test(`${core.name} ${phase} aborts and drains sibling providers before resolving`, async () => {
      for (const cause of ['caller', 'sibling']) {
        const { request, context } = core.inputs('council');
        const controller = new AbortController(), started = deferred(), cancelled = deferred(), cleanup = deferred();
        const calls = [];
        let active = 0, aborted = 0, cleaned = 0, finished = false;
        const expectedPending = cause === 'caller' ? participants.length : 1;
        const running = core.run(request, context, { signal: controller.signal, generate: async input => {
          calls.push(input);
          if (phaseOf(input, request) !== phase) return validReply(input, request, core.answer);
          if (cause === 'sibling' && JSON.parse(input.prompt).roleId === participants[0]) return { ok: false, reason: 'provider-failed' };
          if (++active === expectedPending) started.resolve();
          try { return await waitForAbort(input.signal); }
          finally {
            if (++aborted === expectedPending) cancelled.resolve();
            await cleanup.promise;
            cleaned++;
          }
        } }).finally(() => { finished = true; });
        await started.promise;
        if (cause === 'caller') controller.abort(new Error('PRIVATE_CANCELLATION'));
        await cancelled.promise;
        await nextTurn();
        try {
          assert.equal(finished, false, 'job completion must await every provider cleanup');
          assert.equal(cleaned, 0);
          assert.ok(calls.every(input => input.signal.aborted));
        } finally { cleanup.resolve(); }
        assertFailure(await running);
        assert.equal(cleaned, expectedPending);
        assert.equal(calls.length, phase === 'position' ? 2 : 4);
        assert.equal(controller.signal.aborted, cause === 'caller', 'a sibling failure cannot cancel the parent job signal');
      }
    });
  }
}
