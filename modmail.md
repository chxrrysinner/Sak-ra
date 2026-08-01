# Modmail/Ticket System — Ref Feature Inventory

This document lists EVERY feature of the modmail/ticket system from the ref monolith (`ref/modmail copy 2/index.js`). Each feature is documented with its exact line number, full description, and status in the modular codebase.

## Verification Process
For each feature:
1. Read the ref implementation (exact lines)
2. Read the modular implementation
3. Compare 1:1 — every line, check, message, variable name
4. Fix any difference
5. Verify 4 times before moving to next feature
6. Mark as ✅ (complete) or ❌ (needs fix)

---

## 1. Constants and Configuration

### 1.1 Command Constants (lines 84-104)
All commands are loaded from `commands.json` via `readRequiredJsonFile`. Each has a key in `COMMANDS` object.

| Key | Default | Ref Variable | Line |
|-----|---------|-------------|------|
| reply | `?r` | `REPLY_PREFIX` | 84 |
| partnershipAd | `?ad` | `PARTNERSHIP_AD_COMMAND` | 85 |
| snippets | `?s` | `SNIPPETS_COMMAND` | 86 |
| help | `?h` | `HELP_COMMAND` | 87 |
| previewPrefix | `!!!` | `SNIPPET_PREVIEW_PREFIX` | 88 |
| timedClose | `?close` | `TIMED_CLOSE_COMMAND` | 89 |
| reportFinished | `?repfin` | `REPORT_FINISHED_COMMAND` | 90 |
| claim | `?c` | `CLAIM_COMMAND` | 91 |
| unclaim | `?unclaim` | `UNCLAIM_COMMAND` | 93 |
| cancelClose | `?cancelclose` | `CANCEL_CLOSE_COMMAND` | 94 |
| timer | `?timer` | `TIMER_COMMAND` | 95 |
| note | `?note` | `NOTE_COMMAND` | 96 |
| userInfo | `?id` | `USER_INFO_COMMAND` | 97 |
| transfer | `?transfer` | `TRANSFER_COMMAND` | 98 |
| rename | `?rename` | `RENAME_COMMAND` | 99 |
| priority | `?priority` | `PRIORITY_COMMAND` | 100 |
| transcript | `?transcript` | `TRANSCRIPT_COMMAND` | 101 |
| claimInfo | `?claiminfo` | `CLAIM_INFO_COMMAND` | 102 |
| closeInfo | `?closeinfo` | `CLOSE_INFO_COMMAND` | 103 |
| escalate | `?escalate` | `ESCALATE_COMMAND` | 104 |

**Status:** ✅ Implemented in `commands.js` with `getTicketCommands()`.

### 1.2 File Path Constants (lines 70-78)
- `PARTNERSHIP_AD_FILE` (line 71) — path to partnership ad text
- `PARTNERSHIP_AD_INTRO_FILE` (line 72) — path to partnership ad intro text
- `TIMED_CLOSE_MESSAGE_FILE` (line 73) — path to timed close message text
- `REPORT_FINISHED_MESSAGE_FILE` (line 74) — path to report finished message text
- `SAVED_SNIPPETS_FILE` (line 75) — path to saved snippets JSON

**Status:** ✅ Config paths exist in `config.js` lines 125-128. `readText` function exists at config.js:78.

### 1.3 Support Panel Constants (lines 64-66)
- `SUPPORT_PANEL_CHANNEL_ID` — channel where support panel is sent
- `SUPPORT_PANEL_BUTTON_ID` — custom ID for the open-ticket button (default: `modmail_open_ticket`)
- `SUPPORT_PANEL_CONTENT` — text content of the support panel message (from env or default)

**Status:** ✅ Config paths exist in `config.js` lines 91-96.

### 1.4 State File Constants (lines 49-53)
- `STATE_FILE` — modmail state JSON (line 49)
- `TIMED_CLOSE_STATE_FILE` — timed close state JSON (line 51)

**Status:** ✅ Config paths exist in `config.js` lines 121-122.

### 1.5 Claim Command Aliases (line 92)
```js
const CLAIM_COMMAND_ALIASES = [...new Set([CLAIM_COMMAND, '?claim'])];
```

**Status:** ❌ Missing from modular code. Used in preview dispatch and exemption from claimed-ticket gate.

---

## 2. State Management

### 2.1 `state` Object (lines 248-254)
```js
let state = {
  ticketsByUserId: {},
  pendingByUserId: {},
  strikesByUserId: {},
  pbanProposalsByMessageId: {},
  banProfilesByGuildUser: {}
};
```

**Status:** ✅ Implemented via `globalThis.__HALLOWS_STATE__`.

### 2.2 `timedCloseState` Object (lines 261-263)
```js
let timedCloseState = { ticketsByUserId: {} };
```
Each entry: `{ closeAt: timestamp }`

**Status:** ✅ Implemented via `globalThis.__HALLOWS_TIMED_CLOSE_STATE__`.

### 2.3 `timedCloseTimeouts` (line 276)
```js
const timedCloseTimeouts = new Map();
```

**Status:** ✅ Implemented via `globalThis.__HALLOWS_TIMED_CLOSE_TIMEOUTS__`.

### 2.4 `ticketChannelRenameJobs` (line 279)
```js
const ticketChannelRenameJobs = new Map();
```

**Status:** ✅ Implemented in `shared.js` line 6.

### 2.5 `ticketChannelLastRenamedAt` (line 280)
```js
const ticketChannelLastRenamedAt = new Map();
```

**Status:** ✅ Implemented in `shared.js` line 7.

---

## 3. State Persistence

### 3.1 `loadState()` (lines 1583-1598)
Reads `STATE_FILE` JSON, merges into `state` object with defaults for each sub-object.

### 3.2 `saveState()` (lines 1600-1603)
Writes `JSON.stringify(state, null, 2)` to `STATE_FILE`.

### 3.3 `loadTimedCloseState()` (lines 1931-1963)
Reads `TIMED_CLOSE_STATE_FILE`, migrates old `autoCloseAt` format, schedules all loaded timers.

### 3.4 `saveTimedCloseState()` (lines 1964-1967)
Writes `JSON.stringify(timedCloseState, null, 2)` to `TIMED_CLOSE_STATE_FILE`.

**Status:** ✅ Implemented via SQLite `state.js` methods `loadTimedCloseState`/`saveTimedCloseState`. DB schema fixed to use `user_id TEXT PRIMARY KEY`.

---

## 4. Ticket Core Functions

### 4.1 `ticketChannelName(userId, username, departmentId)` (line 1153-1162)
Generates a safe channel name: `{prefix}-{username}-{last4ofUserId}`. Sanitizes username (lowercase, alphanumeric+dashes only, max 18 chars).

### 4.2 `ticketTitle(user, departmentId)` (line 1164)
Alias for `ticketChannelName(user.id, user.username, departmentId)`.

**Status:** ✅ Both implemented in `ticket.js` lines 9-21.

### 4.3 `activeChannelFor(userId, guildId)` (lines 3025-3040)
Looks up user's ticket from `state.ticketsByUserId`, fetches channel. If channel fetch fails (deleted), auto-cleanup: remove timed close, delete ticket state, save. Null-safe.

### 4.4 `userIdForChannel(channelId)` (lines 3042-3045)
Reverse lookup — finds userId by scanning `state.ticketsByUserId` for matching channelId.

**Status:** ✅ Both implemented in `ticket.js` lines 23-46.

### 4.5 `recordHistory(userId, entry)` (lines 3047-3058)
Pushes entry to `ticket.history` (max 500). Sets `lastActivityAt`.

**Status:** ✅ Implemented in `ticket.js` lines 48-60.

### 4.6 `openTicket(user, departmentId, guildId)` (lines 3060-3137)
1. Check existing channel via `activeChannelFor` — return if exists
2. Resolve department and guild
3. Resolve category ID, validate category exists
4. Create channel with `ticketTitle` name, in category, with topic
5. Lock permissions to inherit from category
6. Store in `state.ticketsByUserId[user.id]` with full metadata
7. Save state
8. Send intro embed with:
   - Wing, user tag, username, user ID, server display name
   - Instructions: "Use ?r <response> to reply", "Use /close when finished"
   - Ping roles for the department

**Status:** ✅ Implemented in `ticket.js` lines 62-132.

### 4.7 `closeTicket(channel, closedBy, reason, options)` (lines 4311-4388)
1. Look up userId from channel
2. If `!options.skipPermissionCheck`: check claim, check close roles
3. Remove timed close
4. Record history with kind 'TICKET CLOSED'
5. Send transcript
6. Delete from state
7. Notify user via DM with styled embed "Ticket Closed" + reason
8. Send close embed in channel: "Closed by **tag**"
9. If `TRANSCRIPT_CHANNEL_ID` set: delete channel after 5s delay

**Status:** ✅ Implemented in `ticket.js`.

### 4.8 `forceCloseTicketByUserId(userId, closedBy, reason)` (lines 4390-4426)
Force-close a ticket by userId. Handles stale state (channel missing) gracefully. Also cleans up pending state.

**Status:** ✅ Implemented in `fclose.js`.

### 4.9 `sendDepartmentPrompt(message)` (lines 3139-3190)
1. Check for existing/pending ticket
2. Resolve guild from user's context
3. Store pending state with message content, attachments, messageId, channelId, guildId
4. Save state
5. DM user with "Choose a Wing" embed + departmentRow()

**Status:** ✅ Implemented in `ticket.js` lines 134-172.

### 4.10 `sendButtonDepartmentPrompt(user, guildId)` (lines 3192-3225)
Same as above but from support panel button:
1. Check existing/pending
2. Store pending with `source: 'support_button'`
3. DM user with "Choose a Wing" embed + departmentRow()

**Status:** ✅ Implemented in `ticket.js` lines 174-199.

### 4.11 `ensureSupportPanel()` (lines 3227-3258)
1. Check `SUPPORT_PANEL_CHANNEL_ID` configured
2. Fetch channel
3. Fetch last 100 messages
4. Check if any bot message already has the support panel button
5. If not, send support panel content with button

**Status:** ✅ Implemented in `ticket.js` lines 201-227.

### 4.12 `departmentRow()` (lines 1423-1438)
Build a `StringSelectMenuBuilder` with all wings as options. Uses `WING_ORDER` for ordering, each option has label from department, description, and value = departmentId.

### 4.13 `supportPanelRow()` (lines 1440-1445)
Build an `ActionRowBuilder` with a single button using `SUPPORT_PANEL_BUTTON_ID`.

**Status:** ✅ Both implemented in `ticket.js` lines 245-252 and 229-243.

### 4.14 `removeTimedClose(userId)` (lines 2312-2318)
Clear timeout, delete from `timedCloseState`, save.

### 4.15 `scheduleTimedClose(userId)` (lines 2320-2352)
Set timeout to auto-close ticket. Validates timer hasn't changed. Reschedules if close time > now.

### 4.16 `clearTimedCloseTimeout(userId)` (lines 1925-1929)
Clear the timeout without removing state (used in restore).

### 4.17 `restoreTimedCloses()` (lines 2355-2365)
On startup: iterate `timedCloseState`, skip expired, call `scheduleTimedClose` for each. Delete expired timers.

**Status:** ❌ `scheduleTimedClose` and `removeTimedClose` exist in `close.js`. `restoreTimedCloses` exists in `tickets/index.js` onReady. `clearTimedCloseTimeout` is missing from modular code.

---

## 5. Relay Functions

### 5.1 `relayUserDm(message)` (lines 3306-3320)
1. Check if user has pending ticket — if so, send "waiting" message
2. Check if user has active ticket channel — if not, send department prompt
3. If ticket exists but guild doesn't match — send error
4. Relay message to ticket channel via `relayUserParts`

**Status:** ✅ Implemented in `reply.js`.

### 5.2 `relayUserParts(user, content, attachmentUrls, channel, originalMessage)` (lines 3266-3304)
1. Remove timed close
2. Build modmail embeds with author info
3. Send to ticket channel (with claim ping if claimed)
4. Check for partnership + discord invite — send plain text too
5. Record history
6. Save state
7. React ✅ to user's original message

### 5.3 `relayStaffReply(message, userId, replyText)` (lines 3322-3413)
1. Look up ticket — error if none
2. Check reply roles exist — error if none configured
3. Check user has reply role via `memberCanUsePrefixWithRoles` — error if not
4. Fetch user — error if not found
5. Build DM embeds with attachments
6. Send to user — error if DM fails
7. Record history with attachment URLs
8. Save state
9. Delete original message (or react ✅ if has attachments)
10. Echo reply in channel with author field

**Status:** ✅ Implemented in `reply.js` — matches ref after recent rewrite.

---

## 6. Command Handlers

### 6.1 `handleHelpCommand(message, commandName)` (lines 1357-1397)
1. Check `commandRoleIds('help')` permission
2. If no command: show `COMMAND_HELP.h`
3. If `h` command: respond with `'hhhhhhhhhhhhhh wtf are u doing bro'`
4. If unknown command: list available keys
5. Show help for specific command

**Status:** ✅ Rewritten in `help.js`.

### 6.2 `handleSnippetsListCommand(message)` (lines 7151-7166 inline)
1. Check `commandRoleIds('snippets')` permission
2. Show `snippetsEmbed()`

### 6.3 `handleSnippetPermissionsCommand(message, commandName)` (lines 1399-1421)
1. Check snippets permission
2. Show `snippetPermissionsEmbed(commandName)`

### 6.4 `handleSnippetPreview(message, snippetCommand, replyText, userId)` (lines 3522-3661)
1. Check `commandRoleIds('preview')` permission
2. For `?r`: preview staff reply embed with author field
3. For `?ad`: read partnership ad text + intro, send both
4. For `?close`: preview timed close message with author field
5. For `?repfin`: preview report finished message with author field
6. For saved snippets: preview snippet message with author field
7. For control commands: preview via a Map of styledEmbeds

**Status:** ✅ Implemented in `handlers.js`.

### 6.5 `handleSavedSnippetCommand(message, userId, snippet)` (lines 3667-3679)
1. Check snippet branch policy via `savedSnippetCommandPolicy`
2. Call `relayStaffReply` with snippet message

**Status:** ✅ Implemented in `handlers.js`.

### 6.6 `handleClaimCommand(message, userId)` (lines 3681-3715)
1. Check `memberCanReplyToTicket || memberHasTicketClaimAuthority` — error if no perms
2. Check `memberCanTakeOverClaim` — error with takeover denied message
3. Detect previous claimant for takeover history
4. Set `claimedByStaffUserId`, `claimedByStaffTag`, `claimedAt`, `lastReplyStaffUserId`
5. Record history with takeover/claim text
6. Save state
7. Reply with takeover-aware message

**Status:** ✅ Rewritten in `claim.js`.

### 6.7 `handleUnclaimCommand(message, userId)` (lines 3717-3731)
1. Check `memberCanReplyToTicket` reply role
2. Delete `claimedByStaffUserId`, `claimedByStaffTag`, `claimedAt`, `lastReplyStaffUserId`
3. Record history with 'Ticket unclaimed'
4. Reply "This ticket is no longer claimed."

**Status:** ✅ Rewritten in `claim.js`.

### 6.8 `handleTimedCloseCommand(message, userId, minutesText)` (lines 4080-4168)
1. Check ticket exists
2. Validate minutes is positive integer
3. Check close role policy exists and user has permission
4. Fetch user
5. Send TIMED_CLOSE_MESSAGE to user via DM — error if undeliverable
6. Record history with kind 'STAFF REPLY'
7. Store in `timedCloseState` with `closeAt`
8. Save state + saveTimedCloseState
9. Call `scheduleTimedClose(userId)`
10. Delete staff's command message
11. Echo reply in channel with author field

**Status:** ✅ Rewritten in `close.js`.

### 6.9 `handleCancelCloseCommand(message, userId)` (lines 3733-3743)
1. Check user has close role
2. Remove timed close via `removeTimedClose`
3. Reply "The timed close was cancelled." or "no active timer"

**Status:** ✅ Implemented in `close.js`.

### 6.10 `handleTimerCommand(message, userId)` (lines 3745-3756)
1. Check `commandRoleIds('timer')` permission
2. Show remaining time or "no active timer"

**Status:** ✅ In `timer.js`.

### 6.11 `handleNoteCommand(message, userId, text)` (lines 3758-3771)
1. Check text is non-empty
2. Check reply role permission
3. Record history with kind 'STAFF NOTE'
4. Reply with note content

**Status:** ✅ In `note.js`.

### 6.12 `handleUserInfoCommand(message, userId)` (lines 3773-3793)
1. Check `commandRoleIds('userInfo')` permission
2. Show: user tag, ID, wing, priority, opened timestamp, account created/age, claimed by

**Status:** ✅ In `userinfo.js`.

### 6.13 `handleRenameCommand(message, userId, name)` (lines 3913-3938)
1. Check reply role
2. Sanitize name via `safeChannelLabel`
3. Save `customChannelName` + `userName`
4. Sync channel name with priority prefix
5. Record history
6. Reply with renamed/delayed message

**Status:** ✅ In `rename.js`.

### 6.14 `handlePriorityCommand(message, userId, level)` (lines 3940-3981)
1. Check modmail-prefix-command policy for 'priority'
2. Check reply role
3. Validate level: low/normal/high/urgent
4. Set priority
5. Sync channel name with priority prefix
6. Record history
7. Reply with renamed/delayed message

**Status:** ✅ In `priority.js`.

### 6.15 `handleTranscriptCommand(message, userId)` (lines 3983-3992)
1. Check reply role
2. Generate transcript buffer
3. Send as file attachment with "Transcript Preview" message

**Status:** ✅ In `transcript.js`.

### 6.16 `handleClaimInfoCommand(message, userId)` (lines 3994-4004)
1. Check `commandRoleIds('claimInfo')` permission
2. Show claim info or "not claimed"

**Status:** ✅ In `claiminfo.js`.

### 6.17 `handleCloseInfoCommand(message, userId)` (lines 4006-4016)
1. Check `commandRoleIds('closeInfo')` permission
2. Show close timer info or "no active close timer"

**Status:** ✅ In `closeinfo.js`.

### 6.18 `handlePartnershipAdCommand(message, userId)` (lines 3415-3520)
1. Check ticket exists
2. Check command policy for 'partnershipAd'
3. Check `ticketRoleIdsForCommand` permission
4. Read PARTNERSHIP_AD_FILE + PARTNERSHIP_AD_INTRO_FILE
5. Send intro embed + ad text to user via DM
6. Record history
7. Delete staff message
8. Echo in channel with author field

**Status:** ✅ In `ad.js`.

### 6.19 `handleReportFinishedCommand(message, userId)` (lines 4040-4078)
1. Check ticket exists
2. Check command policy + role perms
3. Call `relayStaffReply` with REPORT_FINISHED_MESSAGE

**Status:** ✅ In `report-finished.js`.

### 6.20 `handleEscalateCommand` (lines 7319-7333 inline)
Calls `transferTicket` with department `'internals'`, `allowSameDepartment: true`, custom history/user/staff messages.

**Status:** ✅ In `escalate.js`.

### 6.21 `handleTicketStartCommand(interaction)` (lines 6445-6516)
Slash command `/tstart`. Creates ticket for a target user. Pings department roles. DM notification to target.

**Status:** ✅ In `tstart.js`.

### 6.22 `recordStaffNote(message, userId)` (lines 4170-4179)
Records unmatched messages in ticket channels as staff notes with attachment URLs.

**Status:** ✅ In `reply.js`.

### 6.23 `handleSupportPanelButton(interaction)` (lines 6518-6544)
Button click → check existing → `sendButtonDepartmentPrompt` → reply ephemeral.

**Status:** ✅ In `ticket.js`.

### 6.24 `handleDepartmentSelect(interaction)` (lines 6546-6610)
Select menu → resolve department + pending → `openTicket` → relay pending message (if not support_button) → clean up pending → edit embed with confirmation.

**Status:** ✅ In `ticket.js`.

---

## 7. Embed Builder Functions

### 7.1 `styledEmbed(title, description)` (line 1168)
`new EmbedBuilder().setColor(STYLE_COLOR).setTitle(TITLE_PREFIX + title).setDescription(description).setFooter(FOOTER_TEXT).setTimestamp()`

### 7.2 `modmailMessageEmbed({title, content, attachments, fallback, author})` (lines 1505-1518)
Build single embed for a modmail message. Includes author field if provided, attachment thumbnails.

### 7.3 `modmailMessageEmbeds({title, content, attachments, fallback, author})` (lines 1520-1536)
Like above but splits into multiple embeds if multiple image attachments. First image as main image, rest as additional embeds.

### 7.4 `snippetsEmbed()` (line 1263)
Styled embed listing all snippet commands.

### 7.5 `snippetPermissionsEmbed(commandName)` (lines 1302-1324)
Styled embed showing which roles can use a command.

**Status:** ✅ `styledEmbed` in `embeds.js`. `modmailMessageEmbed`/`modmailMessageEmbeds` in `embeds.js`. `snippetsEmbed`/`snippetPermissionsEmbed` in `snippets.js`.

---

## 8. Permission Functions

### 8.1 `memberCanReplyToTicket(message, ticket)` (line 3663-3665)
Checks if member has reply role for ticket's department via `memberCanUsePrefixWithRoles`.

### 8.2 `memberCanTakeOverClaim(message, ticket)` (lines 677-685)
Checks if member can take over a claimed ticket:
- If no claimant or self-claimed → true
- If claimant left server → true
- Compare `ticketClaimAuthority` of actor vs claimant
- Higher authority wins

### 8.3 `memberHasTicketClaimAuthority(message, ticket)` (lines 687-689)
Checks if member has any claim authority (`ticketClaimAuthority > 0`) in the ticket's wing.

### 8.4 `claimTakeoverDeniedMessage(message, ticket)` (lines 692-695)
Builds the "already claimed by X, need higher rank to take over" message.

### 8.5 `memberCanUsePrefixWithRoles(message, roleIds)` (lines 1131-1133)
Checks if member has any of the given role IDs, OR any global bypass role ID.

### 8.6 `memberCanUsePrefixRoles(guildId, userId, roleIds)` (lines 1126-1129)
Same as above but by guild/user IDs.

**Status:** `memberCanTakeOverClaim`, `memberHasTicketClaimAuthority`, `claimTakeoverDeniedMessage` — ✅ in `permissions.js`. `memberCanUsePrefixRoles` — ✅ in `permissions.js`.

---

## 9. Channel Rename Functions

### 9.1 `safeChannelLabel(value)` (line 3795-3801)
Sanitize string: strip non-alphanumeric, max 20 chars.

### 9.2 `priorityChannelName(ticket, fallbackName)` (lines 3803-3808)
Prepend priority prefix: `🔴-` for urgent, `🟡-` for high, `🟢-` for low, nothing for normal.

### 9.3 `stripPriorityPrefix(name)` (lines 3810-3812)
Remove priority emoji prefix from name.

### 9.4 `renameTicketChannel(channel, name)` (lines 3814-3826)
Set channel name, track last rename time.

### 9.5 `ticketChannelRenameCooldownRemaining(channelId)` (lines 3828-3833)
Check 10-minute cooldown.

### 9.6 `queueTicketChannelRename(channel, name, delayMs)` (lines 3835-3847)
Queue rename with exponential backoff.

### 9.7 `syncTicketChannelName(channel, name)` (lines 3849-3865)
Try rename immediately; if on cooldown, queue with delay.

### 9.8 `runQueuedTicketChannelRename(channelId)` (lines 3867-3901)
Execute queued rename job.

### 9.9 `restoreTicketChannelNames()` (lines 3903-3911)
On startup, restore all ticket channel names from state.

**Status:** All implemented in `shared.js`.

---

## 10. Ticket Transfer Functions

### 10.1 `transferTicket(channel, transferredBy, targetDepartmentId, options)` (lines 6299-6432)
1. Validate channel is GuildText
2. Look up userId from channel
3. Check claim permission
4. Check reply role permission
5. Check same-department guard
6. Look up target category
7. Validate category type
8. Remove timed close
9. Move channel to target category (catch+log error)
10. Update ticket department, unclaim
11. Queue channel rename (with priority prefix)
12. Record history with transfer info
13. Save state
14. DM user with transfer notification
15. Send staff notice with ping roles (catch+log + add warning)
16. Sync category permissions (catch+log + add warning)
17. Return result with warnings

**Status:** ✅ In `transfer.js`.

---

## 11. Message Dispatch (lines 7085-7360)

The `messageCreate` handler in the ref routes messages in this order:
1. DM → relayUserDm
2. Anti-bot automod → handleAntiBotAutomodMessage
3. Staff break message counting
4. PBAN proof reply → handlePbanProofReply
5. Add-proof upload → handleAddProofUpload
6. Prefix commands (if starts with `?` or configured prefix)
7. Within each prefix command: match against all commands in order
8. Fallback in ticket channel → recordStaffNote

**Status:** The modular main.js handles prefix routing differently — each command has its own handler file registered in the registry. The routing order and fallback behavior needs to match.

---

## 12. Interaction Routing (lines 7362-7523)

The `interactionCreate` handler routes:
1. Support panel button → handleSupportPanelButton
2. Department select → handleDepartmentSelect
3. Break approve/deny buttons → handleBreakDecision
4. PBAN vote/abstain/cleanup → handlePbanVoteButton/handlePbanCleanupButton
5. Break request modal → handleBreakRequestModal
6. Chat input commands → individual handlers

**Status:** ✅ Handled in `main.js`.

---

## 13. Timed Close System

### 13.1 `scheduleTimedClose(userId)` (lines 2320-2352)
- Clear existing timeout for user
- Calculate delay = max(0, min(closeAt - now, MAX_INT))
- Set timeout to call `closeTicket` when delay expires
- Re-schedule if closeAt > now (clock adjustment)
- Store timeout in `timedCloseTimeouts` map

### 13.2 `removeTimedClose(userId)` (lines 2312-2318)
- Clear timeout from `timedCloseTimeouts`
- Delete from `timedCloseState.ticketsByUserId`
- Save timed close state

### 13.3 `clearTimedCloseTimeout(userId)` (lines 1925-1929)
- Clear timeout without removing state

**Status:** `scheduleTimedClose` and `removeTimedClose` are ✅ in `close.js`. `clearTimedCloseTimeout` is ❌ missing.

---

## 14. Remaining Features (Non-Ticket)

The following are out of scope for tickets but listed for completeness:
- Break system (staff breaks)
- PBAN system (proposals, voting, cleanup)
- Application reviewer (Google Forms polling, AI review)
- Ban profiles and sync
- Anti-bot automod
- Staff hierarchy and role policy
- Performance plans
- Strike system
- Staff list

---

## Feature Verification Checklist

For each feature below, verify 1:1 match with ref:

- [ ] Constants (commands.json loading, file paths)
- [ ] State management (state objects, save/load)
- [ ] `ticketChannelName` / `ticketTitle`
- [ ] `activeChannelFor` / `userIdForChannel`
- [ ] `recordHistory`
- [ ] `openTicket`
- [ ] `closeTicket` / `forceCloseTicketByUserId`
- [ ] `sendDepartmentPrompt` / `sendButtonDepartmentPrompt`
- [ ] `ensureSupportPanel`
- [ ] `departmentRow` / `supportPanelRow`
- [ ] `removeTimedClose` / `scheduleTimedClose` / `clearTimedCloseTimeout`
- [ ] `relayUserDm` / `relayUserParts` / `relayStaffReply`
- [ ] `handleHelpCommand`
- [ ] `handleSnippetsListCommand` / `handleSnippetPermissionsCommand`
- [ ] `handleSnippetPreview`
- [ ] `handleSavedSnippetCommand`
- [ ] `handleClaimCommand` / `handleUnclaimCommand`
- [ ] `handleTimedCloseCommand` / `handleCancelCloseCommand`
- [ ] `handleTimerCommand`
- [ ] `handleNoteCommand`
- [ ] `handleUserInfoCommand`
- [ ] `handleRenameCommand`
- [ ] `handlePriorityCommand`
- [ ] `handleTranscriptCommand`
- [ ] `handleClaimInfoCommand` / `handleCloseInfoCommand`
- [ ] `handlePartnershipAdCommand`
- [ ] `handleReportFinishedCommand`
- [ ] `handleEscalateCommand`
- [ ] `handleTicketStartCommand`
- [ ] `recordStaffNote`
- [ ] `handleSupportPanelButton` / `handleDepartmentSelect`
- [ ] `styledEmbed` / `modmailMessageEmbeds` / `snippetsEmbed` / `snippetPermissionsEmbed`
- [ ] `safeChannelLabel` / `priorityChannelName` / `stripPriorityPrefix`
- [ ] `renameTicketChannel` / `queueTicketChannelRename` / `syncTicketChannelName`
- [ ] `restoreTicketChannelNames`
- [ ] `transferTicket`
- [ ] `memberCanReplyToTicket` / `memberCanTakeOverClaim` / `memberHasTicketClaimAuthority`
- [ ] `memberCanUsePrefixWithRoles` / `memberCanUsePrefixRoles`
- [ ] Message dispatch order (DM → anti-bot → break count → PBAN proof → prefix commands → fallback note)
- [ ] Interaction routing order
- [ ] `RESTORE_TIMED_CLOSES` on startup
- [ ] `TIMER_PRESERVING_PREFIX_COMMANDS` — commands that DON'T cancel timed close
