# Platform Parity Report — Web vs iOS
_Generated 2026-05-27_

---

## TL;DR

The web app is a fully-featured team task management tool. The iOS app is a functional personal-use MVP. The design tokens are almost perfectly aligned; the feature surface is not. Roughly **12 features present on web are absent from iOS**, all team/collaboration features are missing, and 9 API endpoints used by the web have no iOS equivalent at all.

---

## 1 — Information Architecture

### Web
Single-page app with a persistent left sidebar and a content area.

```
sidebar
├── Board selector (My Boards + Shared with me)
├── View tabs: All · Today · Archived · Dashboard
├── Category filters
├── Notifications bell
└── Account menu (theme toggle, sign out)

canvas
└── 3-column Kanban (Backlog | In Progress | Done)
    └── Task card → in-place detail panel slides open
```

Navigation style: modals and in-place panel expansions. Nothing leaves the page.

### iOS
Imperative stack navigation. No persistent sidebar.

```
LoginScreen
└── BoardListScreen
    ├── → DashboardScreen
    ├── → SearchScreen
    ├── → SettingsScreen
    └── → BoardScreen
            └── → TaskDetailScreen (modal)
```

**Why this exists:** React Native has no persistent sidebar pattern. The BoardList screen is the natural equivalent of the web sidebar's "pick a board" section. Every other screen maps 1-to-1 to a web view or modal. There is no meaningful functional gap introduced by the extra navigation level — the user taps a board on iOS just as they click it in the sidebar on web.

---

## 2 — Feature Gaps

### Missing from iOS (features that exist on web)

| Feature | Web location | Priority |
|---|---|---|
| **Task notes / status field** | Expandable textarea below task text in detail panel | Medium |
| **Subtask CRUD** | Add / edit / delete / check subtasks inline | High (display-only on iOS) |
| **Recurrence UI** | 8 options: Daily, Weekly, Monthly, After N days | Medium |
| **Assigned-to user** | @username / email search → assign task to board member | Medium |
| **Calendar fields** | `cal_start`, `cal_end`, "Add to Google Calendar" button | Low |
| **Task sharing** | Share any task into another user's board | Low |
| **Archived tasks** | Dedicated archived view + restore; count badge | Medium |
| **Board member management** | Invite by email / copy-link, revoke invite, remove member | High (collab blocker) |
| **Notifications** | Unread badge, dropdown, mark-all-read | Medium |
| **Delete / rename board** | Board settings modal | Low (API exists, no UI) |
| **Delete category** | Remove category with task reassignment | Low |
| **Import JSON** | Paste a JSON array to bulk-import tasks | Low |

### Present on iOS, not on web

| Feature | Notes |
|---|---|
| Haptic feedback | Light tap on save; error pulse on failure; medium on drag-drop |
| Google Sign-In (native) | Web has OAuth redirect; iOS uses Expo's native token flow |
| Secure keystore | Session in `expo-secure-store`; web uses browser cookie |
| Native action sheet | Move-to-stage uses `ActionSheetIOS`; web uses hover buttons |

---

## 3 — API Coverage

### Web calls 27 operations; iOS implements 18.

**Matched (both clients use these):**

| Endpoint | Web | iOS |
|---|---|---|
| `GET /api/user` | ✓ | ✓ |
| `GET /api/boards` | ✓ | ✓ |
| `GET /api/boards/memberships` | ✓ | ✓ |
| `GET /api/categories?board=N` | ✓ | ✓ |
| `GET /api/tasks?board=N` | ✓ | ✓ |
| `GET /api/dashboard` | ✓ | ✓ |
| `GET /api/search?q=` | ✓ | ✓ |
| `POST /api/boards` | ✓ | ✓ |
| `POST /api/categories` | ✓ | ✓ |
| `POST /api/tasks` | ✓ | ✓ |
| `POST /api/reorder` | ✓ | ✓ |
| `POST /auth/login` | ✓ | ✓ |
| `POST /auth/signup` | ✓ | ✓ |
| `POST /auth/google/mobile` | — | ✓ |
| `POST /auth/logout` | ✓ | ✓ |
| `PUT /api/tasks/:id` | ✓ | ✓ |
| `PUT /api/boards/:id` | ✓ | ✓ `api.renameBoard` (no UI) |
| `PUT /api/user/digest` | ✓ | ✓ |
| `DELETE /api/tasks/:id` | ✓ | ✓ |
| `DELETE /api/boards/:id` | ✓ | ✓ `api.deleteBoard` (no UI) |

**Web-only (no iOS equivalent):**

| Endpoint | Feature |
|---|---|
| `GET /api/tasks?archived=true` | Archived tasks list |
| `GET /api/tasks/count?archived=true` | Archived count badge |
| `GET /api/boards/members` | Board member list |
| `GET /api/notifications` | Notification centre |
| `GET /api/users/search?q=` | @username / email search |
| `POST /api/boards/invite` | Invite by email |
| `POST /api/notifications/read` | Mark all read |
| `POST /api/tasks/:id/share` | Share task to another board |
| `DELETE /api/categories/:id` | Delete category |
| `DELETE /api/boards/invites/:id` | Revoke invite |
| `DELETE /api/boards/members/:userId` | Remove member |

---

## 4 — Design Comparison

### Tokens: nearly identical ✓

| Token | Web CSS var | iOS theme | Match? |
|---|---|---|---|
| Background | `#F1F5F9` | `#F1F5F9` | ✓ |
| Surface | `#FFFFFF` | `#FFFFFF` | ✓ |
| Elevated surface | `#F8FAFC` | `#F8FAFC` | ✓ |
| Border | `#E2E8F0` | `#E2E8F0` | ✓ |
| Primary text | `#0F172A` | `#0F172A` | ✓ |
| Muted text | `#64748B` | `#64748B` | ✓ |
| Accent / primary | `#3B82F6` | `#3B82F6` | ✓ |
| Danger | `#EF4444` | `#EF4444` | ✓ |
| Success | `#22C55E` | `#22C55E` | ✓ |
| Stage: backlog | `#94A3B8` | `#94A3B8` | ✓ |
| Stage: in_progress | `#3B82F6` | `#3B82F6` | ✓ |
| Stage: done | `#22C55E` | `#22C55E` | ✓ |
| Priority: high | `#EF4444` | `#EF4444` | ✓ |
| Priority: medium | `#F59E0B` | `#F59E0B` | ✓ |
| Dark mode | ✓ | ✓ | ✓ |

### Layout patterns: intentionally different

| Aspect | Web | iOS | Verdict |
|---|---|---|---|
| Kanban layout | 3 horizontal columns, side-scroll | 3 vertical sections, sticky headers | Platform-appropriate |
| Board navigation | Sidebar click | Stack push from BoardList | Platform-appropriate |
| Task detail | In-place panel slides out from card | Full modal screen | Functionally equivalent |
| Cross-stage move | "Backlog → / ← Done" footer buttons on card | ActionSheetIOS from "Move →" pill | Equivalent UX |
| Filters | Chip row above Kanban | Chip row above sections | ✓ Identical |
| Category pills | Solid background with white text | Solid background with white text | ✓ Identical |
| Due badges | Overdue/today/soon/normal with same hex fills | Same four states, same hex fills | ✓ Identical |
| Priority left border | 3px left border on card | 3px left border on card | ✓ Identical |

### Visual gaps

| Gap | Web | iOS |
|---|---|---|
| Status/notes preview | "↳ ..." shown inline on card | Nothing |
| Repeat indicator | 🔁 badge | Nothing |
| Task age badge | "today", "1d" | Nothing |
| Subtask inline editing | Full add/remove/check UI in detail | Count badge only ("2/3") |
| Owner avatars / emails | Shown on card | Nothing |

---

## 5 — Recommended Next Steps (by priority)

### High — blocks shared-board use
1. **Board member management screen** — invite, revoke, remove
2. **Subtask CRUD in TaskDetailScreen** — the data model supports it; just needs UI
3. **Archived tasks screen** — tasks exist, `archived_at` column exists

### Medium — improves task richness
4. **Task notes / status field** — one `TextInput` in TaskDetailScreen
5. **Recurrence selector** — 8-option picker, already in types
6. **Notifications bell** — header badge + list screen
7. **Assigned-to user picker** — needs `GET /api/users/search` and a search input

### Low — nice to have
8. **Calendar fields UI** — `cal_start`, `cal_end` date pickers
9. **Delete category** — swipe-to-delete on SettingsScreen category list
10. **Board rename / delete UI** — long-press on board row or settings modal
