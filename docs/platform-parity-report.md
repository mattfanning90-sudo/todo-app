# Platform Parity Report — Web vs iOS
_Generated 2026-05-27 · Updated 2026-05-27 (TDD sprint)_

---

## TL;DR

The web app is a fully-featured team task management tool. As of the TDD sprint, the iOS app has reached near-full feature parity. All high- and medium-priority gaps have been closed. One low-priority feature (task sharing) and a few minor UI embellishments remain.

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
└── BoardListScreen (bell badge, search, settings)
    ├── → NotificationsScreen               ← NEW
    ├── → DashboardScreen
    ├── → SearchScreen
    ├── → SettingsScreen
    └── → BoardScreen (Kanban, drag-to-reorder)
            └── → TaskDetailScreen (modal)
            └── → ArchivedScreen
            └── → BoardMembersScreen
```

---

## 2 — Feature Gaps

### Remaining gaps (low priority)

| Feature | Web location | Priority | Notes |
|---|---|---|---|
| **Task sharing** | Share any task into another user's board | Low | `POST /api/tasks/:id/share` not yet in iOS |
| **Status/notes inline preview on card** | "↳ ..." shown on card below text | Low | Only in detail screen on iOS |
| **Repeat indicator badge** | 🔁 on card | Low | Recurrence UI exists in detail but no card badge |
| **Import JSON** | Paste a JSON array to bulk-import tasks | Low | No API call for this exists |

### Closed in TDD sprint (2026-05-27)

| Feature | Status |
|---|---|
| Task notes / status field | ✅ TextField in TaskDetailScreen, saved in payload |
| Recurrence picker | ✅ 8-option chip row in TaskDetailScreen |
| Assigned-to user picker | ✅ Live search + selection, saved as `assigned_to_user_id` |
| Calendar fields (cal_start, cal_end) | ✅ Date inputs in TaskDetailScreen |
| Notifications bell + screen | ✅ Bell badge with unread count in BoardListScreen header; NotificationsScreen with mark-all-read |
| Delete category | ✅ × button per category in TaskDetailScreen category selector |
| Board rename / delete UI | ✅ Long-press board row → ActionSheet → Rename (Alert.prompt) / Delete (confirmation) |
| Drag-to-reorder within a stage | ✅ NestableScrollContainer + NestableDraggableFlatList per stage; ScaleDecorator; reorder API call on drag-end |

### Closed in earlier sprints

| Feature | Status |
|---|---|
| Subtask CRUD | ✅ Add / toggle / remove in TaskDetailScreen |
| Archived tasks screen | ✅ ArchivedScreen with restore and delete |
| Board member management | ✅ BoardMembersScreen — invite, revoke, remove |
| Shared boards in BoardListScreen | ✅ "Shared with me" section with owner info |

---

## 3 — API Coverage

### All endpoints now matched (28/28 + 1 iOS-only)

| Endpoint | Web | iOS |
|---|---|---|
| `GET /api/user` | ✓ | ✓ |
| `GET /api/boards` | ✓ | ✓ |
| `GET /api/boards/memberships` | ✓ | ✓ |
| `GET /api/boards/members` | ✓ | ✓ |
| `GET /api/boards/invites` | ✓ | ✓ |
| `GET /api/categories?board=N` | ✓ | ✓ |
| `GET /api/tasks?board=N` | ✓ | ✓ |
| `GET /api/tasks?board=N&archived=true` | ✓ | ✓ |
| `GET /api/dashboard` | ✓ | ✓ |
| `GET /api/search?q=` | ✓ | ✓ |
| `GET /api/notifications` | ✓ | ✓ |
| `GET /api/users/search?q=` | ✓ | ✓ |
| `POST /api/boards` | ✓ | ✓ |
| `POST /api/boards/invite` | ✓ | ✓ |
| `POST /api/categories` | ✓ | ✓ |
| `POST /api/tasks` | ✓ | ✓ |
| `POST /api/reorder` | ✓ | ✓ |
| `POST /api/notifications/read` | ✓ | ✓ |
| `POST /auth/login` | ✓ | ✓ |
| `POST /auth/signup` | ✓ | ✓ |
| `POST /auth/google/mobile` | — | ✓ (iOS-only) |
| `POST /auth/logout` | ✓ | ✓ |
| `PUT /api/tasks/:id` | ✓ | ✓ |
| `PUT /api/boards/:id` | ✓ | ✓ |
| `PUT /api/user/digest` | ✓ | ✓ |
| `DELETE /api/tasks/:id` | ✓ | ✓ |
| `DELETE /api/boards/:id` | ✓ | ✓ |
| `DELETE /api/categories/:id` | ✓ | ✓ |
| `DELETE /api/boards/invites/:id` | ✓ | ✓ |
| `DELETE /api/boards/members/:userId` | ✓ | ✓ |

**Not yet implemented on iOS:** `POST /api/tasks/:id/share` (task sharing — low priority)

---

## 4 — Design Comparison

### Tokens: identical ✓

All design tokens remain aligned (see original report for the full table).

### Layout patterns: intentionally different, functionally equivalent

| Aspect | Web | iOS | Verdict |
|---|---|---|---|
| Kanban layout | 3 horizontal columns | 3 vertical sections, drag-to-reorder | Platform-appropriate |
| Board navigation | Sidebar click | Stack push from BoardList | Platform-appropriate |
| Task detail | In-place panel | Full modal screen | Functionally equivalent |
| Notifications | Dropdown from bell | Bell → NotificationsScreen | Platform-appropriate |
| Board rename/delete | Settings modal | Long-press → ActionSheet | Platform-appropriate |
| Category delete | Board settings | × button in task detail | Functionally equivalent |

---

## 5 — Recommended Next Steps

### Low — nice to have
1. **Task sharing** — `POST /api/tasks/:id/share` UI
2. **Repeat / notes inline badge on card** — show 🔁 and notes preview text on TaskCard
3. **Import JSON** — bulk import via a paste input
