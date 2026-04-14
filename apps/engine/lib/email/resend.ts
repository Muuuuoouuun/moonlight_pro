import { textToHtml, type EmailRecipient } from "./format";

interface ResendSendInput {
  dryRun?: boolean;
  to: EmailRecipient[];
  subject: string;
  text: string;
  html?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
}

function resolveResendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.EMAIL_FROM_ADDRESS?.trim();
  const fromName = process.env.EMAIL_FROM_NAME?.trim() || "";
  const replyTo =
    process.env.EMAIL_REPLY_TO_ADDRESS?.trim() ||
    process.env.EMAIL_FROM_ADDRESS?.trim() ||
    "";

  if (!apiKey || !fromEmail) {
    return null;
  }

  return {
    apiKey,
    fromEmail,
    fromName,
    replyTo,
  };
}

function formatFromAddress(fromEmail: string, fromName?: string | null) {
  if (!fromName?.trim()) {
    return fromEmail;
  }

  return `${fromName.trim()} <${fromEmail}>`;
}

export async function sendWithResend(input: ResendSendInput) {
  const config = resolveResendConfig();

  if (!config) {
    return {
      ok: false as const,
      reason: "missing-resend-config",
    };
  }

  const html = input.html?.trim() || textToHtml(input.text);
  const preview = {
    from: formatFromAddress(config.fromEmail, input.fromName || config.fromName),
    to: input.to.map((item) => item.email),
    subject: input.subject,
    replyTo: input.replyTo || config.replyTo || null,
  };

  if (input.dryRun) {
    return {
      ok: true as const,
      provider: "resend",
      messageId: null,
      preview,
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: formatFromAddress(config.fromEmail, input.fromName || config.fromName),
      to: input.to.map((item) =>
        item.name?.trim() ? `${item.name.trim()} <${item.email}>` : item.email,
      ),
      subject: input.subject,
      text: input.text,
      html,
      reply_to: input.replyTo || config.replyTo || undefined,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      ok: false as const,
      reason: detail || `resend-http-${response.status}`,
    };
  }

  const payload = (await response.json().catch(() => ({}))) as { id?: string };

  return {
    ok: true as const,
    provider: "resend",
    messageId: payload.id || null,
    preview,
  };
}
