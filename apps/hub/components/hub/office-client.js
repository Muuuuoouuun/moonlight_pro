import {
  OFFICE_AGENTS,
  OFFICE_AGENT_IDS,
  OFFICE_MODES,
  OFFICE_DEFAULT_COUNCILS,
} from '@com-moon/agent-contracts/office';

export {
  OFFICE_AGENTS,
  OFFICE_AGENT_IDS,
  OFFICE_MODES,
  OFFICE_DEFAULT_COUNCILS,
};

export const OFFICE_MODE_LABEL = {
  chat: '1:1 전담 대화',
  task: '실행 초안 (Task)',
  critique: '비판적 감사 (Critique)',
  council: 'Council 종합 협업',
};

export async function requestOfficeChat({
  agentId = 'eevee',
  mode = 'chat',
  message = null,
  draft = null,
  participants = [],
  lens = null,
  context = null,
} = {}) {
  try {
    const res = await fetch('/api/hub/office/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId,
        mode,
        message,
        draft,
        participants,
        lens,
        context,
      }),
    });

    const data = await res.json().catch(() => null);

    if (data?.status === 'generated' && data.text) {
      return {
        state: 'done',
        text: data.text,
        agentId: data.agentId || agentId,
        mode: data.mode || mode,
        participants: data.participants || participants,
        isSimulation: Boolean(data.isSimulation),
        model: data.model,
        runId: data.runId,
      };
    }

    if (data?.status === 'preview') {
      return {
        state: 'preview',
        note: data.error || 'Engine이 아직 연결되지 않았거나 프리뷰 환경입니다.',
        agentId,
        mode,
      };
    }

    return {
      state: 'error',
      note: data?.error || data?.reason || '응답을 생성하지 못했습니다.',
      code: data?.code,
      agentId,
      mode,
    };
  } catch (err) {
    return {
      state: 'error',
      note: err instanceof Error ? err.message : '네트워크 요청에 실패했습니다.',
      agentId,
      mode,
    };
  }
}
