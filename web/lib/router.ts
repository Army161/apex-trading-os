// Model routing design (archive/chat/68 model-agnostic workspace, chat/69 free-model gateway). Pure, no network, nothing installed.
// The dashboard chat keeps an ordered list of models. pickModel() chooses the next one by priority or round-robin, skips models
// that are down or over their key's spend cap, and can be held to free models only. gateway.ts stays the one place that calls a
// provider; today that is Claude only, until Jeremy picks extra providers (Ollama, NVIDIA NIM, DeepSeek are noted candidates).
// Keys live in env vars. Free tiers are each provider's own terms and can change at any time.
export type ModelEntry = { id: string; provider: 'anthropic' | 'openrouter' | 'nvidia' | 'deepseek' | 'ollama'; free: boolean; keyEnv: string; capUsd: number };
export type RouteState = { spentUsd: Record<string, number>; down: Record<string, number>; next: number };

/** Next model to try. `down[id]` = time until which the model is skipped (after an error or rate limit). Returns null when none fit. */
export function pickModel(list: ModelEntry[], st: RouteState, o: { strategy?: 'priority' | 'round-robin'; freeOnly?: boolean; now?: number; env?: Record<string, string | undefined> } = {}) {
  const now = o.now ?? Date.now(), env = o.env ?? process.env;
  const ok = (m: ModelEntry) => (!o.freeOnly || m.free) && Boolean(env[m.keyEnv] || m.provider === 'ollama') && (st.down[m.id] ?? 0) <= now && (st.spentUsd[m.keyEnv] ?? 0) < m.capUsd;
  if (o.strategy === 'round-robin') {
    for (let k = 0; k < list.length; k++) { const j = (st.next + k) % list.length; if (ok(list[j])) return { model: list[j], next: (j + 1) % list.length }; }
    return null;
  }
  const m = list.find(ok); return m ? { model: m, next: st.next } : null;
}
/** After an error or rate limit, skip the model for `ms` (default 5 minutes). */
export const markDown = (st: RouteState, id: string, ms = 3e5, now = Date.now()): RouteState => ({ ...st, down: { ...st.down, [id]: now + ms } });
