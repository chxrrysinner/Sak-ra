# AGENTS.md — Development Guidelines for Hallows

This file tells AI coding agents (and human contributors) how to work on this project.

## Project Identity

Hallows (formerly Sak-ra) is evolving from a modmail + app-reviewer bot into a full Discord management platform (Bleed-class). There are two modes of work:

1. **Refactoring** — Modularizing the existing 7525-line monolith
2. **Feature building** — Adding new modules to match or exceed Bleed's capabilities

## Branding & Response Style

- **Name:** Hallows
- **Primary colour:** `0xc67a3a` (Hallows orange) — always import from `constants.js`
- **Theme:** Warm orange/brown, Halloween-adjacent, clean and minimal

**How responses should look:**
- Moderation commands respond like Bleed: `👍` by default, not a fancy embed. Only use embeds when the response has structured data (transcripts, starlist, ban info, etc.)
- Ticket relay messages use styled embeds — that's presentation-critical
- Keep it lightweight. Short text > big embed unless the data demands it

## Before Changing Any Code

1. **Read the architecture docs first** — `README.md` for the vision, `handoff.md` for the technical architecture
2. **Check the phase roadmap** in README.md — don't build Phase 3 features before Phase 1 is stable
3. **Preserve existing behavior** — every existing feature must continue working after any change

## Coding Conventions

### Style
- ES modules (`import`/`export`) — never `require()`
- Async/await over raw promise chains
- `const` over `let` unless rebinding is required
- Destructure discord.js imports at the top of each file
- No TypeScript (keep JS + JSDoc for clarity if needed)

### File Organization (Target)
```
src/
  main.js                       # Entry point
  core/                         # Shared infrastructure
    client.js, config.js, state.js, logger.js, registry.js, middleware.js, permissions.js, embeds.js
  modules/                      # Feature modules
    tickets/, moderation/, staff/, applications/, engagement/, messaging/, voice/, integrations/, security/, custom-commands/, donator/
```

### Module Registration Pattern (Target)
Each module exports a descriptor object:
```js
export default {
  name: 'module-name',
  version: '1.0.0',
  prefixCommands: [{ command: '?x', handler: './handler.js', permission: 'x' }],
  slashCommands: [{ name: 'x', handler: './handler.js', data: commandBuilder }],
  components: { buttons: ['custom_id'], selectMenus: ['custom_id'], modals: ['modal_id'] },
  stateTables: ['table_name'],
  onLoad: async (core) => { /* register event handlers */ },
  onReady: async (core) => { /* restore timers, start intervals */ }
};
```

### State Access
- Never write to JSON files directly — use the state manager
- State manager uses SQLite (better-sqlite3) for ACID compliance
- In-memory cache with write-back on process exit

### Error Handling
- Every interaction handler must have try/catch → user-facing error reply
- Log structured context: `logger.error({ userId, guildId, command }, 'description')`
- Top-level `process.on('unhandledRejection', ...)` in main.js

### Testing
- Vitest for unit tests
- Put tests in `src/modules/<name>/__tests__/`
- Core utilities get highest test priority
- Integration tests use a test Discord guild

## Priority Order for New Features

When building, work in this order:

1. **Core infrastructure** (state manager, config loader, module registry, middleware)
2. **Preserved existing features** (tickets, staff system, applications, PBAN, etc.)
3. **Security & moderation** (anti-nuke, anti-raid, fake perms, full mod suite)
4. **Engagement** (leveling, roles, giveaways, starboard, counters)
5. **Messaging & automation** (auto-responders, system messages, timers, logging, aliases)
6. **Voice** (VoiceMaster, music)
7. **Integrations** (social notifications, Spotify, Last.fm, Fortnite)
8. **Differentiators** (dashboard with auto-tunnel, Discord-native config UI, plugin system, analytics)

## Common Pitfalls to Avoid

- **Don't add new JSON state files** — use the database
- **Don't add new top-level constants in `index.js`** — put them in the appropriate module
- **Don't add `console.log`** — use the logger
- **Don't hardcode channel/user IDs** — they must be configurable via env or DB
- **Don't assume single guild** — plan for multi-server from the start
- **Don't import from other modules directly** — use the core registry or event bus
- **Don't add new dependencies without approval** — we want to stay lean

## Running the Bot

```bash
npm install
npm run check     # syntax validation
npm start         # node index.js
npm run google:auth   # get Google refresh token
```

## Reference

- Bleed docs: https://docs.bleed.bot/
- discord.js v14: https://discord.js.org/docs/packages/core/14.15.3
- better-sqlite3: https://github.com/WiseLibs/better-sqlite3
- pino: https://getpino.io/
- vitest: https://vitest.dev/
