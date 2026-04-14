export interface TelegramUser {
  id?: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id?: number;
  type?: string;
  title?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id?: number;
  text?: string;
  chat?: TelegramChat;
  from?: TelegramUser;
}

export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

export interface TelegramCommand {
  name: string;
  raw: string;
  args: string[];
}

export function getTelegramMessage(update: TelegramUpdate): TelegramMessage | null {
  return update.message ?? update.edited_message ?? update.channel_post ?? null;
}

export function getTelegramText(update: TelegramUpdate): string | null {
  return getTelegramMessage(update)?.text?.trim() || null;
}

export function parseTelegramCommand(text: string | null): TelegramCommand | null {
  if (!text || !text.startsWith("/")) {
    return null;
  }

  const [rawCommand, ...args] = text.split(/\s+/);
  const commandName = rawCommand.slice(1).split("@")[0]?.trim().toLowerCase();

  if (!commandName) {
    return null;
  }

  return {
    name: commandName,
    raw: rawCommand,
    args,
  };
}
