# Hallows — Community Management Platform

Hallows is a comprehensive Discord server management bot offering security, moderation, engagement, voice, and staff management in a single self-hosted package.

## Design Philosophy

Hallows follows Bleed's response style — casual, compact, and emoji-driven rather than verbose embeds:
- Moderation commands respond with `👍` by default
- All responses are lowercase and friendly
- Branding is **Hallows**: orange/brown tones (`0xc67a3a`), Halloween-tinged aesthetic

## Current Status

Hallows runs a production-grade server management system with a five-wing staff hierarchy (internals, HR, partnership, moderation, assistants). Features include staff management, strikes, PBAN voting bans, ban profiles, anti-bot automod, leveling, starboard, giveaways, and more.

The bot uses a **modular architecture** with 15 feature modules. All state persists to SQLite via `core/state.js`.

## Project Structure

```
src/
  main.js                       # Entry point
  core/                         # Shared infrastructure
  modules/                      # 15 feature modules
    staff/                      # Staff management
    moderation/                 # 21 mod commands
    security/                   # PBAN, ban profiles, automod
    dashboard/                  # Web + Discord native dashboard
    state-manager/              # Persistent state viewer/flusher
    admin/                      # Admin commands
    antinuke/                   # Anti-nuke protection
    antiraid/                   # Anti-raid protection
    levels/                     # XP/leveling
    starboard/                  # Starboard
    giveaways/                  # Giveaway system
    counters/                   # Channel counters
    autoroles/                  # Auto-role assignment
    fake-perms/                 # Fake permissions
    setup/                      # Setup wizard
  scripts/
    reset-slash-commands.js     # Clear all slash commands
    register-slash.js            # Re-register from modules
```

## Features

### Staff Management
- 5-wing hierarchy with ranked authority
- `/promote` / `/demote` / `/makelead`
- `/strike` / `/strikes` / `/removestrike`
- `/stafflist` with on-break indicators
- Staff breaks (request → approve/deny → auto-end → role restoration)
- Staff activity tracking (`?st` / `/stats`)

### Security & Moderation
- PBAN voting (weighted by rank, 24h expiry, proof collection)
- Ban profiles with `/addproof`, guild ban sync
- Anti-bot automod
- Anti-nuke protection (threshold-based)
- Anti-raid protection (join gate)
- Fake permissions system
- 21 mod commands: ban, kick, warn, mute, tempban, softban, hardban, jail, stripstaff, restorestaff, unban, unwarn, purge, lockdown, slowmode, modlog, case, reason

### Engagement
- Leveling/XP with role rewards
- Starboard
- Giveaways
- Counters (member count, etc.)
- Auto-roles

### Dashboard
- Web UI via Express + OAuth2 (localhost:3000)
- Discord-native UI via interactive embeds (`?dashboard` / `?db`)
- 10-minute auto-invalidation on dashboard sessions
- Full CRUD for hierarchy, permissions, modules
- JSON editor for role policy

## Quick Start

```bash
npm install
cp .env.example .env
# Fill in DISCORD_TOKEN, GUILD_ID, etc.
npm start
```

### Commands
```bash
npm run check           # Syntax validation
npm start               # Start the bot
npm run register-slash  # Re-deploy slash commands (without restart)
npm run reset-slash     # Clear all slash commands
```

## Configuration Files

Edit via **Policies** in the dashboard, or directly:

| File | Purpose | Dashboard Path |
|---|---|---|
| `role-policy.json` | Staff hierarchy with role IDs | Policies → Role Policy |

## Tech Stack

| Component | Current |
|---|---|
| Language | JavaScript (ESM) |
| Runtime | Node.js >= 20 |
| Discord library | discord.js v14.19.3 |
| Database | SQLite (better-sqlite3) |
| Logging | pino |
| Dashboard | Express + Passport.js |
| Testing | vitest |

## License

Proprietary — internal use.
