export interface EmailRecipient {
  email: string;
  name?: string | null;
}

export interface EmailAddress {
  email: string;
  name?: string | null;
}

function normalizeLineBreaks(value: string) {
  return value.replace(/\r\n?/g, "\n");
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function textToHtml(text: string) {
  return escapeHtml(normalizeLineBreaks(text)).replace(/\n/g, "<br />");
}

export function encodeMimeHeader(value: string) {
  if (!/[^\x20-\x7E]/.test(value)) {
    return value;
  }

  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function formatDisplayAddress(email: string, name?: string | null) {
  if (!name?.trim()) {
    return email;
  }

  return `${encodeMimeHeader(name.trim())} <${email}>`;
}

function formatRecipientList(recipients: EmailRecipient[]) {
  return recipients.map((item) => formatDisplayAddress(item.email, item.name)).join(", ");
}

export function buildMultipartAlternativeEmail({
  from,
  to,
  replyTo,
  subject,
  text,
  html,
}: {
  from: EmailAddress;
  to: EmailRecipient[];
  replyTo?: string | null;
  subject: string;
  text: string;
  html: string;
}) {
  const boundary = `com-moon-${Date.now().toString(36)}`;
  const lines = [
    `From: ${formatDisplayAddress(from.email, from.name)}`,
    `To: ${formatRecipientList(to)}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizeLineBreaks(text),
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
  ];

  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}
