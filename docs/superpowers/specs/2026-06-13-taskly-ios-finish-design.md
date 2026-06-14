# Finish the iOS Taskly Migration — Design Spec

_2026-06-13._

## Overview

The web client is fully on the **Taskly** visual language (coral `#FF6B47`, warm bg, white
rounded cards, soft shadows, continuous-flow kanban). The iOS app (`ios-app/`, Expo SDK 55)
is **half-migrated**: the bottom-tab shell + `TodayScreen`, `BoardScreen`, `ProfileScreen`
read a `tk` (Taskly) sub-palette and look right; the other **9 screens and all shared
primitives** still read the old blue base palette. The app looks split-brained — coral on
the tab home screens, old blue the moment you tap deeper.

This spec finishes the migration: **a full restyle** (not just a recolor) of every remaining
screen onto a single Taskly theme, plus a small reusable component kit, an icon-set swap, and
a user-selectable theme option (which web has and iOS currently lacks).

This is reviewed and endorsed by a staff-engineer architecture review and a product-designer
visual/interaction review (2026-06-13). It builds on the original
`2026-05-31-taskly-redesign-design.md`.

## Goal

Every iOS screen renders in the Taskly language with one source of truth for design tokens, a
thin reusable component kit, and a real (System/Light/Dark) theme option — at full feature
parity with today and with web.

## Scope

**In scope**

1. **Token foundation** — collapse the `tk` sub-palette into the base `Theme`; delete `tk`;
   make Taskly the only palette. Fix the two remaining blue leaks (`priority.high/low`,
   `stage.in_progress`).
2. **Theme system** — a `ThemeProvider` with a **persisted** preference and an **Appearance**
   setting offering **System / Light / Dark** (System = follow the OS, today's behaviour).
3. **Component kit** — `Card`, `SectionCard`, `ScreenHeader` (primary + detail variants),
   `ListRow`, a 44pt-target `Checkbox`, one unified `Chip`, `BrandMark`, an `Icon` wrapper;
   restyled `Button` / `TextField`.
4. **Icon-set swap** — replace emoji/Unicode glyphs (🔔 ⚙ ⋯ ⌕ › ✓) with a real icon set, with
   accessible labels, across all 12 screens.
5. **Full restyle of the 9 lagging screens**: `TaskDetailScreen`, `BoardListScreen`,
   `DashboardScreen`, `BoardMembersScreen`, `ArchivedScreen`, `NotificationsScreen`,
   `SearchScreen`, `SettingsScreen`, `LoginScreen`.
6. **Accessibility fixes** baked into the kit: ≥44pt touch targets (today's 18–26px checkboxes
   fail), the white-on-coral text rule, no state-by-colour-alone.
7. **Consistency cleanup** of the 3 already-migrated screens (shadow/radius/chip/header
   divergence) — folded into building the kit.
8. **Docs** — correct the now-false "tokens identical ✓" claims in `docs/cross-platform.md`
   and `docs/platform-parity-report.md`.

**Deferred (noted as follow-ups, NOT built here)**

- **Native date picker** in TaskDetail — keep the existing free-text `YYYY-MM-DD` fields for
  now. (Recommended follow-up: error-prone text entry → `DateTimePicker`.)
- **Settings/Profile IA consolidation** — keep today's split (Settings = digest; Profile =
  settings list). The new Appearance control is added to Profile's list (see §4), no broader
  consolidation.
- **Notification deep-linking** to the related task — rows stay inert.
- **ProgressRing SVG rewrite**, **app-wide Dynamic Type pass** — polish, later.

## Non-goals

- No server (`server.js`) or web (`public/`) changes. Web is already Taskly; this brings iOS
  up to it. **This is a legitimately iOS-only change** — the cross-platform parity gate is
  satisfied because web already has the feature.
- No new product features or API endpoints. Every existing field/control is preserved.
- No Focus/pomodoro tab (still deferred, per the original redesign spec).

---

## 1. Token foundation

### Decision: collapse `tk` into base, delete the `tk` namespace

The theme today carries two palettes in one object: an old-blue base (`accent: #3B82F6`,
`bg: #F1F5F9`) and a nested Taskly `tk` sub-object (`accent: #FF6B47`). Shared primitives read
base; 4 screens read `tk`. That dual vocabulary is the actual defect.

We make Taskly the base palette and **delete `tk`**. Counterintuitively this is the *safe*
path: once the `tk` field is removed from the `Theme` type, **every one of the ~73 `t.tk.*`
references becomes a `tsc` compile error**, so the compiler enumerates 100% of the migration
work — no greps, no silent misses. Keeping `tk` would institutionalize the two-palette drift
that caused this half-migration in the first place.

**Port the `tk` values into base** (treat the 4 migrated screens as the spec for what the
base values should be) — do NOT keep the blue values. Watch the translucent tokens:
`tk.muted` is `rgba(30,30,46,0.45)` (not solid slate `#64748B`), `tk.line` is
`rgba(30,30,46,0.08)` (not `#E2E8F0`). Mis-porting these shifts the 4 good screens.

### `Theme` end-state

```ts
export interface Theme {
  name: ThemeName;                 // 'light' | 'dark'
  // surfaces
  bg: string;                      // light '#F2F2F7'  dark '#16161D'   (was tk.bg)
  surface: string;                 // card '#FFFFFF'    dark '#1E1E28'   (was tk.card)
  surfaceElevated: string;
  // lines
  border: string;                  // hairline 'rgba(30,30,46,0.08)' / 'rgba(255,255,255,0.08)' (tk.line)
  borderInput: string;             // 1.5px input border
  // text
  text: string;                    // '#1E1E2E' / '#F2F2F7'   (tk.text)
  textMuted: string;               // 'rgba(30,30,46,0.45)' / 'rgba(242,242,247,0.5)' (tk.muted)
  textLight: string;
  // accent
  accent: string;                  // '#FF6B47'               (tk.accent)
  accentHover: string;             // '#E8522E'  — NEW, promoted from tk
  accentText: string;              // '#FFFFFF'
  accentMuted: string;             // 'rgba(255,107,71,0.10)' — re-tinted to coral
  // semantic (NEW explicit tokens; screens use raw hex today)
  danger: string;                  // '#DC2626' / '#F87171'
  success: string;                 // '#16A34A' / '#22C55E'
  warning: string;                 // '#F59E0B'
  overlay: string;                 // 'rgba(30,30,46,0.4)' — modal/sheet scrim
  shadowStyle: {                   // structured RN shadow (replaces tk.shadow CSS string)
    shadowColor: string; shadowOpacity: number; shadowRadius: number;
    shadowOffset: { width: number; height: number }; elevation: number;
  };
  stage: { backlog: string; in_progress: string; done: string };
  priority: { high: string; medium: string; low: string; none: string };
}
```

Plus `radius.pill = 999` and `radius.card = 16` (see §3 / consistency).

### Specific value fixes (blue leaks)

- `priority.high` → `#FF6B47`, `priority.low` → `#9CA3AF` (today `#EF4444` / `#3B82F6`).
  `priority.medium` `#F59E0B` already shared — keep. `priority.none` → `#9CA3AF`.
- `stage.in_progress` is `#3B82F6` (blue) and unused by any migrated screen. Choose a
  Taskly-aligned value (recommend a neutral blue-grey `#64748B` or coral-family) so the
  rebuilt Board/Dashboard/Search stage badges don't re-introduce blue. **Locked: `#64748B`**
  (neutral; coral is reserved for the accent/active role).
- Drop `tk.shadow` (a CSS string RN can't consume) in favour of `shadowStyle` above.

### Docs to update (same PR as the foundation)

- `docs/cross-platform.md` Design Tokens table — repoint to coral values; keep the web CSS-var
  ↔ iOS theme-key mapping accurate.
- `docs/platform-parity-report.md` §4 — "Tokens: identical ✓" is currently false; correct it.

---

## 2. Theme system (System / Light / Dark)

Today `useTheme()` simply returns `useColorScheme() === 'dark' ? dark : light`
([theme/index.ts](../../../ios-app/src/theme/index.ts)) and `RootNavigator` reads
`useColorScheme()` directly. There is **no persistence and no user override** — iOS users are
stuck on whatever their OS is set to. Web, by contrast, has a persisted manual toggle
(`localStorage` `data-theme`, an Appearance row). This is a parity gap.

**Design:**

- A `ThemeProvider` context (new `ios-app/src/theme/ThemeProvider.tsx`) holding
  `preference: 'system' | 'light' | 'dark'` and a `setPreference(p)` setter.
- **Persistence via `expo-secure-store`** (already a dependency — no new package). Key e.g.
  `taskly.themePref`. Load on mount; default `'system'` (preserves today's behaviour for
  existing users).
- `useTheme()` resolves: `preference === 'system' ? (useColorScheme() ?? 'light') : preference`,
  then returns the matching palette.
- `RootNavigator`'s direct `useColorScheme()` read is replaced with the resolved theme from
  context (so the nav chrome obeys the override too).
- **Appearance control:** add an **"Appearance"** row to Profile's settings list (it has none
  today — Profile currently lists Notifications/Export/About/Sign out). The row opens a small
  picker (segmented control or three selectable `ListRow`s) for **System / Light / Dark**, with
  the active option marked by a coral ✓ (icon + position, not colour alone). This matches
  web's "Appearance" placement without requiring the deferred Settings/Profile consolidation.
- Both palettes already have light + dark Taskly values to port (light `tk` + dark `tk`).

---

## 3. Component kit (build first — screens become thin)

The 3 migrated screens each hand-roll their own header and card; that duplication is why the
9 laggards drifted. Extract the kit the good screens *imply* but never abstracted, in
`ios-app/src/components/`. **After this work, no screen references the old blue tokens** — a
clean grep for `t.accent`/`t.surface`/`t.border` (the blue set, now removed) is the "are we
done?" check.

### `Card`
White container. `backgroundColor: surface`, `borderRadius: radius.card` (16),
`padding: spacing.lg` (16), `shadowStyle` from theme. **No border in light** (the soft shadow
is the separator). **In dark**, add `borderWidth: 1, borderColor: border` (shadows don't read
on `#16161D`). Props: `padded?` (default true), `onPress?` (pressed → deeper shadow), `style?`.

### `SectionCard`
A `Card` that groups `ListRow`s with internal hairline dividers (the Profile/Settings grouped
list pattern). Optional uppercase **eyebrow** header (`font.size.xs`, bold, `letterSpacing 0.7`,
`textMuted`, padding `lg lg sm`). `overflow: 'hidden'` so row dividers clip to the radius;
rows own their padding. Single home for "grouped list".

### `ScreenHeader`
Two named variants (Taskly genuinely has two header types):
- **`variant="primary"`** (tab roots): optional eyebrow + big title (`font.size.xxl`, bold) on
  the left; right-side `actions` slot (search/bell cluster, optional `ProgressRing`). Horizontal
  padding standardized (see consistency: **20**). `marginBottom: spacing.xl`.
- **`variant="detail"`** (pushed screens): 56px bar. Left = a 44×44 back control (real chevron
  icon + `accessibilityLabel="Back"`), center = truly-centered title (`font.size.lg`, bold),
  right = optional single action (e.g. "Save", "Mark all read"). Bottom hairline `border`.
- Props: `title`, `eyebrow?`, `variant`, `onBack?`, `actions?`, `progress?`.

### `ListRow`
The workhorse. `minHeight: 56`, `paddingVertical: spacing.md`, `paddingHorizontal: spacing.lg`,
`alignItems: center`, `gap: spacing.md`. Slots: `leading?` (avatar / dot / icon / TagChip),
`title` (`font.size.md`, `text`, medium), `subtitle?` (`font.size.sm`, `textMuted`),
`trailing?` (chevron / check / value / action). Props: `onPress`, `destructive?` (title →
`danger`), `selected?` (trailing coral ✓), `accessory?: 'chevron'|'check'|'none'|ReactNode`.

### `Checkbox` (44pt target)
Today's circular checkboxes are 18–26px — **below the 44pt minimum** (WCAG 2.5.5 / Apple HIG).
A single kit `Checkbox`: visual 22–24px circle, border = priority/semantic colour, coral (or
success) fill + ✓ glyph when checked, wrapped in a 44×44 hit area (`hitSlop`/padding).
`accessibilityRole="checkbox"`, `accessibilityState={{ checked }}`. Used by Today rows,
TaskCard, and TaskDetail subtasks.

### `Chip` (unify the 3 today)
Today's filter chip, Board's filter pill, and TaskDetail's chip are three implementations.
One `Chip`, two modes:
- `filter` (pill `radius.pill`): inactive `bg rgba(30,30,46,0.06)`, `fg textMuted`; active
  `bg accent`, `fg #fff`. (Adopt Today's solid-fill — higher contrast than Board's bordered
  variant.)
- `choice` (TaskDetail stage/priority/category/recurrence): same shape; active uses the passed
  semantic colour as fill. `accessibilityState={{ selected }}`.

### `BrandMark`
Shared coral rounded-square app-icon tile (✓) + "Taskly" wordmark. Promote BoardList's existing
`logoIcon` tile to this shared component; used on Login and BoardList.

### `Icon` (icon-set swap — see §4)
A thin wrapper over the chosen icon library exposing a Taskly-named set
(`search`, `bell`, `settings`, `more`, `chevron`, `check`, `mail`, `repeat`, …), default colour
`textMuted`, sized to 44×44 frames where tappable, each with an `accessibilityLabel`. The bell's
unread-badge logic moves into this wrapper.

### `Button` / `TextField` — restyle, don't rebuild
- **Button**: repoint to coral; variants `primary` (`bg accent`, `#fff`), `secondary`
  (`bg surface`, `border`, `text`), `ghost` (`fg accent`), **new `destructive`** (`fg danger`,
  transparent) for Archive/Delete (today they use `ghost` and under-signal). Height 48 (≥44).
  `accessibilityRole="button"`.
- **TextField**: repoint surfaces/borders to coral set; **add a focus state** (coral border on
  focus — web has `:focus-visible` coral, iOS has none today). Height 44.

---

## 4. Icon set

Replace emoji/Unicode glyphs (🔔 ⚙ ⋯ ⌕ › ✓ ✉ 🔁) — they render as inconsistent full-colour
emoji, clash with the monochrome `textMuted` intent, don't recolor for dark mode, and carry no
accessible labels.

**Recommendation: `lucide-react-native`** (SVG-based via `react-native-svg`, which is **already
a dependency**). Rationale: SVG, so **no native module → OTA-safe** (doesn't by itself force a
build); crisp + recolorable; visually aligned with Taskly; cross-platform. **Alternative:**
`@expo/vector-icons` (Feather ≈ Lucide), font-based, also OTA-safe. Final pick confirmed in a
10-minute spike during PR 1; either is acceptable. (`expo-symbols`/SF Symbols is rejected — it's
a native module that forces a build and renders iOS-only.)

All icon usage goes through the `Icon` wrapper (§3) so the library is swappable and labels are
enforced. Icon map (initial): `magnifyingglass`→search, `bell`→notifications, `settings`→gear,
`more-horizontal`→overflow, `chevron-right`→row accessory, `check`→selected, `mail`→invite,
`repeat`→recurrence.

---

## 5. Screen-by-screen specs

Every screen preserves all current fields/controls. Severity tags: **[Crit]** broken/inaccessible,
**[Ser]** off-brand/usability, **[Min]** polish.

### 5.1 TaskDetailScreen (richest; create/edit for every field)
- **Header:** `ScreenHeader variant="detail"` — left **Cancel** (ghost), center "New task" /
  "Edit task", right **Save** (coral enabled / `textMuted` disabled).
- **Body:** stacked `SectionCard`s on `bg` (replaces one flat scroll):
  - **Content** — "What needs doing?" (multiline `TextField`) + "Notes".
  - **Organize** — Stage (`Chip choice`, stage colours), Priority (priority colours,
    `none`=grey), Category (`Chip choice` + inline "＋ New" → name field + colour palette + Add),
    Recurrence.
  - **Schedule** — Due date + Calendar start/end. **Kept as free-text `YYYY-MM-DD`** (native
    picker deferred). Keep autocapitalize/autocorrect off.
  - **Assign** — user-search `TextField` → results as `ListRow`s (avatar initials); selected →
    pill + Remove.
  - **Subtasks** — kit `Checkbox` rows + add-row; header shows `(done/total)`.
  - **Destructive footer** (edit only) — "Archive task" (`Button secondary`), "Delete task"
    (`Button destructive`).
- **States:** save error → `Alert` (Taskly voice); new vs edit (hide footer when new); empty
  subtasks → just add-row.
- **A11y:** subtask checkbox via kit 44pt `Checkbox` **[Crit fixed]**; selected colour swatch
  gets a white ✓ (not border-only) **[Ser]**; choice chips `accessibilityState`.

### 5.2 BoardListScreen (board switcher; owned + shared)
- **Header [Ser, worst today]:** the old "Todo" lockup + ⚙ → `ScreenHeader variant="primary"`,
  title "Boards", actions = search + bell (unread badge) + settings icon. Greeting
  "Hi {name} 👋" as eyebrow/subhead.
- **Body:** Dashboard entry → `Card` (onPress, eyebrow "OVERVIEW" + "Dashboard →"); **My Boards**
  + **Shared with me** → two `SectionCard`s of `ListRow`s (leading colour dot, title, subtitle =
  owner for shared, trailing chevron). Long-press → rename/delete action sheet (owner only) +
  `accessibilityHint` (long-press is invisible). **+ New board** → `Button primary` + inline
  create `Card`. **Sign out** → destructive `ListRow` inside a trailing `SectionCard`.
- **States:** loading → 3 skeleton rows; empty → "No boards yet — create your first board to
  start organizing tasks."; error → inline card "Couldn't load your boards. Pull to refresh.";
  unread bell → `accessibilityLabel="Notifications, N unread"`.

### 5.3 DashboardScreen (stats)
- **Header:** `ScreenHeader variant="detail"` "Dashboard".
- **Body:** Open / In-progress / Overdue → stat `Card`s (reuse Profile's `StatBox` styling so
  the two stats surfaces match), values in semantic colour (overdue `danger`, in-progress the
  new neutral stage colour — **no blue**). "Last 7 days" → `SectionCard` bar chart (bars
  `accent`). By-priority / by-category → `SectionCard`s of `ListRow`s (leading colour dot,
  trailing count).
- **States [Ser]:** screen renders zeros immediately today — show a spinner/skeleton until data
  resolves (don't show "0 Open" while loading). Empty (new user) → "No activity yet. Complete a
  few tasks and your trends will show up here."
- **A11y:** each bar `accessibilityLabel="{date}: {n} completed"`.

### 5.4 BoardMembersScreen
- **Header:** `ScreenHeader variant="detail"` "Members" (board name as eyebrow).
- **Body:** Members → `SectionCard` of `ListRow`s (avatar initials in `accentMuted`+`accent`,
  title = name, subtitle = email, trailing = **Remove** owner-only, `danger`, 44pt). Pending
  invites → `SectionCard` (✉ leading, "Invite pending", "Revoke"). Invite → `TextField` (email)
  + `Button primary` "Send invite" + hint, in a `Card`.
- **States:** loading skeleton; empty → "Just you so far. Invite someone to share this board.";
  invite success/error → `Alert` (Taskly voice); non-owner hides invite + Remove (already gated).
- **A11y:** Remove/Revoke ≥44pt + `accessibilityLabel="Remove {name}"`.

### 5.5 ArchivedScreen
- **Header:** `ScreenHeader variant="detail"` "Archived".
- **Body:** archived tasks as `Card`s — strikethrough title (`textMuted`), meta = stage badge +
  "Archived {date}", actions **Restore** (positive: coral-tinted / `Button`) + **Delete**
  (`destructive`). Distinguish by **weight, not colour alone** [Ser].
- **States:** loading skeleton; empty → standard centered empty state "Nothing archived";
  confirms via `Alert`.
- **A11y:** action buttons ≥44pt (today ~28px).

### 5.6 NotificationsScreen
- **Header:** `ScreenHeader variant="detail"` "Notifications", right action "Mark all read"
  (coral) when `unread > 0`.
- **Body:** `SectionCard` of `ListRow`s — title = message (semibold if unread), subtitle =
  `@from · {date}`, leading = unread **coral dot** + subtle `accentMuted` row bg. **Multi-signal
  unread** (dot + weight), not colour alone [Ser, already partly done — preserve].
- **States:** loading spinner (centered); empty → "You're all caught up — mentions, invites, and
  assignments show up here."; mark-all in progress → "…".
- **A11y:** unread `accessibilityLabel="Unread: {message}, {time}"`. Rows stay inert (deep-link
  deferred).

### 5.7 SearchScreen (global results)
- **Header:** `ScreenHeader variant="detail"` "Search" + a prominent search `TextField` (leading
  search icon, trailing spinner).
- **Body:** results as `ListRow`/`Card` — title = task text, subtitle = `board · due`, category
  rendered as a **`TagChip`** (Taskly pattern), trailing = stage badge.
- **States:** idle (<2 chars) → centered hint "Type at least 2 characters to search."; loading →
  spinner; no results → "No tasks match "{query}".";  **error → "Search failed. Try again."**
  (today an `ApiError` silently shows "no results" — split error from empty) [Ser].
- **A11y [Ser]:** stage badge white-on-`#94A3B8` ≈ 2.3:1 **fails** — use tinted-bg + colored-text
  (Board's treatment) instead of white-on-stage-colour.

### 5.8 SettingsScreen
- **Header:** `ScreenHeader variant="detail"` "Settings".
- **Body:** keep today's responsibility (email digest) — **EMAIL DIGEST** `SectionCard` with
  Off/Daily/Weekly/Fortnightly as selectable `ListRow`s (active = coral ✓), descriptive hint
  above, optimistic update + revert-on-error (preserve). (Broader Settings/Profile consolidation
  is deferred; the new **Appearance** theme control lives on Profile per §2.)
- **A11y:** selected row `accessibilityState={{ selected }}` + label "Daily, selected".

### 5.9 LoginScreen (front door; highest brand priority)
- **Brand [Ser]:** replace the "Todo" wordmark with `BrandMark` (coral tile ✓ + "Taskly"),
  centered, generous top margin. Subtitle "Welcome back" / "Create your account" (`textMuted`).
- **Form in a `Card`:** `TextField`s → `Button primary` "Sign in" / "Create account" (coral).
  Divider "or". Google → `Button secondary` ("Continue with Google", G mark). Mode toggle =
  ghost button.
- **Errors:** field-level for auth ("Wrong email or password") + a **top-level banner** for
  network/Google errors (today Google errors mis-attach to the password field).
- **Brand sweep:** every user-facing "Todo" → "Taskly".

---

## 6. Cross-cutting accessibility

- **White-on-coral:** `#fff` on `#FF6B47` = **3.08:1** — passes AA only for **bold/large** text.
  Safe for buttons, chips, badges (bold ≥14px) and the ProgressRing % — **never** small/regular
  white body text on coral.
- **44pt targets:** fixed centrally via the kit `Checkbox`, `Icon` (44×44 frames), `ListRow`
  (minHeight 56), `Button` (48), and ≥44pt action buttons on Archived/Members.
- **No colour-alone:** priority dot → include priority in the row's `accessibilityLabel`; swatch
  selection → ✓; unread → dot + weight; stage → text label.
- **Dynamic Type:** a full pass is deferred, but new kit components should not hard-clip — allow
  font scaling on labels and cap scaling on big numeric stats. (Tracked as follow-up.)

---

## 7. Consistency cleanup (the 3 migrated screens)

Fold these into building the kit so the 9 new screens don't inherit three different "right"
answers:
- **Shadow** — Today/Profile use `0.05/4`, stat boxes `0.04/3`; web is one token. Standardize to
  `shadowStyle` (`0.06 / 4 / {0,1}`).
- **Card radius** — screens use 14, web uses 16, TaskCard uses 10. Standardize to **16**
  (`radius.card`) to match web; repoint TaskCard unless its tighter radius is intentional.
- **Filter chip** — unify to one `Chip` (solid-fill active).
- **Header padding** — Today/Profile 24, Board 16. Standardize tab-root content padding to **20**.
- **Icons** — emoji → icon set (§4) across all screens.

---

## 8. Sequencing, PRs, verification

### `main` is prod — but iOS is not auto-deployed
Per `docs/ios-app.md`, nothing in `ios-app/` is built or deployed by Railway; TestFlight builds
and OTA updates are manual. So merging intermediate iOS states to `main` ships nothing to users.
The discipline is: **do not cut a build/OTA from a half-migrated `main`.**

### PR plan (stack of small, individually-green PRs)
- **PR 1 — Foundation:** flip base tokens to Taskly (port `tk` values), delete `tk`, repoint the
  4 migrated screens + `RootNavigator` to base tokens, add the kit (`Card`, `SectionCard`,
  `ScreenHeader`, `ListRow`, `Checkbox`, `Chip`, `BrandMark`, `Icon`), restyle `Button`/
  `TextField`, add the `ThemeProvider` + persistence + Appearance row, swap the icon set, update
  the two docs. **Acceptance: the 4 already-migrated screens look identical before/after** (a
  near-pure refactor) and a `tk` grep returns nothing. Riskiest PR (regression on the 4 good
  screens) → first and isolated.
- **PR 2…N — one screen (or tight cluster) per PR**, in product-designer priority order:
  1. LoginScreen (front-door brand) + BoardListScreen (worst header)
  2. TaskDetailScreen + NotificationsScreen + SearchScreen (daily surfaces)
  3. DashboardScreen + BoardMembersScreen + ArchivedScreen + SettingsScreen
- **Release:** one fresh `eas build` for the milestone after the last screen PR lands, from a
  coherent `main`. OTA (`eas update`) reserved for follow-up polish. **Do not bump `app.json`
  `version`** (it forks `runtimeVersion` and breaks OTA reach to existing testers).

### Verification (per `CLAUDE.md` + `docs/ios-app.md`)
- **`tsc --noEmit`** — the primary safety net: deleting the `tk` type surfaces every stale
  reference. Make it a required step.
- **`npm test`** — incl. `__tests__/nav-version-alignment.test.ts` + `__tests__/boot.test.tsx`
  (mounts the real navigator/screens; catches `tk`-deletion runtime breakage on reachable
  screens).
- **`npx expo-doctor`**.
- **`npx expo export --platform ios`** — before any build *and* before any OTA push (catches
  Metro-resolution breaks the mocked jest suite can't).
- **Simulator** — the real acceptance gate for a restyle: walk all 13 screens in **both** themes
  (and exercise the System/Light/Dark override) against the Taskly look.
- **One tiny `theme-contract.test.ts`** (~10 lines): asserts `accent === '#FF6B47'` in light and
  the `tk` field is gone — documents intent, catches an accidental revert to blue.
- **Skip (YAGNI):** snapshot tests (a restyle changes every screen by design), visual-regression
  CI infra, per-token unit tests.

---

## 9. Risks & mitigations

| Risk | Sev | Mitigation |
|---|---|---|
| Repointing the 4 migrated screens regresses them (translucent `tk.muted`/`line` ≠ solid base) | High | Port `tk` values into base, not blue. PR 1 acceptance = no visual change on the 4 screens; screenshot before/after. |
| Missed `t.tk.*` reference after deleting `tk` | Med | Deleting the `tk` type makes every reference a `tsc` error; `boot.test` covers reachable runtime cases. |
| `priority`/`stage` still blue-era, re-introducing blue | Med | Fix `priority.high/low` + `stage.in_progress` in PR 1 before any screen rebuild references them. |
| Dark mode drift (perfect light, forgotten dark) | Med | Verify every screen in both themes + the override in the simulator; port `dark` values as carefully as light. |
| Theme override doesn't reach nav chrome | Med | Replace `RootNavigator`'s direct `useColorScheme()` with the resolved context theme. |
| Cutting a release from a half-migrated `main` | Med | iOS isn't auto-deployed; gate = "no `eas build`/`update` until the last screen PR lands." |
| Icon library choice forces a build / breaks OTA | Low | Prefer SVG/font lib (Lucide via existing `react-native-svg`, or `@expo/vector-icons`) — OTA-safe; `expo-symbols` rejected. Confirm in PR-1 spike; run `expo export` before any OTA. |
| Docs claiming "tokens identical ✓" stay false | Low | Update both docs in PR 1. |

---

## Open follow-ups (post-migration backlog)

- Native `DateTimePicker` in TaskDetail (replace free-text dates).
- Settings/Profile IA consolidation into a single settings home.
- Notification rows deep-link to their task.
- ProgressRing SVG rewrite; app-wide Dynamic Type pass.
- Consider adding a "System" option to the **web** theme toggle for full tri-state parity.
