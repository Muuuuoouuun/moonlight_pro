import { executeInquiryCommand } from '../../../../lib/inquiry-command.ts';
import { handleInquiryIntake } from '../../../../lib/inquiry-http.ts';
import { invokeSupabaseRpc } from '../../../../lib/supabase-rest.ts';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  return handleInquiryIntake(req, {
    sourceConfig: process.env.COM_MOON_INQUIRY_SOURCES,
    execute: (command, context) => executeInquiryCommand(command, context, {
      rpc: (name, params) => invokeSupabaseRpc(name, params, { timeoutMs: 10000 }),
    }),
  });
}
