// Telegram notifications + commands (Delta terminal feature). Bot token and chat id live in Vercel env vars only.
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '', CHAT = process.env.TELEGRAM_CHAT_ID || '';
export const telegramOn = Boolean(TOKEN && CHAT);
export async function sendTelegram(text: string, chat = CHAT) {
  if (!TOKEN || !chat) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }) });
    return r.ok;
  } catch { return false; }
}
