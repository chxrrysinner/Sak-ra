# Web Portal Roadmap

Current state: functional but rough. Data loads, saves work, but UX is incomplete and several sections are read-only or broken.

---

## ✅ Recently Completed

| Feature | What | Status |
|---------|------|--------|
| **Staff Activity Stats** | `?st` / `/stats` command with 7-day + all-time activity, sparkline, channel exclusions | ✅ DONE |
| **PBAN Vote Weights** | Configurable vote weights per role via DB, dashboard Security tab, API CRUD | ✅ DONE |
| **Guild ID Fix** | Dashboard now uses `process.env.GUILD_ID` instead of first OAuth guild | ✅ DONE |
| **Component Handler Routing** | Fixed `Cannot find module handler.js` errors for all modules with components | ✅ DONE |
| **Performance Plans Save** | Fixed empty `savePerformancePlansState()` — now writes to SQLite | ✅ DONE |
| **Setup Wizard PP/Docs Channels** | Added missing channel keys to modal whitelist | ✅ DONE |

---

## 1. Critical Bugs

| Bug | Location | Cause | Fix |
|-----|----------|-------|-----|
| Guild ID mismatch | `app.js:getGuildId()` | Picks `guilds[0]` from Discord OAuth instead of `process.env.GUILD_ID` | ✅ **DONE** — now uses `user.guildId` first |
| Component handler 404 | `main.js` component router | Fallback `'./handler.js'` doesn't exist for modules with components (tickets has `handlers.js`) | ✅ **DONE** — added `componentHandlers` to all modules |
| Double-colon in registry lookup | `registry.js:findComponentHandler` | Components registered as `'dashboard:'` get double-colon check `startsWith('dashboard::')` | ✅ **DONE** — changed to `'dashboard'` |
| Documents evidence embed not posting | `shared.js:postDocumentsChannel` | Channel not configured in setup/dashboard | Needs user action to set channel ID |
| Performance plans not saving | `state.js:savePerformancePlansState` | Function was empty — no DB write | ✅ **DONE** — added proper SQLite write |
| Modlog channel ID not saving from setup | `wizard.js` modal handler | `PP_CHANNEL_ID` and `DOCUMENTS_CHANNEL_ID` missing from channel keys whitelist | ✅ **DONE** — added both keys |

---

## 2. Read-Only Sections (need edit controls)

| Section | Current State | What's Missing |
|---------|--------------|----------------|
| **Channels** | Tree browser with detail panel | No permission overwrite editing, no channel rename, no slowmode/topic edit inline |
| **Roles** | List with detail + members modal | No role name/color/perms editing, no role creation/deletion |
| **Moderation** | Stats cards + case table with filters | No case reason editing, no case deletion, no evidence upload via web |
| **Tickets** | Table with close/priority bulk actions | No reply via web, no claim/transfer, no transcript download inline |

**Priority: Low** — these are browsers, not editors. Add when CRUD for all Discord resources is needed.

---

## 3. UX/UI Problems

| Problem | Location | Description | Fix |
|---------|----------|-------------|-----|
| No active tab indicator on page load | `app.js:showSection()` First load shows Overview but nav link doesn't highlight properly | Add `active` class to the correct nav link on init |
| Loading states missing | Every `load*` function | All sections show "Loading..." text that's replaced on success but stays forever on error | Add error fallback HTML in every catch block |
| Toast notifications are basic | `showToast()` | Grey bar at bottom-right, no icons, no auto-dismiss timer override | Add color variants (success/error/warning), increase visibility |
| No confirmation dialogs | `saveSetting()` etc. | Save happens silently with a brief toast, no "are you sure?" for destructive actions | Add confirm() for deletes, keep toast for saves |
| Slow initial load | `init()` loads 10+ APIs in parallel | All API calls fire at once, page stays blank until all resolve | Add progressive rendering — render each section as its data arrives |
| Section navigation doesn't persist | `showSection()` | Clicking a nav link switches sections but doesn't update URL hash | Use `window.location.hash` for section state, support browser back/forward |
| No mobile responsiveness | `styles.css` media queries exist but are minimal | Layouts break on narrow screens, tables overflow | Audit every section at <768px, add horizontal scroll on tables |
| Settings inputs lack validation | `saveSetting()` | No check for valid channel ID format (must be 17-19 digit snowflake) | Add regex validation before sending PUT request |
| Section data refreshes on every tab switch | `showSection()` calls loaders | Switching to Settings re-fetches all settings even if already loaded | Cache data and only refresh on explicit "Refresh" button click |

---

## 4. Recently Added Dashboard Sections (Need Polish)

| Section | Location | Current State |
|---------|----------|---------------|
| **Staff Activity Exclusions** | Settings tab → Staff Stats card | Functional — comma-sep channel IDs, saves to guild_settings |
| **PBAN Vote Weights** | Security tab → PBAN Weights sub-tab | Functional — add/update/delete weights per role |

---

## 5. Missing Dashboard Sections

| Section | Data Source API | What to Build |
|---------|----------------|---------------|
| **Welcome / System Messages** | `guild_settings` keys | Configure welcome/goodbye/boost message channels, content, toggle |
| **Auto-Responders** | New DB table needed | Trigger-response pairs with regex, channel/role filters |
| **Logging Config** | `guild_settings` keys | Toggle per-event-type logging (messages, members, channels, voice, etc.) |
| **Bump Reminder** | `guild_settings` keys | DISBOARD channel ID, reminder interval, auto-lock toggle |
| **Reaction Roles** | New DB table needed | Message-link → role mapping, emoji picker |
| **VoiceMaster** | New DB table needed | Join-to-create category, per-channel controls, DJ role |
| **Music** | New DB table needed | Now-playing embed, queue management, EQ presets |
| **Custom Commands** | New DB table needed | Trigger → response with embed scripting variables |

**Priority: Phase 3** — build after all existing sections have full CRUD.

---

## 6. API Improvements Needed

| Endpoint | Issue | Fix |
|----------|-------|-----|
| `GET /api/user` | Returns `guilds` array limited by OAuth scope | ✅ **DONE** — now prioritizes `process.env.GUILD_ID` |
| `GET /api/stats/:guildId` | Returns stale data, no cache-busting | Add `?_t=${Date.now()}` query param on frontend, or ETag headers |
| `PUT /api/settings/:guildId` | No validation on key/value types | Add type checking: boolean values should stay boolean, numbers should parse |
| All `PUT` endpoints | No CSRF protection | All requests already require session cookie from OAuth — adequate for now |
| Audit log export | JSON and CSV only | Add endpoint for filtered export by date range |

---

## 6. Frontend Code Quality

| Issue | Location | Description | Fix |
|-------|----------|-------------|-----|
| Monolithic IIFE | `app.js` (3221 lines) | Everything in one closure, no module separation | Split into files: `api.js`, `render.js`, `state.js`, `events.js` |
| Inline onclick handlers | `index.html` + `app.js` last 100 lines | Global functions like `saveSetting()` are called from HTML onclick attributes | Use addEventListener in bindEvents() instead |
| No build step | Plain JS served as-is | No bundling, no transpilation, no tree-shaking | Fine for now — keep it simple, no build step needed |
| Template literals in render functions | Every `render*()` | HTML strings built with `${}` interpolation — XSS risk if data isn't escaped | ✅ Uses `escapeHtml()` consistently, but audit every `${}` usage |
| No TypeScript | All `.js` files | No type checking, easy to pass wrong data shapes | Not needed — keep JS + JSDoc for complex APIs |

---

## 7. Short-Term Fix Priority

| Order | What | Why |
|-------|------|-----|
| 1 | Error states for all loaders | Currently sections silently fail, user sees stale "Loading..." text |
| 2 | Navigation hash support | So browser back/forward works, links can be shared |
| 3 | Input validation for settings | Prevent saving invalid channel IDs, role IDs |
| 4 | Progressive rendering | Don't wait for ALL data — render sections as they load |
| 5 | Toast notification improvements | Success green, error red, auto-dismiss configurable |
| 6 | Settings input caching | Don't re-fetch on every tab switch |
| 7 | Confirmation on destructive actions | Delete wing, remove role, bulk close tickets should all confirm |
| 8 | Mobile responsiveness pass | Fix overflow on tables, stack layouts on narrow screens |

---

## 8. Architecture Notes

```
src/modules/dashboard/
  index.js           # Module descriptor + onReady (calls web/server.js)
  handler.js         # Discord-native interactive dashboard (~1650 lines)
  web/
    server.js        # Express server, auth, all API routes (~610 lines)
  public/
    index.html       # SPA shell with section containers (~590 lines)
    app.js           # All frontend logic, IIFE pattern (~3250 lines)
    styles.css       # Dark theme, Hallows orange palette (~2750 lines)
```

**The server was extracted from `index.js`** — originally the Express setup + all routes were inline in the module descriptor. It's now in `web/server.js`.

**The frontend was extended** — new sections (Settings, Leveling, Starboard, Security with PBAN Weights tab, Counters, Auto-Roles, Staff) were added alongside the original 9 sections.

**New features added outside the dashboard:**
- `src/modules/staff/stats.js` — `?st` / `/stats` command handler with 7-day + all-time activity tracking
- `src/core/state.js` — `staff_activity` table + PBAN `pban_vote_weights` table + all access methods
- `src/core/permissions.js` — `pbanVoteWeight()` now checks DB for custom weights before hardcoded defaults

**Next architectural step:** Split `app.js` into:
- `state.js` — reactive state object + getters/setters
- `api.js` — all fetch() calls wrapped in error handling
- `render.js` — all render*() functions
- `main.js` — init(), bindEvents(), navigation
