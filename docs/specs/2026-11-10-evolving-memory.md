# Spec: Apex memory that changes as you change

Source idea: archive/chat/35 (Honcho video). Honcho is AGPL-3.0 (checked), so this is Apex's own small version, no Honcho code.

**Outcome:** Apex AI, the Telegram chat and Risk Mitigator share one memory of how Jeremy trades and what he prefers.
When something changes, the newer fact replaces the older one, the old one is kept with its date, and nothing is sent to
any memory service: it lives in Apex's own store (Upstash in his Vercel account, or in-memory locally).

## Requirements
1. **Facts with dates.** Each fact has a topic key (for example `risk-per-trade`), text, source (chat, telegram, risk,
   journal, interview, dream), the date it was learned, and whether it is still current.
2. **Newer replaces older.** Adding a fact with the same key retires the old one (kept in history with "replaced on" date).
   A fact can also be retired without a replacement ("no longer true").
3. **Shared.** The three AI tools add the current facts (newest first, with dates, at most 40) to their instructions, after
   his rules file. House rules still win.
4. **Conversation log.** What Jeremy says in those three tools is logged (last 300 messages, his messages only, trimmed)
   so the nightly job has something to read.
5. **Nightly "dream".** Once a day Claude Haiku 5.5 (cheap) reads the day's log, journal entries, bot trades and the current
   facts, and returns add / replace / retire operations with a reason. Apex applies them. It never deletes history and never
   edits the rules file; instead it can leave a *suggested* rules change that Jeremy applies or ignores on the Journal tab.
6. **You stay in control.** A Memory card on the Journal tab lists current facts with dates and source, shows what each
   replaced, lets him forget a fact, and has "Run dream now". Forget really removes the fact and its history.
7. Non-goals: no third-party memory host, no peer cards for other people, no keys or account numbers stored (the dream
   prompt is told to skip them and a filter drops anything that looks like a key).

## Tests
- [ ] Self-test: add A for key k, add B for k, so current = [B], history shows A replaced on B's date.
- [ ] Self-test: retire k leaves no current fact for k, history kept; forget k removes all of it.
- [ ] Self-test: `applyDream` with add/replace/retire ops changes facts as listed and ignores unknown ops.
- [ ] Self-test: a fact text containing something key-like (sk-..., 0x + 64 hex, a 12-word seed-looking phrase) is dropped.
- [ ] Self-test: `memoryBlock([])` is empty, so prompts are unchanged when there is no memory.
- [ ] API: forget and dream need login (401); GET lists facts.
- [ ] UI check passes on desktop and phone.

## Checkpoints
1. `lib/memory.ts` + self-tests. Commit.
2. Logging + prompt injection in chat, Telegram and Risk Mitigator; dream job + cron + API. Commit.
3. Memory card and suggested-rules box on Journal; UI check. Commit.
