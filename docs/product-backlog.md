# Product Backlog

_Last updated 2026-05-30._

Living list of planned work. Priorities reflect both research signal (deep-research run, 2026-05-30) and the directions you flagged interest in (#1, #3, #4, #5). Adjust freely — these are proposals, not commitments.

**Priority:** P0 critical/now · P1 high · P2 medium · P3 later.
**Effort:** S (≤1 day) · M (a few days) · L (week+).
**Parity:** every item ships on **both** web (`public/app.js`) + iOS (`ios-app/`) unless noted — see `docs/cross-platform.md`.

---

## P0 — Critical (production)

| # | Item | Why it's P0 | Effort | Status |
|---|---|---|---|---|
| B1 | **Fix iOS TestFlight session/auth** — can't see boards or tasks | Live build is broken. Login succeeds but the next API call 401s ("Could not load boards"); web is unaffected → iOS `X-Session-Cookie` capture/replay path. | TBD (root-cause in progress) | 🔧 Debugging |

> Blocks all iOS work. Fix lands as its own hotfix branch off `main`.
>
> **Update 2026-06-12 (branch `fix/b1-ios-session-diagnostics`):** investigation disproved the leading server-side theory — passport 0.7 saves the session before its login callback, and `tests/ios-session.test.js` (real `connect-pg-simple` on pg-mem) passes, so the server replay flow is sound and B1 isn't reproducible server-side. Shipped: client no longer hard-logs-out on a stray 401, gated `B1_DEBUG` server diagnostics, and a warn-only `SESSION_SECRET` guard. **Next:** flip `B1_DEBUG=1` in Railway + repro on TestFlight to read `[b1-auth]` logs and isolate the real cause. See `docs/architectural-backlog.md` → A1.

---

## P1 — High (lead feature, in flight)

| # | Item | Why | Effort | Status |
|---|---|---|---|---|
| F1 | **AI Quick Capture** — type a sentence → server Claude Haiku parses → editable confirm preview → task | Top research-backed differentiator (Todoist Ramble pattern). Clean parity (server-side). Cost-controlled (cached prompt, max_tokens cap, 50/day limit). | M | 📝 Spec done → plan next. Branch `feat/ai-quick-capture` |

Spec: `docs/superpowers/specs/2026-05-30-ai-quick-capture-design.md`.

---

## P2 — Medium

| # | Item | Why | Effort | Status |
|---|---|---|---|---|
| F2 | **Daily Review Ritual** — guided end-of-day shutdown (review wins, clear loops, set tomorrow's intent) | You flagged interest. Pure UI + light data → trivially cross-platform. Strong retention / "today" surface (LyraFocus). | M | 💡 Idea |
| F3 | **Energy Buckets** — organise by mental energy (Deep Work / Essential / Non-Essential / Habits); reframes the stage concept | You flagged interest. Pure UI + data model, no native deps. Bigger UX shift than F2, so sequence it after. | M–L | 💡 Idea |
| F4 | **AI Smart Breakdown** — one tap on a vague task → LLM-suggested subtasks you accept/edit | Not in your selection, but **architecturally cheap** once F1 ships (reuses the same server LLM path + existing `subtasks` jsonb). OmniFocus "Help Me Plan" pattern. | S–M | 💡 Idea |

---

## P3 — Later

| # | Item | Why here | Effort | Status |
|---|---|---|---|---|
| F5 | **Liquid-Glass Refresh** — iOS-26-aligned depth/material + purposeful motion | You flagged interest, but it's styling (not capability) and the **only parity-risky** item (native glass vs. web `backdrop-filter`); research (NN/g) warns against overdoing translucency/motion in text-heavy UIs. Do it deliberately, late. | M | 💡 Idea |
| F6 | **Voice capture** — speak → transcribe → same parse endpoint | Fast-follow of F1; adds platform-divergent speech handling. | M | ⏸ Deferred from F1 spec |
| F7 | **Assignee extraction in capture** (`assigned_to_user_id`) | Fast-follow of F1; shared-board-only, fiddliest field to match. | S | ⏸ Deferred from F1 spec |
| F8 | **On-device parse on capable iPhones** (Apple Foundation Models) | Drives F1's marginal cost to $0 on iOS; preview-stage RN libs, iOS-26 + A17/M1+ only. Optimization, not capability. | M | 🔮 Future |
| F9 | **Task sharing on iOS** — `POST /api/tasks/:id/share` UI | Known web↔iOS parity gap (server already supports). | S | 🧩 Gap |
| F10 | **JSON bulk import** — paste a JSON array to import tasks | Known parity gap; no API yet. | S | 🧩 Gap |

---

## Prioritisation rationale

- **B1 above everything** — a broken production app beats any new feature.
- **F1 is the lead** because it's already specced, highest research signal, and architecturally clean for parity.
- **F2 before F3** — both are pure-UI and you wanted both, but the Review Ritual is a smaller, additive surface; Energy Buckets reshapes the core board model, so it carries more design + migration risk.
- **F4 (Smart Breakdown)** rides on F1's plumbing, so it's cheap even though you didn't select it — flagged for your call.
- **F5 (Liquid Glass) is P3** despite your interest because it's the riskiest for parity and the research explicitly cautions restraint; best done once the functional features are in.
- **F6–F8** are explicit fast-follows/optimisations of F1.
- **F9–F10** are pre-existing low-priority parity gaps from `docs/platform-parity-report.md`.
