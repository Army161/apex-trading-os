// What an agent job reaches the outside through, on the dashboard: the same halt the Halt button uses, and Telegram.
import { deps } from './api/deps';
import { sendTelegram } from './telegram';
import type { AgentIo } from './agentjobs';
export const agentIo: AgentIo = { halt: (by, reason) => deps.halt(by, reason), notify: text => sendTelegram(text), now: Date.now };
