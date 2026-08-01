# Native Dashboard (Discord) — Overhaul Roadmap

The Discord-native dashboard at `src/modules/dashboard/handler.js` is a 1723-line monolith providing interactive embed-based server management. It's feature-rich but has significant gaps in coverage, responsiveness, and data-source consistency.

---

## Current Architecture

```
handler.js (1723 lines)
├── 26 panel builder functions    (lines 10–750)
├── 1 permission check function   (line 752)
├── 22 modal trigger builders     (lines 760–1125)
├── 1 prefix command handler      (line 1127)
├── 1 slash command handler       (line 1141)
├── 1 giant button dispatcher     (line 1146)
│   ├── 8 general setting buttons
│   ├── 8 navigation buttons
│   ├── 5 permission sub-panels
│   ├── 4 hierarchy select menus
│   └── ~30 dynamic wing/role buttons
├── 1 giant modal dispatcher      (line 1483)
│   ├── 12 setting modals
│   ├── 8 hierarchy modals
│   └── 3 policy edit modals
└── 4 toggle helpers             (lines 1101–1125)
```

Data sources: 60% SQLite (stateManager), 25% JSON config files, 15% hardcoded.

---

## ✅ Already Working Well

| Feature | Notes |
|---------|-------|
| Hierarchy (wings + roles) | Full CRUD: add/edit/delete wings, add/edit/remove roles, toggle lead/category |
| Fake Permissions per role | Inline toggle panel from hierarchy role view, grants/revokes by flag |
| Anti-Raid / Anti-Nuke | Toggle + config with modals (threshold, window, lockout) |
| Leveling | Toggle + config (XP range, cooldown, factor) |
| Starboard | Toggle + config (threshold, channel) |
| Permission 3-layer nodes | Browse nodes, filter by module, pagination |
| General settings (prefix, channels) | Modals for each, saves to state/guild settings |
| Policy editing (commands, branches, snippets) | JSON textarea modals that write to config files |
| Role permissions browser | Paginated list of role → node assignments |

---

## ❌ Missing Compared to Setup Wizard (65 steps)

| Setup Wizard Step | Native Dashboard Equivalent | Status |
|---|---|---|
| **Step 1: Prefix** | `generalPanel` → Change Prefix button | ✅ Done |
| **Step 2: Appearance** | ❌ Not present | Missing — no embed color, title prefix, footer config |
| **Step 3: Support Channel** | `generalPanel` → Support Chan button | ✅ Done |
| **Step 4: Panel Content** | ❌ Not present | Missing — no button text/label/content editing |
| **Step 5: Transcript Channel** | `generalPanel` → Transcript Chan button | ✅ Done |
| **Step 6: Post Support Panel** | ❌ Not present | Missing — no "post now" action |
| **Step 7: Wing Count** | `hierarchyPanel` handles this | ✅ Done |
| **Steps 8–15: Wing Details** | `hierarchyWingPanel` | ✅ Done |
| **Step 16: Lead Cat Role + Command Policies** | `hierarchyPanel` has lead cat role via `showSettingModal` | ⚠️ Partial — command policies are in `policiesPanel` not integrated |
| **Step 17: Ticket Access (Global Wings)** | ❌ Not present | Missing — no global wing toggle, no ticket branch policy config accessible |
| **Step 18: Break Request Channel + Role** | `generalMorePanel` has break chan/role | ✅ Done |
| **Step 19: Performance Plans** | ❌ Not present | Missing — no PP channel config |
| **Step 20: Saved Snippets** | `policySnippetsPanel` | ✅ Done (JSON editor) |
| **Step 21: Command Aliases** | `policyCommandsPanel` | ✅ Done (JSON editor) |
| **Steps 22–26: PBAN (proposal, log, protect, appeal, demote exempt)** | `generalMorePanel` has PBAN proposal/log channels | ⚠️ Partial — missing protected roles, appeals invite, demote exempt |
| **Step 27: Modlog Channel** | `moderationPanel` | ✅ Done |
| **Step 28: Documents Channel** | ❌ Not present | Missing — no evidence/document channel config |
| **Step 29: Anti-Bot Automod** | `generalMorePanel` has automod channel | ✅ Done |
| **Steps 30–58: Fake Permissions (28 flags)** | `fakePermsPanel` + role-level perms | ✅ Done |
| **Steps 59–60: Anti-Raid + Anti-Nuke** | `antiraidPanel` + `antinukePanel` with config | ✅ Done |
| **Step 61: Applications** | ❌ Not present | Missing — no review channel, approve role, ghost ping config |
| **Step 62: Engagement** | ❌ Not present | Missing — autoroles, giveaways counters overview accessible but no config |
| **Step 63: Diagnostics** | ❌ Not present | Missing — no validation/health check panel |
| **Step 64: Setup Complete** | ❌ Not present | Missing — no summary/completion panel |

**Missing from both setup AND native dashboard:**
- Staff activity stats excluded channels
- PBAN vote weights configuration

---

## ❌ Missing Compared to Web Portal

| Web Portal Section | Native Dashboard Equivalent | Status |
|---|---|---|
| **Overview/Stats** | `mainPanel` (basic nav only) | ❌ Missing — no stats cards, no recent activity feed |
| **Channels browser** | ❌ Not present | Missing — no channel tree, no detail view |
| **Roles browser** | `permissionsRolesPanel` (perms only) | ❌ Missing — no role list/detail/members |
| **Settings** | `generalPanel` + `generalMorePanel` | ⚠️ Partial — missing jail config, stats exclusions, documents channel, appearance |
| **Leveling** | `levelsPanel` + `levelsConfigPanel` | ⚠️ Partial — missing level rewards CRUD |
| **Starboard** | `starboardPanel` + `starboardConfigPanel` | ✅ Done |
| **Security (Raid + Nuke + PBAN Weights)** | `antiraidPanel` + `antinukePanel` | ⚠️ Partial — missing PBAN weights tab |
| **Counters** | `countersPanel` | ❌ Read-only — no create/delete buttons |
| **Auto-Roles** | ❌ Not present | Missing — no list/add/remove |
| **Staff (merged hierarchy + fake perms)** | `hierarchyPanel` with role FP integration | ✅ Done |
| **Moderation** | `moderationPanel` | ❌ Read-only — no case editing, no evidence |
| **Logs** | `permissionsAuditPanel` (10 entries only) | ❌ Minimal — no filters, no pagination, no export |

---

## 🐛 Known Bugs & Issues

| Bug | Location | Description | Fix |
|-----|----------|-------------|-----|
| **Stale data from JSON config** | `generalPanel`, `generalMorePanel` | Reads from `config.*` (JSON files at startup) instead of guild_settings (DB). Changes via setup wizard not reflected until restart. | Replace `config.*` reads with `stateManager.getGuildSetting()` calls |
| **Policy edits write to JSON files** | `handleDashboardModal` policy cases | Editing policies via modals writes to `fs.writeFileSync()` on JSON files, bypassing guild_settings. Multi-server incompatible. | Change to `stateManager.setGuildSetting()` instead |
| **permissionsChannelsPanel is a stub** | Line 621 | Shows hardcoded description with "Add Override" button that does nothing | Implement channel override browsing + CRUD |
| **permissionsRolesPanel grant/revoke buttons** | Lines 588–620 | Buttons exist but `showGrantRoleSelect` and `showRevokeRoleSelect` are not connected | Wire modal triggers to the buttons |
| **countersPanel has no create/delete** | Line 416 | Only lists counters, no way to add or remove | Add inline buttons or modals |
| **No loading/error states** | Every panel | If data fetch fails or DB is slow, embed just shows stale or empty data | Add try/catch with user-facing error messages in panel builders |
| **No pagination on long lists** | `fakePermsPanel`, `countersPanel` | If many flags/counters exist, embed fields could exceed Discord limits | Add pagination or truncation with "Next" buttons |
| **canManage() too permissive** | Line 752 | Allows any member with `ManageGuild` or fake `administrator` to access everything | Add per-panel permission checks |
| **Modal responses don't confirm** | All modal handlers | After saving, panel updates silently — no confirmation embed | Add brief confirmation embed before returning to panel |
| **Panel embed lacks guild branding** | `mainPanel` | Hardcoded "Hallows Dashboard" title, no server name/icon | Add guild name + icon to main embed |

---

## 📋 Priority Fixes

### Priority 1: Data Source Consistency (High Impact)

| Change | Files | Effort |
|--------|-------|--------|
| Replace `config.*` reads in `generalPanel`/`generalMorePanel` with `stateManager.getGuildSetting()` | `handler.js` lines 42-63, 73-92 | 30 min |
| Replace `config.policy.*` reads in policy panels with guild_settings reads | `handler.js` lines 455-510 | 20 min |
| Remove `fs.writeFileSync()` from policy modal handlers, use `stateManager.setGuildSetting()` | `handler.js` modal cases | 20 min |
| Add `setOverride()` + `stateManager.setGuildSetting()` for each config key on save | `handler.js` modal cases | 20 min |

### Priority 2: Missing Sections (Medium Impact)

| Section | What to Build | Effort |
|---------|---------------|--------|
| **Setup Complete / Diagnostics panel** | Validate all settings, show ✅/⚠️/❌ per section | 30 min |
| **Documents channel config** | Add to `generalMorePanel` + modal handler | 15 min |
| **Applications config** | Review channel, approve role, ghost ping, approve/reject DM messages | 30 min |
| **Performance plans config** | PP log channel modal + display | 15 min |
| **Appearance config** | Embed color, title prefix, footer text | 20 min |
| **Staff stats excluded channels** | Config modal similar to other settings | 15 min |
| **PBAN vote weights** | Display + inline manage (similar to web) | 45 min |
| **PBAN protected roles + appeals + demote exempt** | Add to `generalMorePanel` or new PBAN config panel | 30 min |
| **Auto-roles list + add/remove** | New panel with list + modal for add/remove | 30 min |
| **Counters create/delete** | Inline buttons in `countersPanel` | 20 min |

### Priority 3: UX Improvements (Lower Impact)

| Fix | Where | Effort |
|-----|-------|--------|
| Add confirmation embeds after saves | All modal handlers — show brief ✅ embed before returning | 30 min |
| Add guild name/icon to `mainPanel` | `mainPanel` — fetch guild, add thumbnail + title | 10 min |
| Paginate long lists | `fakePermsPanel`, `countersPanel` — add page tracking | 20 min |
| Add error handling to panel builders | Every panel — wrap `stateManager` calls in try/catch | 20 min |
| Wire `permissionsRolesPanel` grant/revoke buttons | Connect to modal triggers | 15 min |
| Implement `permissionsChannelsPanel` | Read + display channel overrides from DB | 30 min |

---

## 📐 Design Rules for New Panels

1. **Always read from stateManager (SQLite)**, never from `config.*` or JSON files directly
2. **Always write to `stateManager.setGuildSetting()`**, never to `fs.writeFileSync()`
3. **Data from setup wizard must be immediately visible** — same DB, same keys
4. **Use consistent button styles**: Primary = action, Success = create/enable, Danger = delete/disable, Secondary = navigate
5. **Keep embeds under 4000 characters** — Discord field value limit is 1024 chars, total embed 6000 chars
6. **Modal text inputs must pre-fill current values** — use `setValue()` on `TextInputBuilder`
7. **Every modal save must update the current panel** — never leave user on a stale view
8. **Add `navRow(guildId).components[0]` for Back and `components[1]` for Exit on every panel**

---

## 📁 File Structure Context

```
src/modules/dashboard/
  index.js           # Module descriptor (30 lines) — calls web/server.js onReady
  handler.js         # Native dashboard panels + interaction routing (1723 lines)
  web/
    server.js        # Express web server + REST API (627 lines)
  public/            # Web frontend SPA
```

The native and web dashboards share the same data sources (stateManager SQLite). Fixing data source consistency in handler.js will make the native dashboard reflect changes from the setup wizard and web portal immediately.

---

---

## Part 4: Response Style Rules

These apply to **all** commands, not just the native dashboard.

### Slash Commands (`/command`) — Never Ephemeral

Every slash command handler currently sets `ephemeral: true` on replies. This makes responses visible only to the person who ran the command. Change ALL of them to persistent (visible to everyone in the channel).

**Before:**
```js
await interaction.reply({ content: '👍', ephemeral: true });
```

**After:**
```js
await interaction.reply('👍');
```

**Exception:** Commands that return sensitive data (user IDs, private notes) may remain ephemeral. Everything else should be public.

### Prefix Commands (`?command`) — Never Reply, Just Send

Every prefix command handler currently uses `message.reply('👍')`. This creates a threaded reply that pings the user. Change ALL of them to `message.channel.send('👍')` so the bot just sends a standalone message.

**Before:**
```js
await message.reply('👍');
```

**After:**
```js
await message.channel.send('👍');
```

### Files to Change

| File | Lines to Change | Current Pattern | New Pattern |
|------|----------------|-----------------|-------------|
| `src/modules/moderation/ban.js` | Lines 24, 47 | `message.reply('👍')` / `interaction.editReply('👍')` | `message.channel.send('👍')` / `interaction.editReply('👍')` (slash is fine, not ephemeral) |
| `src/modules/moderation/kick.js` | Lines 27, 53 | same | same |
| `src/modules/moderation/mute.js` | Lines 47, 72, 94, 131 | same | same |
| `src/modules/moderation/warn.js` | Lines 16, 31 | same | same |
| `src/modules/moderation/purge.js` | Lines 36, 75 | same | same |
| `src/modules/moderation/lockdown.js` | Lines 24, 27, 47, 50 | same | same |
| `src/modules/moderation/slowmode.js` | Lines 22, 25, 49, 52 | same | same |
| `src/modules/moderation/jail.js` | Lines 112, 242, 266 | same | same |
| `src/modules/moderation/tempban.js` | Lines 45, 76 | same | same |
| `src/modules/moderation/softban.js` | Lines 24, 47 | same | same |
| `src/modules/moderation/hardban.js` | Lines 20, 42 | same | same |
| `src/modules/moderation/stripstaff.js` | Lines 27, 53 | same | same |
| `src/modules/moderation/unban.js` | Lines 25, 49 | same | same |
| `src/modules/dashboard/handler.js` | Line 1143 | `ephemeral: true` on `/dashboard` | Remove ephemeral |
| `src/modules/staff/ping.js` | Line 16+ | `ephemeral: true` | Remove ephemeral |

### Regex Search (find all offenders)

```bash
# Find all ephemeral: true in slash command handlers
grep -rn "ephemeral: true" src/modules/ --include="*.js"

# Find all message.reply with 👍 in prefix command handlers
grep -rn "message.reply.*👍" src/modules/ --include="*.js"
```

---

## Summary

The native dashboard has solid hierarchy/permissions/fake-perms coverage but is missing ~15 sections that the setup wizard covers. The single biggest fix is replacing JSON config reads with guild_settings DB reads — this will immediately fix stale data issues and make the native dashboard reflect setup wizard changes. After that, filling in the missing sections (diagnostics, documents, applications, appearance, PP, PBAN weights, autoroles, counters CRUD) will bring it to parity with the setup wizard.
