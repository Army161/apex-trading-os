// Telegram notifications + commands (Delta terminal feature). Bot token and chat id live in Vercel env vars only.
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '', CHAT = process.env.TELEGRAM_CHAT_ID || '';
export const telegramOn = Boolean(TOKEN && CHAT);
export type TgButton = { text: string; data: string };
/** Any Bot API method. Used for the halt button: answering the tap and rewriting the message it sat on. */
export async function tgCall(method: string, body: Record<string, unknown>): Promise<any> {
  if (!TOKEN) return null;
  try { const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return r.ok ? (await r.json()).result ?? null : null; } catch { return null; }
}
/** The text of a small text file sent to the bot. Null when it is too large, not text, or cannot be fetched. */
export async function tgFileText(fileId: string, maxBytes = 800_000): Promise<string | null> {
  const f = await tgCall('getFile', { file_id: fileId }); if (!f?.file_path || (f.file_size ?? 0) > maxBytes) return null;
  try { const r = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${f.file_path}`); if (!r.ok) return null; const b = Buffer.from(await r.arrayBuffer()); return b.length > maxBytes || b.includes(0) ? null : b.toString('utf8'); } catch { return null; }
}
export async function sendTelegram(text: string, chat = CHAT, buttons?: TgButton[]) {
  if (!TOKEN || !chat) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true, ...(buttons?.length ? { reply_markup: { inline_keyboard: [buttons.map(b => ({ text: b.text, callback_data: b.data }))] } } : {}) }) });
    return r.ok;
  } catch { return false; }
}
