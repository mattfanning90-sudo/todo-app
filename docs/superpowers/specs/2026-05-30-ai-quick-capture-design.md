# AI Quick Capture — Design Spec

_2026-05-30 · Feature branch: `feat/ai-quick-capture`_

## Summary

A natural-language quick-capture feature for both clients: the user types one sentence into a sticky quick-add bar, the server parses it with a small cloud LLM (Claude Haiku) into a structured task, and the client shows an **editable confirm preview** before the task is created. Grounded in the proven Todoist Ramble / OmniFocus "Help Me Plan" pattern (see `docs/` research, 2026-05-30).

Scope for this branch is **text-only, confirm-before-create**. Voice input, AI smart-breakdown, energy buckets, daily review ritual, and a Liquid-Glass restyle are explicitly **out of scope** here and become their own follow-up branches.

## Goals

- One sentence → structured task (title, due date, priority, category, stage) on **both** web and iOS, identically.
- Cost-controlled and bounded so it is safe to expose to other users.
- Never silently produce bad data — low-confidence fields are left blank and filled by the user via the confirm preview.
- Capture never hard-fails — any parse failure falls back to creating a plain task from the raw text.

## Non-goals (this branch)

- Voice / speech input (fast-follow).
- `assigned_to_user_id` extraction (fast-follow; shared-board-only, fiddliest match).
- On-device (Apple Foundation Models) parsing (future iOS cost optimization).
- Auto-creating categories the user doesn't already have.

## Architecture & data flow

The parse step is a **pure endpoint that does not create the task**. The client parses, shows the editable preview, then calls the **existing** `POST /api/tasks` on confirm. Task-creation logic is untouched; the parser is isolated.

```
sticky quick-add bar (web public/app.js · iOS BoardScreen)
        │  { text: raw sentence, board: <id> }
        ▼
POST /api/capture/parse        ← only new endpoint (server.js)
        │  server injects context: today + tz, stage enum,
        │  priority enum, THIS board's categories (id + name)
        ▼
Claude Haiku (@anthropic-ai/sdk, tool-use forced JSON, cached system prompt)
        │  { text, due_date, cal_start, cal_end, priority, category_id, stage }
        ▼
client renders editable confirm preview
        │  user edits chips, confirms
        ▼
POST /api/tasks   ← existing create path, unchanged
```

Single source of truth stays in `server.js`; both clients call the same endpoint, so behaviour is identical. This sidesteps the research's on-device-iOS-only asymmetry entirely.

**Alternative considered:** a single endpoint that parses *and* creates. Rejected — it entangles the LLM with the create path and makes the confirm-preview edit awkward.

## The parse endpoint

`POST /api/capture/parse` — board-scoped, CSRF-guarded (`X-Requested-With: fetch`), session-authenticated like every other API route.

**Request:** `{ text: string, board: number }`

**Response (success):**
```jsonc
{
  "parsed": true,
  "text": "Submit BAS to accountant",   // cleaned title, date/priority/category words stripped
  "due_date": "2026-06-05",              // YYYY-MM-DD or null
  "cal_start": null,                      // set only if a time was given
  "cal_end": null,
  "priority": "high",                     // none | low | medium | high
  "category_id": 12,                      // matched to an existing board category, else null
  "stage": "backlog"                      // backlog | in_progress | done (default backlog)
}
```

**Response (no parse — client falls back to a plain task):**
```jsonc
{ "parsed": false, "reason": "rate_limited" | "unavailable" }
```

### Cost controls

- **Model:** Claude Haiku via `@anthropic-ai/sdk`, **tool-use** to force the JSON schema (no regex on model output).
- **Prompt caching:** the system prompt (instructions + schema + stage/priority enums + the board's category list + today's date) is marked cacheable — full price is paid only for the ~30-token sentence + small output.
- **`max_tokens` cap** ~256.
- **Per-user daily limit:** hard cap (default **50/day**) stored durably in a small `ai_usage` counter so it survives restarts. Over the limit → `{ parsed: false, reason: "rate_limited" }`.
- **Graceful degradation:** missing `ANTHROPIC_API_KEY`, model error, or timeout → `{ parsed: false, reason: "unavailable" }`.

### Parse contract (data-quality rules)

- `text` → cleaned title with date/priority/category words removed.
- `due_date` (`YYYY-MM-DD`); if a time is present, also set `cal_start` / `cal_end`.
- `priority` ∈ `none|low|medium|high`.
- `category_id` → matched **only** against the board's existing categories by name. **No silently-created categories.** No match → `null`.
- `stage` ∈ `backlog|in_progress|done`, default `backlog`.
- **Never guess:** anything low-confidence is returned blank for the user to fill.

## Web (`public/app.js`)

- Sticky quick-add bar pinned above the 3-column board; `/` focuses it.
- Enter → call `/api/capture/parse` → render confirm preview as an in-place panel with editable chips, reusing the existing priority / category / stage pickers.
- Confirm → existing create path → instant-paint cache invalidation.
- All handlers via `data-action` delegation (no inline `onclick`, per CSP — see `docs/frontend.md`).

## iOS (`ios-app/`)

- Sticky input above the stages on `BoardScreen`.
- Submit → `api.parseCapture()` (new method in `api/client.ts`; types in `api/types.ts`) → `ConfirmCaptureSheet` modal with the same editable chips.
- Confirm → existing create path → `useFocusEffect` refresh.
- Loading + error states via `Alert`. Chips use the shared design tokens (`docs/cross-platform.md`).

## Error handling

- Parse failure / timeout / rate-limit / no key → create a plain task from the raw text with a subtle "added as-is" note.
- Misparse → user edits the chips before confirming (the whole point of the confirm preview).

## Testing (`docs/testing.md` — Vitest + pg-mem)

- **The LLM is mocked** — no real API calls in tests.
- Cover: category-name matching, date → field mapping, the 50/day rate-limit cap, and the graceful fallback when the key is absent.
- Web/iOS confirm UI verified manually.

## Schema / migrations

- New durable counter for the per-user daily cap (`ai_usage`, or equivalent columns) via an idempotent migration (`IF NOT EXISTS`), following `docs/data-model.md` migration rules. No changes to `tasks`.

## Environment

- `ANTHROPIC_API_KEY` added to Railway env (see `docs/operations.md`). Feature degrades gracefully if absent.

## Privacy

- The captured sentence is sent to Anthropic for parsing. Add a one-line disclosure near the quick-add bar.

## Cross-platform parity checklist

Apply `docs/cross-platform.md` checklist during implementation: server endpoint → web → iOS (types → client → screen), shared design tokens, CSRF guard, mobile session header where relevant.

## Open follow-ups (separate branches)

- Voice capture (speech → transcript → same parse endpoint).
- `assigned_to_user_id` best-effort extraction on shared boards.
- AI smart-breakdown, energy buckets, daily review ritual, Liquid-Glass restyle.
- On-device parse path on capable iPhones (drives marginal cost to zero on iOS).
