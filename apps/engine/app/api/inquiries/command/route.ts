import { executeInquiryCommand } from '../../../../lib/inquiry-command.ts';
import { handleInquiryCommand } from '../../../../lib/inquiry-http.ts';
import { invokeSupabaseRpc } from '../../../../lib/supabase-rest.ts';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  return handleInquiryCommand(req, {
    sharedSecret: process.env.COM_MOON_SHARED_WEBHOOK_SECRET,
    defaultWorkspaceId: process.env.COM_MOON_DEFAULT_WORKSPACE_ID,
    execute: (command, context) => executeInquiryCommand(command, context, {
      rpc: (name, params) => invokeSupabaseRpc(name, params, { timeoutMs: 10000 }),
    }),
  });
}
