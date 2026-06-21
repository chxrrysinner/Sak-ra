# Sak-ra

This is one Discord bot that handles both modmail tickets and Google Form staff application reviews.

## KataBump Layout

Upload the contents of this `modmail` folder as the server root:

```text
package.json
package-lock.json
index.js
google-auth.js
.env
README.md
commands.json
partnership-ad.txt
partnership-ad-intro.txt
timed-close-message.txt
report-finished-message.txt
saved-snippets.json
role-policy.json
ticket-branch-policy.json
modmail-command-policy.json
```

In KataBump's **Startup** tab, set `JS FILE` to:

```text
index.js
```

KataBump will install dependencies from `package.json` on startup.

## Discord Setup

Enable these bot settings in the Discord Developer Portal:

```text
MESSAGE CONTENT INTENT
SERVER MEMBERS INTENT
```

Invite the bot with these permissions:

```text
View Channels
Send Messages
Manage Channels
Manage Messages
Manage Roles
Embed Links
Read Message History
Add Reactions
Use Slash Commands
Create Public Threads
Send Messages in Threads
```

## Environment

Create a `.env` file from `.env.example`:

```text
DISCORD_TOKEN=your_discord_bot_token
SUPPORT_PANEL_CHANNEL_ID=the_channel_id_to_post_support_panel
SUPPORT_PANEL_BUTTON_ID=modmail_open_ticket
SUPPORT_PANEL_CONTENT="# dm me for support!\nyou can dm me or click the button below for support regarding partnerships, general support, user reporting, HR, or internals!"
APPROVED_APPLICANT_ROLE_ID=optional_extra_legacy_role
APPROVE_GHOST_PING_CHANNEL_ID=channel_id_to_ghost_ping_approved_applicants
APPROVE_DM_MESSAGE="​꒰ Hello <user>! ꒱\n​We’ve reviewed your application and have some wonderful news you have been accepted!  We are so happy to have you apart of the team! please review the staff handbook, and make yourself known within the staff team! thank you for applying! 𐙚 𐐪𐑂\n​─── ⋆⋅☆⋅⋆ ───"
REJECT_DM_MESSAGE="Hello. Thank you for applying for staff. Upon reviewing your application we unfortunately decided to not move forward with you as of this time. Your application has been cleared and you are free to try again with a new application whenever you wish to. Thank you for your time."

STATE_FILE=./data/modmail-state.json
ROLE_POLICY_FILE=./role-policy.json
TICKET_BRANCH_POLICY_FILE=./ticket-branch-policy.json
MODMAIL_COMMAND_POLICY_FILE=./modmail-command-policy.json
REVIEWER_STATE_FILE=./data/app-review-state.json
TIMED_CLOSE_STATE_FILE=./data/ticket-close-timers.json
BREAK_STATE_FILE=./data/staff-breaks.json
PARTNERSHIP_AD_FILE=./partnership-ad.txt
PARTNERSHIP_AD_INTRO_FILE=./partnership-ad-intro.txt
TIMED_CLOSE_MESSAGE_FILE=./timed-close-message.txt
REPORT_FINISHED_MESSAGE_FILE=./report-finished-message.txt
SAVED_SNIPPETS_FILE=./saved-snippets.json
COMMANDS_FILE=./commands.json
BREAK_REQUEST_CHANNEL_ID=1511198192211988581

BOT_STYLE_COLOR=0xffb7c5
BOT_TITLE_PREFIX=🌸
BOT_FOOTER="ModMail  🌸"

DISCORD_CHANNEL_ID=the_channel_id_to_post_applications
GOOGLE_FORM_ID=your_google_form_id
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_REFRESH_TOKEN=your_google_oauth_refresh_token
GOOGLE_AUTH_PORT=3000
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MAX_OUTPUT_TOKENS=3000
POLL_INTERVAL_SECONDS=60
APPLICATION_POST_DELAY_SECONDS=30
PROCESS_EXISTING_RESPONSES=false
THREAD_AUTO_ARCHIVE_MINUTES=1440

GUILD_ID=
GENERAL_CATEGORY_ID=general_questions_category_id
PARTNERSHIP_CATEGORY_ID=partnership_category_id
REPORT_CATEGORY_ID=moderation_reports_category_id
HR_CATEGORY_ID=hr_category_id
INTERNALS_CATEGORY_ID=internals_category_id

TRANSCRIPT_CHANNEL_ID=closed_ticket_logs_channel_id
```

`SUPPORT_PANEL_CHANNEL_ID` is optional. If it is set, the bot ensures that channel has the public support button message on startup. If it is blank, the support panel is skipped and users can still open tickets by DMing the bot.

`/approve`, `/reject`, `/demote`, `/promote`, `/makelead`, `/strike`, and `/removestrike` use Discord's server user picker. Their allowed ranks are configured in `role-policy.json`. Approved users receive Assistant rank 1 from `staffHierarchy.assistants`, also receive `APPROVED_APPLICANT_ROLE_ID` if that optional legacy env value is set, get the acceptance DM, and are ghost pinged in `APPROVE_GHOST_PING_CHANNEL_ID` for 0.5 seconds. Rejected users only receive the rejection DM.

`/strike <user> <reason>` only works when the selected member has a role in the configured `staffHierarchy`. `/removestrike <user>` removes one stored strike. Both commands notify the selected user by DM. Any member in the staff hierarchy can run `/strikes` to check their own count. Ranks listed for `strikesOthers` can use the optional `/strikes user:<user>` field to check another user's count.

The bot needs `Manage Roles`, and its highest role must be above Assistant rank 1 and any optional role in `APPROVED_APPLICANT_ROLE_ID`.

The bot creates each ticket under the matching category and syncs channel permissions to that category:

- `ASSISTANTS_CATEGORY_ID` for Assistants. `GENERAL_CATEGORY_ID` still works as a fallback.
- `PARTNERSHIP_CATEGORY_ID` for Partnership Request
- `REPORT_CATEGORY_ID` for Report a User
- `HR_CATEGORY_ID` for HR
- `INTERNALS_CATEGORY_ID` for Internals. `STAFF_APPLICATION_CATEGORY_ID` still works as a fallback.

Set the category permissions in Discord. For example, let partnership managers view general-question tickets but deny them `Send Messages` in that category. New ticket channels inherit those category rules.

`GUILD_ID` can be left blank when the bot is only in one server. If the bot is ever added to multiple servers, set it to the intended server ID so the bot does not have to guess.

`role-policy.json` can use raw Discord role IDs directly. The old `roles` alias map and optional `wingRoleIds` map are still supported for compatibility, but they are not required. `staffHierarchy` is the source of truth and is split by wing: `internals`, `hr`, `partnership`, `moderation`, and `assistants`; executive and regional roles belong under `internals`. Hierarchy entries inside normal wings use `number,roleId` or `M,roleId`. Any plain role ID listed under `internals` counts as internal automatically, and `I,roleId` is still accepted there for compatibility. Other policy sections can reference those hierarchy entries with `number,wing`, `M,wing`, `I,wing`, or the bare wing name. For example, `1,assistants` resolves to rank 1, `M,assistants` resolves to the lead role, and `I,internals` resolves to every role in `staffHierarchy.internals`. This lets each wing list grow without adding new variables.

Command and ticket role arrays also support `all` and `all-wing`. `all` means every role in every staff hierarchy wing. `all-moderation` means every staff hierarchy role except the roles in the moderation wing. `all-internals` is treated the same as `all`, because Internals should always keep global wing access.

Wing references accept common abbreviations: `int` for Internals, `hr` for HR, `part` for Partnership, `mod` for Moderation, and `assi` for Assistants. These work in hierarchy references such as `M,int`, `1,mod`, and `all-part`.

`categoryRoles` in `role-policy.json` lists cosmetic wing roles for `moderation`, `partnership`, `hr`, and `internals`. Assistants intentionally has no category role. Promotion and lead assignment remove any other category role before adding the selected wing's category role when one is configured.

`leadCategoryRole` in `role-policy.json` is the shared head-of-wing role for all wing leads. `/makelead` requires this value so wing heads receive their wing's `M` role, the shared head-of-wing role, and their wing category role, except Assistants which has no category role. The bot automatically adds the shared role to any member who has an `M` role in `staffHierarchy` and removes it when they no longer have any `M` role. This sync runs on startup, after promotion, demotion, lead assignment, and Discord member role updates.

Each wing has three ticket role attributes in `ticket-branch-policy.json`:

- `ping` ranks are pinged when a new ticket opens.
- `reply` ranks can use `?r <response>` in that wing's tickets.
- `close` ranks can use `/close` in that wing's tickets.

`modmail-command-policy.json` inventories every modmail prefix command, saved snippet command, and ticket slash command. Ticket commands reference `reply` or `close` permissions from `ticket-branch-policy.json`. Commands that only work in specific branches declare `allowedBranches`.

Internals tickets allow every modmail prefix command, including snippets normally limited to partnership or moderation tickets. Staff still need the internals ticket's configured reply or close rank required by that command.

If a staff member without an allowed role uses `?r <response>`, `/transfer`, or `/close` in a ticket, the bot returns a private error.

`TRANSCRIPT_CHANNEL_ID` is recommended. If it is set, closed tickets are logged there and the ticket channel is deleted after closing. If it is blank, the transcript is posted in the ticket channel and the channel is left in place.

`PARTNERSHIP_AD_INTRO_FILE` points to the saved intro text sent before the partnership ad. Edit `partnership-ad-intro.txt` to update that message without changing bot code.

`TIMED_CLOSE_MESSAGE_FILE` points to the saved warning sent by `?close <time>`. Edit `timed-close-message.txt` to update that embed text without changing bot code.

`REPORT_FINISHED_MESSAGE_FILE` points to the saved report response sent by `?repfin`. Edit `report-finished-message.txt` to update that embed text without changing bot code.

`SAVED_SNIPPETS_FILE` points to the editable saved responses used by common snippets such as `?wait`, `?askproof`, and `?partneraccept`.

`COMMANDS_FILE` points to the command configuration. Edit `commands.json` to change the `?` commands or the `!!!` preview prefix without changing bot code.

`TIMED_CLOSE_STATE_FILE` stores active `?close <time>` deadlines. The bot reloads this file after a restart and resumes pending ticket timers.

`BREAK_STATE_FILE` stores pending and active staff breaks. `BREAK_REQUEST_CHANNEL_ID` defaults to `1511198192211988581`.

## Staff Breaks

- Ranks listed for `break` can use `/break` to open a modal asking for the break length and reason.
- The bot posts the request in `BREAK_REQUEST_CHANNEL_ID`. Ranks listed for `manageBreaks` can approve or deny it.
- If the duration cannot be parsed, a rank listed for `manageBreaks` can reply to the request embed with a duration such as `3d` or `2 weeks`.
- Approval removes the requester's configured staff hierarchy and wing staff roles until the break ends. Denial does not change roles.
- Active breaks persist across restarts and end when their deadline passes, when the member uses `/endbreak`, or after the member sends more than 25 server messages during the break.

## ModMail

- A user DMs the bot.
- The bot asks them to choose one of five wings.
- The bot creates or reuses a private staff channel in the matching category.
- The user's DM appears in that channel as a pink styled embed.
- The user gets a `✅` acknowledgement.
- Staff can discuss normally in the ticket channel without sending messages to the user.
- Staff reply to the user with `?r <response>`.
- Staff with a rank listed for `snippets` can list the available snippets with `?s`.
- Staff with a rank listed for `snippets` can check which roles may use a command with `?s <command> perms`, such as `?s r perms` or `?s ad perms`. Ticket command permissions are listed by wing.
- Staff with a rank listed for `preview` can preview any prefix-command output inside a ticket by replacing `?` with `!!!`, such as `!!!r <response>`, `!!!ad`, `!!!close`, or `!!!priority urgent`. Previews never send anything to the user or change ticket state.
- Staff with a rank listed for `help` can view descriptions with `?h <command>`, such as `?h ad`, `?h r`, or `?h s`.
- Partnership staff can send the saved partnership ad snippet with `?ad`.
- Staff with moderation reply access can send the saved investigation response with `?repfin` inside moderation tickets.
- Staff with a wing close role can send `?close <time>` to warn the user and automatically close the ticket after that many minutes. A new message from the user cancels the timer silently.
- Staff can use saved responses such as `?wait`, `?askproof`, `?askid`, `?resolved`, `?deny`, `?partneraccept`, `?partnerdeny`, and `?appstatus`.
- Ticket controls include `?c` (`?claim`), `?unclaim`, `?cancelclose`, `?timer`, `?note <text>`, `?id`, `?transfer <wing>`, `?rename <name>`, `?priority <level>`, `?transcript`, `?claiminfo`, `?closeinfo`, and `?escalate`.
- `?c` and `?claim` claim a ticket. Normal claims require a reply rank or hierarchy role for the ticket's current wing. Claim takeovers compare the numbered hierarchy for that wing: higher numbers can overtake lower numbers, `M` wing leads overtake the highest number, HR overtakes wing leads, and Internals overtakes HR. After `?unclaim`, another eligible staff member can claim the ticket. Staff must claim a ticket before using ticket commands unless their rank is listed for `overrideClaims`. Later messages from the user ping the claimant only; unclaimed tickets do not ping the last responder.
- `?priority` accepts `low`, `normal`, `high`, or `urgent`, can be changed any number of times, persists the latest level, and immediately prefixes non-normal ticket channel names. Failed Discord renames are retried and restored after a bot restart.
- `?rename` persists the requested ticket name and immediately attempts the Discord channel-name update. Failed Discord renames are retried automatically.
- `?escalate` transfers the ticket to `internals`, pings the configured internals ranks, DMs the ticket opener, and can be used again inside an internals ticket. Its success notice is posted after the move inside the internals ticket.
- `?transfer` and `/transfer` move every wing (`internals`, `hr`, `partnership`, `moderation`, and `assistants`) before syncing category permissions, automatically unclaim the ticket, and do not fail solely because of a permission-sync warning.
- Staff with reply access can transfer with `/transfer`.
- Staff can use `/stafflist` to list current staff by wing. Staff on active break are listed last in each wing and marked as on break. Wing lead roles marked with `M` in `staffHierarchy` are shown as `(lead)`.
- Staff can close the conversation with `/close`.
- Closing creates a text transcript and pink summary embed.

`?r <response>` only works inside ticket channels for ranks listed in that wing's `reply` policy.

## Application Reviewer

- The bot polls the configured Google Form.
- New responses are posted in `DISCORD_CHANNEL_ID`.
- The bot opens a thread from each application post.
- Gemini posts an AI reviewer opinion in the thread.
- `/refresh` manually checks for new responses.
- `/approve` lets approved staff select one server member, DM their acceptance, assign Assistant rank 1 plus any optional approved-applicant legacy role, and ghost ping them.
- `/reject` lets approved staff select one server member and DM the rejection message.
- `/demote <user> <wing> <reason>` lets HR and Internals demote a server member one step down through that wing's numbered `staffHierarchy`; members at rank `1` are removed from that wing instead.
- `/promote <user> <wing>` lets HR and Internals promote within the selected wing's numbered hierarchy. Assistants can be promoted into any wing and lose their assistant hierarchy role. Cross-wing promotions from a non-assistant wing fail. Promotion stops at the highest numbered role; use `/makelead` for `M` roles.
- `/makelead <user> <wing>` lets HR and Internals replace the member's role in that wing with the wing's `M` role.
- `/strike` lets approved staff give a hierarchy member a stored strike and DM the reason.
- `/strikes` lets hierarchy members check their own strike count; approved staff can optionally check another user.
- `/removestrike` lets approved staff remove one stored strike and DM the affected user.
- `/pban` opens a permanent-ban proposal. Vote weight is based on the voter's highest eligible staff hierarchy role: `1,assistants` is 2, `M,assistants` is 3, `1,moderation` is 3, `1,hr` is 2, `M,hr` is 4, and other eligible non-partnership staff roles are 6. Partnership/collab roles cannot vote. A proposal passes at 6 total weight.

To get `GOOGLE_REFRESH_TOKEN`, add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`, then run:

```bash
npm run google:auth
```

If the bot logs `invalid_grant` or says the Google refresh token is expired or revoked, run the same command again, replace `GOOGLE_REFRESH_TOKEN` with the new value, and restart the bot.

## Run Locally

```bash
npm install
npm run check
npm start
```
