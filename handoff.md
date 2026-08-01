# Hallows Handoff — Architecture & Development Guide

This document covers the internal architecture, development conventions, and everything needed to continue building Hallows into a full Bleed-scale management bot.

## Current Architecture (Post-Refactor)

The bot has been successfully refactored from a 7525-line monolith into a **modular architecture** with 17 feature modules and a robust core infrastructure. All state persists to SQLite via `core/state.js`.

### Implementation Status

**✅ Completed (Phase 1 - Foundation):**
- Modular architecture with 17 modules (added state-manager module)
- SQLite database with full schema (30+ tables)
- Module registry with dynamic command/component discovery
- Middleware pipeline (logging, rate limiting, permissions)
- Structured logging (pino)
- Web dashboard with OAuth2 authentication
- Discord-native dashboard (interactive embeds)
- Three-layer permission system (nodes, role assignments, channel overrides)
- Copy-to-clipboard functionality for IDs throughout dashboard

**✅ Completed (Phase 2 - Core Features):**
- Ticket system (modmail) — 1:1 match with ref monolith
- Staff hierarchy system (5 wings)
- Application reviewer (Google Forms + Gemini AI)
- Moderation commands (ban, kick, warn, mute, lockdown, purge, slowmode, tempban, softban, hardban, jail, stripstaff, restorestaff, unban, unwarn)
- Security features (PBAN voting, ban profiles, automod)
- Anti-nuke and anti-raid protection
- Leveling/XP system
- Starboard
- Giveaways
- Counters
- Auto-roles
- Fake permissions system
- Setup wizard
- State manager module (`?state` — view/flush all persistent state)

**🔄 In Progress:**
- Voice features (VoiceMaster, music)
- Integrations (Spotify, Last.fm, social notifications)
- Advanced messaging (auto-responders, system messages)
- Custom commands (sniping, AFK)
- Donator perks system

### Current Project Structure

```
src/
  main.js                      # Entry point, boot sequence (298 lines)
  bridge.js                    # Legacy state bridge (164 lines)
  core/                        # Shared infrastructure (11 files)
    client.js                  # Discord client setup
    config.js                  # Centralized config loader (234 lines)
    state.js                   # SQLite state manager (1520 lines)
    logger.js                  # Pino logger
    registry.js                # Module registration system
    middleware.js              # Middleware pipeline
    permissions.js             # Permission resolution (835 lines)
    embeds.js                  # Embed builders (+ containsDiscordInvite)
    prefix.js                  # Prefix command parsing
    component-ids.js           # Custom ID constants
  modules/                     # 17 feature modules
    tickets/                   # Modmail system (27 handlers, 1:1 ref match)
    staff/                     # Staff management (15 handlers + breaks)
    moderation/                # Moderation commands (17 handlers)
    security/                  # PBAN, ban profiles, automod
    applications/              # Google Forms reviewer
    dashboard/                 # Web + Discord native dashboard
    state-manager/             # Persistent state management (NEW)
    admin/                     # Admin commands
    antinuke/                  # Anti-nuke protection
    antiraid/                  # Anti-raid protection
    levels/                    # XP/leveling system
    starboard/                 # Starboard feature
    giveaways/                 # Giveaway system
    counters/                  # Channel counters
    autoroles/                 # Auto-role assignment
    fake-perms/                # Fake permissions system
    setup/                     # Setup wizard
  scripts/
    reset-slash-commands.js    # Clear all slash commands
    register-slash.js           # Re-register all slash commands from modules
```

### Core Infrastructure

**State Manager (`core/state.js`):**
- SQLite-backed with in-memory caching
- 30+ tables for tickets, staff, moderation, permissions, etc.
- ACID-compliant transactions
- Periodic auto-save every 5 minutes (in addition to shutdown save)
- Manual `saveAllGlobals()` on SIGINT/SIGTERM
- All empty save functions implemented (saveBreaksState, saveTimedCloseState, saveAllState fixed to not break on FK constraints)

**Module Registry (`core/registry.js`):**
- Dynamic module discovery from `src/modules/`
- Automatic command mapping (prefix + slash)
- Component handler routing (buttons, selects, modals) — fixed colon-prefix matching
- Permission node registration
- Handler caching returning full module namespace (not just default export)

**Permission System (`core/permissions.js`):**
- Three-layer model: nodes → role assignments → channel overrides
- Fake permissions (bot-managed, not Discord native)
- Hierarchy-aware (wing-based authority)
- Dynamic resolution with caching
- `memberCanUsePrefixRoles` fixed to accept `(guildId, userId, roleIds)` — handlers were passing `(message, roleIds)` which silently broke all permission checks

**Dashboard (`modules/dashboard/`):**
- Web UI via Express + OAuth2 (localhost:3000)
- Discord-native UI via interactive embeds
- 10-minute inactivity timeout on dashboard sessions (shows "ur too slow lol make another db")
- `?db` shorthand alias for `?dashboard`
- Role Policy JSON editor (Policies → Role Policy)
- All JSON edit modals fall back to file content when no guild override set
- 9 sections: Overview, Channels, Roles, Permissions, Hierarchy, Tickets, Moderation, Modules, Logs

### Module Descriptor Pattern

Each module exports a descriptor object:

```js
export default {
  name: 'module-name',
  version: '1.0.0',
  requires: [],                    // dependencies
  permissionNodes: { ... },        // permission nodes this module defines
  prefixCommands: [
    { command: '?x', handler: './handler.js', permission: 'x' }
  ],
  slashCommands: [
    { name: 'x', handler: './handler.js', data: commandBuilder }
  ],
  componentHandlers: {             // customId prefix → handler file mapping
    'custom_id': './handler.js'
  },
  components: {
    buttons: ['custom_id'],
    selectMenus: ['custom_id'],
    modals: ['modal_id']
  },
  stateTables: ['table_name'],
  onLoad: async (core) => { /* register event handlers */ },
  onReady: async (core) => { /* restore timers, start intervals */ }
};
```

### Database Schema (Key Tables)

```sql
-- Core state
settings (key, value)
tickets (id, user_id, channel_id, department_id, status, priority, claimed_by, ...)
ticket_history (id, ticket_id, user_id, content, attachment_urls, timestamp)

-- Staff system
staff_hierarchy (wing, rank, role_id)
strikes (id, user_id, staff_id, reason, timestamp)
staff_breaks (id, user_id, guild_id, status, reason, started_at, ends_at, ended_at, removed_role_ids, message_count, approved_by)
break_requests (id, user_id, guild_id, channel_id, message_id, duration_text, duration_ms, reason, created_at)
performance_plans (id, user_id, staff_id, wing, reason, goals, due_date, status, notes, ...)

-- Security
pban_proposals (id, target_user_id, proposer_id, reason, status, expires_at)
pban_votes (proposal_id, voter_id, vote, weight)
ban_profiles (user_id, guild_id, proof_urls, last_synced_at)

-- Permissions (3-layer system)
permission_nodes (node, module, label, description, group_name)
role_permissions (role_id, guild_id, node, mode, granted_by, granted_at)
user_permissions (user_id, guild_id, node, mode)
channel_overrides (guild_id, channel_id, node, mode)
audit_log (id, guild_id, actor_id, action, target_type, target_id, details, timestamp)

-- Moderation
mod_cases (id, guild_id, user_id, moderator_id, action, reason, duration, channel_id, message_count)
case_evidence (id, case_id, guild_id, url, filename, uploaded_by)

-- Engagement
levels (guild_id, user_id, level, xp)
level_rewards (guild_id, level, role_id)
starboard_messages (guild_id, message_id, channel_id, star_count)
giveaways (id, guild_id, channel_id, message_id, prize, end_time, winners, ...)

-- Wings (DB-stored, overrides code defaults)
wings (id, guild_id, label, description, channel_prefix, sort_order)
wing_roles (id, wing_id, guild_id, role_id, rank, label, is_lead, is_internal, is_category, sort_order)

-- Staff activity tracking
staff_activity (id, guild_id, user_id, date, message_count, ticket_replies, mod_actions)
```

## Policy Files (Editable via Dashboard)

Three JSON policy files are editable via the dashboard's JSON editors:

| Button Path | File | Guild Setting Override |
|---|---|---|
| Policies → Command Perms | `commands.json` | `_policy_commands` |
| Policies → Branch Policy | `ticket-branch-policy.json` | `_policy_branches` |
| Policies → Saved Snippets | `saved-snippets.json` | `_policy_snippets` |
| Policies → Modmail Cmd | `modmail-command-policy.json` | `_modmail_policy` |
| Policies → Role Policy | `role-policy.json` | `_role_policy` |
| Policies → Cmd Aliases | (none) | `_command_aliases` |

All JSON editors fall back to file content when no guild override exists.

### Hierarchy Reference Syntax

Policy entries can reference the staff hierarchy dynamically:
- `all` — every role from every wing
- `all-moderation` — every role except moderation wing
- `internals` — all internals roles
- `1,assistants` — rank 1 in assistants
- `M,moderation` — moderation lead
- `I,internals` — internals role
- Wing aliases: `int`, `hr`, `part`, `mod`, `assi`

### Permission Resolution Order (for a command in a ticket)

1. Is the user in Internals? → global bypass
2. Does the command policy specify `ticketPermission`? → check `ticket-branch-policy.json` for that wing
3. Does the command have a `rolePolicyCommand`? → check `role-policy.json.commands`
4. Check `allowedBranches` filter
5. Check `capabilityOverride` for unclaim + claim-takeover pairs

## Dependencies

**Core:**
- `discord.js` ^14.19.3
- `better-sqlite3` ^11.0.0
- `pino` ^9.5.0
- `pino-pretty` ^13.0.0
- `dotenv` ^16.5.0

**Dashboard:**
- `express` ^4.21.0
- `express-session` ^1.18.0
- `passport` ^0.7.0
- `passport-discord` ^0.1.3

**Integrations:**
- `googleapis` ^140.0.1 (Google Forms)
- `@google/genai` ^1.0.0 (Gemini AI)

## Response Style & Branding

### Brand
- **Name:** Hallows
- **Colour constant:** `HALLOWS_ORANGE = 0xc67a3a`
- **Aesthetic:** Warm orange/brown tones, Halloween-adjacent, clean but not overstyled

### Response Philosophy (Bleed-style)

Bleed's default moderation response is a bare `👍` emoji — no embed, no fanfare. Hallows follows this:

| Context | Style | Example |
|---|---|---|
| Moderation actions | Single emoji or 1-line text | `👍` |
| Success confirmations | Compact reaction-style | `👍` |
| Error messages | Short lowercase text | `nuuu` |
| Ticket relay (modmail) | Styled embed (orange) | Preserved from Sak-ra |
| Ticket system notifications | Clean embeds in Hallows orange | Panel, claim, close notifications |
| Help / info commands | Compact embed with fields | Hallows orange, minimal decoration |
| AI opinions (Gemini reviews) | Embed with fields | Orange themed, structured |

## Modmail System — Complete Feature Reference

The ticket/modmail system is a 1:1 port from the ref monolith. Every feature listed in `modmail.md` has been verified against the original source.

### Ticket Core
- `activeChannelFor` / `userIdForChannel` — channel↔user mapping with auto-cleanup on deleted channels
- `recordHistory` — append to ticket history (max 500 entries), sets lastActivityAt
- `openTicket` — creates channel, sends intro embed with ping roles, duplicate ticket race detection
- `closeTicket` — validates perms, sends transcript, notifies user via DM, closes channel
- `forceCloseTicketByUserId` — force-close with stale state cleanup
- `sendDepartmentPrompt` / `sendButtonDepartmentPrompt` — DM user with wing selector
- `ensureSupportPanel` — auto-creates support panel message in configured channel
- `departmentRow` / `supportPanelRow` — select menu and button builders

### Relay System
- `relayUserDm` — routes user DM to existing ticket or sends department prompt
- `relayStaffReply` — sends staff reply to user via DM with echo in channel
- Duplicate ticket detection on race conditions (silently closes newer, keeps older)
- Discord invite detection in partnership tickets (plaintext copy alongside embed)

### Staff Commands (all use `?` prefix only, never global prefix)
| Command | Description | Permission |
|---|---|---|
| `?r` | Reply to user | reply role for wing |
| `?close` | Schedule timed close | close role for wing |
| `?cancelclose` | Cancel timed close | close role for wing |
| `?claim` / `?c` | Claim ticket | reply role + overrideClaims bypass |
| `?unclaim` | Release claim | reply role |
| `?transfer` / `?t` | Transfer to wing | reply role |
| `?escalate` | Escalate to Internals | reply role |
| `?ad` | Send partnership ad | reply/close role (partnership/internals only) |
| `?repfin` | Send report finished message | reply role (moderation/internals only) |
| `?rename` | Rename channel | reply role |
| `?priority` | Set priority (low/normal/high/urgent) | reply role (moderation/internals only) |
| `?note` | Add internal note | reply role |
| `?id` | Show user info | any staff (`userInfo: ["all"]`) |
| `?transcript` | Generate transcript preview | reply role |
| `?claiminfo` | Show claim info | any staff (`claimInfo: ["all"]`) |
| `?closeinfo` | Show close timer info | any staff (`closeInfo: ["all"]`) |
| `?timer` | Show remaining close time | any staff (`timer: ["all"]`) |
| `?h` | Help | any staff (`help: ["all"]`) |
| `?s` | Snippet list | any staff (`snippets: ["all"]`) |
| `!!!<cmd>` | Preview command output | any staff (`preview: ["all"]`) |
| `?<saved-snippet>` | Send saved snippet | reply role (per snippet config) |

### Saved Snippets
| Snippet | Allowed Wings | Permission |
|---|---|---|
| hi, wait, askproof, askid, resolved, deny | all | reply role |
| partneraccept, partnerdeny | partnership, internals | reply role |
| appstatus | internals | reply role |

### Timed Close System
- `scheduleTimedClose` — setTimeout with clock-adjustment re-scheduling
- `removeTimedClose` — clear timeout + delete state + save
- `clearTimedCloseTimeout` — clear timeout only (no state change)
- Restored on startup via `tickets/index.js onReady`
- Cancelled on user message, transfer, force-close
- NOT cancelled on timer-preserving commands (`?close`, `?s`, `?h`, `?timer`, `?id`, `?transcript`, `?claiminfo`, `?closeinfo`)

## Staff Break System

### Storage
- Active breaks in `staff_breaks` table (SQLite)
- Pending requests in `break_requests` table
- In-memory state via `globalThis.__HALLOWS_BREAK_STATE__`
- Periodic auto-save every 5 min + on process shutdown

### Startup Restoration
- Active breaks loaded from DB in `loadBreaksState()`
- `onReady` in `staff/index.js` handles all cases:
  - `endsAt` is null → immediately ends (restores roles)
  - `endsAt` in the past → immediately ends (restores roles)
  - `endsAt` in the future → schedules auto-end timer

## State Persistence Summary

| Data | Storage | Persistence | Risk |
|---|---|---|---|
| Tickets | `tickets` table | `saveAllState()` on each change + periodic | Low |
| Ticket history | `ticket_history` table | On each message relay | Low |
| Staff breaks | `staff_breaks` + `break_requests` tables | `saveBreaksState()` on each change | Low |
| Timed closes | `timed_closes` table | `saveTimedCloseState()` on each change | Low |
| Performance plans | `performance_plans` table | `savePerformancePlansState()` on each change | Low |
| Reviewer state | `settings` table | `saveReviewerState()` on each change | Low |
| Strikes | `strikes` table | Via `saveAllState()` on periodic save + shutdown | Low |
| PBAN proposals | `pban_proposals` + `pban_votes` | Via `saveAllState()` on periodic save + shutdown | Low |
| Ban profiles | `ban_profiles` table | Via `saveAllState()` on periodic save + shutdown | Low |

## Session Management

### Dashboard Sessions
- Each `?dashboard` / `?db` message tracked by message ID
- 10-minute inactivity timeout
- Expired sessions show "ur too slow lol make another db" on any interaction
- Session map is in-memory only (lost on restart, acceptable)

## Recent Changes (This Session)

### Ticket System — Full Ref Monolith Match
- All 24 ticket command handlers rewritten against ref 1:1
- Fixed `memberCanUsePrefixRoles` calls in all handlers (was passing `(message, roleIds)`)
- Fixed `claim.js` — was passing staff ID instead of `userIdForChannel`
- Fixed `close.js` — sends DM immediately, deletes staff message, echoes with author field
- Fixed `transfer.js` — added channel rename queuing, warning tracking, console.error logging
- Added `clearTimedCloseTimeout`, `CLAIM_COMMAND_ALIASES`, `TIMER_PRESERVING_PREFIX_COMMANDS`
- Added timed close restoration on startup
- Added duplicate ticket race detection (silent close of newer)
- Added Discord invite detection in partnership tickets (plaintext copy)
- All responses use lowercase friendly style
- **Fixed claimer ping** — `relayUserDm` now pings `ticket.claimedByStaffUserId` above the relay embed via `firstMessageContent`, matching ref monolith behavior (was silently dropping the ping)

### State Persistence Fixes
- `saveAllState()` — reverted to only save tickets (was failing on FK constraints trying to also save strikes/PBAN/profiles)
- `saveBreaksState()` — implemented (was empty), stores to `staff_breaks` + `break_requests` tables
- `saveTimedCloseState()` — implemented (was empty), stores to `timed_closes` table using `user_id TEXT PRIMARY KEY`
- `timed_closes` table — changed from `ticket_id INTEGER REFERENCES tickets(id)` to `user_id TEXT PRIMARY KEY` (FK was causing errors since timed closes use user IDs, not ticket DB IDs)
- `staff_breaks` table — added `guild_id`, `removed_role_ids`, `message_count`, `approved_by` columns with ALTER TABLE migration
- `break_requests` table — added for pending break requests

### Database Migrations
- Added ALTER TABLE fallbacks for existing databases:
  - `staff_breaks`: `guild_id`, `removed_role_ids`, `approved_by`, `message_count`
  - `performance_plans`: `guild_id`, `user_tag`, `started_by_user_id`, etc.
  - `timed_closes`: `user_id` column

### Dashboard Changes
- Added **Role Policy** JSON editor under Policies menu
- All JSON edit modals now fall back to file content when no guild override exists
- Added 10-minute inactivity timeout on dashboard sessions
- Added `?db` shorthand alias for `?dashboard`
- Fixed `showPolicyEditModal` duplicate `title` declaration

### Prefix Routing
- Ticket commands (`?r`, `?close`, etc.) now ONLY work with `?` prefix, never global prefix
- Main.js routing forces `?` prefix for any command in the tickets module

### Permission Fixes
- `state.manage` permission flag added for state-manager module
- Break approve/deny buttons now also check `commandRoleIds('manageBreaks')` from role-policy
- Added `getOverride` function to config for runtime config overrides (used by dashboard role policy editor)

### New Feature — setupjail Command
- **`setupjail`** (`?setupjail [#channel]` / `/setupjail [channel]`) — one-command jail setup
  - Creates the `Jailed` role (or reuses existing) with zero permissions
  - Sets the specified channel (defaults to current) as the jail channel — jailed users can view, send messages, and attach files there
  - Denies `ViewChannel` on every other text, voice, thread channel, **and all categories** (new channels inherit the deny)
  - Requires `administrator` fake permission
  - Saves role and channel IDs to guild settings (`jail_role_id`, `jail_channel_id`)
  - Works alongside existing `jail`/`unjail` commands — no migration needed

### Other Changes
- **Removed `?setup reset`** — `handlePrefixCommand` in setup wizard no longer checks for `reset` arg; always launches wizard
- **Completed setup response** — `?setup` when setup is already complete now replies `edit with dashboard!` instead of the verbose message
- **Jail staff immunity** — `jail` command now rejects if target has any staff hierarchy role (`staffRoleHierarchyIds()`)
- **Jail ping response** — after jail success response, bot pings `@user you have been jailed.`
- **Removed `jail setup` subcommand** — replaced by `setupjail`; usage text updated
- **`?stafflist` permission** — changed from `staff.stafflist` flag to checking any staff hierarchy role; also merged `ON_BREAK_ROLE_ID` role holders into On Break section
- **`?listbreak` permission** — changed from `staff.breaks.manage` flag to checking any staff hierarchy role
- **`?listbreak` JSON fallback** — reads from `staff-breaks.json` if in-memory break state is empty
- **`loadBreaksState` JSON fallback** — migrates active breaks from `staff-breaks.json` if SQLite has none
- **Fixed `saveBreaksState` bug** — `NOT IN ('')` was ending ALL active breaks on every save; now properly passes active user IDs
- **Fixed `channel_overrides` schema** — `coalesce(node, '')` expression in PRIMARY KEY caused SQLITE_ERROR on startup; changed `node` to `NOT NULL DEFAULT ''`
- **Auto-expire dashboard** — dashboard embed now auto-edits to `ur too slow lol make another db` after 10 min inactivity via setTimeout, instead of waiting for next button press
- **Permission nodes registered** — staff module now declares `staff.breaks.manage`, `staff.stafflist`, `staff.breaks.request` in `permissionNodes`

### New Module
- **state-manager** (`?state`) — view and flush persistent state by category (breaks, tickets, strikes, pplans, pban, ban profiles, timed closes, tempbans) with individual entry selection via dropdown

### Scripts
- `src/scripts/register-slash.js` — standalone script to re-register all slash commands from module definitions without bot restart
- `npm run register-slash` — package.json script

### Break Startup Restoration
- Fixed to also handle breaks with null `endsAt` (immediately end + restore roles)
- Added `onReady` timer for active breaks, immediate cleanup for expired ones

## Deployment

Target: Remain compatible with KataBump. The modular refactor keeps a single entry point (`src/main.js`) that works on KataBump.

**Current deployment:**
- Bot runs as `npm start` / `node src/main.js`
- SQLite database at `data/hallows.db`
- Dashboard on `localhost:3000`
- Logs to stdout (pino)

## Relevant URLs

- **Current bot (Hallows, formerly Sak-ra)**: Internal, deployed on KataBump
- **Bleed bot** (reference): https://bleed.bot/ | https://docs.bleed.bot/
- **Discord.js docs**: https://discord.js.org/
- **Better-sqlite3**: https://github.com/WiseLibs/better-sqlite3
- **Gemini API**: https://ai.google.dev/
- **Pino logger**: https://getpino.io/
