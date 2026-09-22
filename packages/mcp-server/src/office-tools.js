import { z } from 'zod';
import { hasWriteSecret, hubPost } from './hub-client.js';

const OFFICE_AGENT_IDS = [
  'eevee',
  'vaporeon',
  'jolteon',
  'flareon',
  'espeon',
  'umbreon',
  'leafeon',
  'glaceon',
  'sylveon',
];

function jsonResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function toolResult(result) {
  if (result.ok) {
    return jsonResult(result.data);
  }
  return errorResult(result.error);
}

function requireWriteSecret() {
  if (hasWriteSecret()) {
    return null;
  }
  return errorResult(
    'COM_MOON_HUB_WRITE_SECRET is not set for this MCP server — write actions are disabled. ' +
      "Set it to the same value as apps/hub's COM_MOON_HUB_WRITE_SECRET to enable writes."
  );
}

export function registerOfficeTools(server) {
  server.registerTool(
    'request_office_agent',
    {
      title: 'Request Office Agent Advice / Task',
      description:
        'Consult one of the 9 Eevee Office C-Level agents (eevee: Chief of Staff, vaporeon: COO, jolteon: CTO, flareon: CRO, espeon: CSO, umbreon: Risk, leafeon: CFO, glaceon: CPO, sylveon: CMO) for decision consulting, actionable task drafting, or harsh critique. Supports harsh scoring (0~100) and gate evaluation.',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        agentId: z
          .enum(OFFICE_AGENT_IDS)
          .describe('Office C-Level agent ID to consult.'),
        mode: z
          .enum(['chat', 'task', 'critique'])
          .default('chat')
          .describe('Mode: chat (1:1 dialogue), task (concrete actionable draft), critique (harsh flaw analysis).'),
        message: z
          .string()
          .min(1)
          .max(16000)
          .describe('The request, question, or goal for the executive agent.'),
        draft: z
          .string()
          .max(32000)
          .optional()
          .describe('Optional draft text, proposal, or context to review/transform.'),
        evaluate: z
          .boolean()
          .default(false)
          .describe('If true, produces an uncompromising 0~100 harsh scorecard and gate evaluation (PASS/REVISE/REJECT).'),
        lens: z
          .string()
          .optional()
          .describe('Optional philosophical/expert lens (e.g. jobs, bezos, voss).'),
        model: z
          .string()
          .trim()
          .max(100)
          .optional()
          .describe('Optional AI model override (e.g. gemini-2.5-pro, gemini-2.5-flash).'),
      },
    },
    async ({ agentId, mode = 'chat', message, draft, evaluate = false, lens, model }) => {
      const denied = requireWriteSecret();
      if (denied) return denied;

      const result = await hubPost('/api/hub/office/chat', {
        agentId,
        mode,
        message,
        draft,
        evaluate,
        lens,
        model,
      });
      return toolResult(result);
    }
  );

  server.registerTool(
    'request_office_council',
    {
      title: 'Convene Office Council',
      description:
        'Convene an Office Council multi-executive debate session. Synthesizes cross-functional perspectives (Lead + Reviewers), evaluates critical gates (Risk, Scope, Feasibility), and yields actionable consensus with kill criteria.',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        lead: z
          .enum(OFFICE_AGENT_IDS)
          .default('glaceon')
          .describe('Lead C-Level executive managing the agenda.'),
        participants: z
          .array(z.enum(OFFICE_AGENT_IDS))
          .min(1)
          .max(5)
          .default(['jolteon', 'vaporeon'])
          .describe('C-Level reviewers participating in the cross-examination.'),
        agenda: z
          .string()
          .min(1)
          .max(16000)
          .describe('The core agenda, strategic question, or decision under debate.'),
        draft: z
          .string()
          .max(32000)
          .optional()
          .describe('Optional proposal or data draft to critique and align on.'),
        evaluate: z
          .boolean()
          .default(true)
          .describe('If true, enforces composite scoring and critical gate clearance (PASS/REVISE/REJECT).'),
        model: z
          .string()
          .trim()
          .max(100)
          .optional()
          .describe('Optional AI model override for council debate.'),
      },
    },
    async ({ lead = 'glaceon', participants = ['jolteon', 'vaporeon'], agenda, draft, evaluate = true, model }) => {
      const denied = requireWriteSecret();
      if (denied) return denied;

      const result = await hubPost('/api/hub/office/chat', {
        agentId: lead,
        mode: 'council',
        participants,
        message: agenda,
        draft,
        evaluate,
        model,
      });
      return toolResult(result);
    }
  );

  server.registerTool(
    'evaluate_office_proposal',
    {
      title: 'Evaluate Proposal with Harsh Rubrics',
      description:
        'Audit a proposal, code spec, or copy draft against the 3 critical gates: Umbreon (Risk & Truth >=85), Glaceon (DoD & Scope >=80), Vaporeon (Feasibility >=80). Outputs score, penalties, and passing requirements.',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        proposal: z
          .string()
          .min(1)
          .max(32000)
          .describe('The proposal, spec, or draft to evaluate.'),
        focus: z
          .enum(['all', 'risk', 'scope', 'workload', 'roi', 'action'])
          .default('all')
          .describe('Evaluation focus: all (council), risk (umbreon), scope (glaceon), workload (vaporeon), roi (leafeon), action (flareon).'),
        model: z
          .string()
          .trim()
          .max(100)
          .optional()
          .describe('Optional AI model override for evaluation (e.g. gemini-2.5-pro).'),
      },
    },
    async ({ proposal, focus = 'all', model }) => {
      const denied = requireWriteSecret();
      if (denied) return denied;

      let agentId = 'umbreon';
      let mode = 'critique';
      let participants = [];

      if (focus === 'scope') {
        agentId = 'glaceon';
      } else if (focus === 'workload') {
        agentId = 'vaporeon';
      } else if (focus === 'roi') {
        agentId = 'leafeon';
      } else if (focus === 'action') {
        agentId = 'flareon';
      } else if (focus === 'all') {
        agentId = 'umbreon';
        mode = 'council';
        participants = ['glaceon', 'vaporeon'];
      }

      const result = await hubPost('/api/hub/office/chat', {
        agentId,
        mode,
        participants,
        message: `아래 제안/기획안에 대해 가혹한 감점 평가와 게이트 통과 여부를 정밀 감사하라.`,
        draft: proposal,
        evaluate: true,
        model,
      });
      return toolResult(result);
    }
  );
}
