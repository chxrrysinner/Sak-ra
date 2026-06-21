# Modmail Wing System Handoff

## Current Model

The bot now uses five ticket/staff wings in this order:

1. `internals`
2. `hr`
3. `partnership`
4. `moderation`
5. `assistants`

Executive and regional roles are included under `internals`.

## Role Policy

`role-policy.json` no longer needs a `roles` alias map. Compatibility support for old `roles`, `wingRoleIds`, and `staffRoleIds` is still in the resolver, but the intended source of truth is now `staffHierarchy`.

`staffHierarchy` stores the real role IDs for each wing:

```json
"assistants": [
  "1,1111",
  "2,2222",
  "3,3333",
  "M,5555"
]
```

Rules:

- `1,roleId` is the lowest numbered rank.
- Higher numbers outrank lower numbers.
- Array order does not matter; the number controls rank.
- `M,roleId` is the wing lead role.
- Any plain role ID under `internals` is treated as internal.
- `I,roleId` still works under `internals` for compatibility, but it is redundant.

Other policy sections can reference hierarchy entries dynamically:

- `assistants` means every role in `staffHierarchy.assistants`.
- `1,assistants` means rank 1 in `staffHierarchy.assistants`.
- `M,assistants` means the assistants lead role.
- `I,internals` means all roles under `staffHierarchy.internals`.
- `all` means every role from every wing in `staffHierarchy`.
- `all-moderation` means every `staffHierarchy` role except the moderation wing.
- `all-internals` is treated as `all`; Internals is never excluded from global wing access.
- Wing abbreviations work in hierarchy references: `int`, `hr`, `part`, `mod`, and `assi`.

This is intentional so wings can add ranks without creating new config variables.

## Commands

`/demote <user> <wing> <reason>`, `/promote <user> <wing>`, and `/makelead <user> <wing>` can only be used by HR and Internals hierarchy roles.

Promotion behavior:

- Assistants can be promoted into any wing.
- Cross-wing promotion from a non-assistant wing fails.
- Promotion uses numbered roles only.
- If the member is at the highest numbered role, `/promote` fails and `/makelead` must be used.
- Promoting from Assistants into another wing removes the assistant hierarchy role.

Demotion behavior:

- Numbered ranks demote to the next lower number.
- Rank `1` demotion removes the member from that wing.
- `M` demotion moves the member to the highest numbered role in that wing.

Lead behavior:

- `/makelead` removes the member's current role in that wing and assigns the `M` role.

Category roles:

- `role-policy.json` has `categoryRoles` for cosmetic wing roles.
- Assistants intentionally has no category role.
- Promotion/makelead removes other category roles and adds the selected wing category role.
- `leadCategoryRole` is required for `/makelead`. Wing heads receive their wing's `M` role, the shared head-of-wing role from `leadCategoryRole`, and their wing category role when one is configured. Assistants has no category role.
- Anyone with at least one `M` role in `staffHierarchy` automatically receives `leadCategoryRole`; it is removed when they no longer have any `M` role.
- Lead category sync runs on startup, after promote/demote/makelead, and on Discord member role updates.

Current default command policy examples:

- `timer` uses `["all"]`
- `ping` uses `["all-moderation"]`

Ticket claim takeover:

- Higher numbered rank can overtake lower numbered rank within the same wing.
- `M` wing lead outranks all numbered roles.
- HR outranks `M`.
- Internals outranks HR.

PBAN vote weights:

- `1,assistants`: 2
- `M,assistants`: 3
- `1,moderation`: 3
- `1,hr`: 2
- `M,hr`: 4
- Other eligible non-partnership staff roles: 6
- Partnership/collab roles cannot vote.

## Ticket Transfers

`?transfer <wing>` and `/transfer wing:<wing>` use the same transfer logic.

Rules:

- Transfers must run inside an open modmail ticket channel.
- Staff must have the ticket claimed unless their role is allowed by `overrideClaims`.
- Staff need a `reply` role for the ticket's current wing; Internals still has the global ticket-command bypass.
- Valid targets are `assistants`, `partnership`, `moderation`, `hr`, and `internals`, plus transfer aliases like `general`, `support`, `partner`, `mod`, `report`, `manage`, and `internal`.
- The target wing must have a category env var configured and the category must exist.

Transfer effects:

- Cancels any active timed close.
- Moves the channel to the target wing category.
- Updates the ticket `departmentId`.
- Unclaims the ticket.
- Queues a channel rename using the target wing prefix.
- DMs the ticket opener.
- Pings the destination wing `ping` roles from `ticket-branch-policy.json`.
- Posts a staff transfer notice.
- Syncs channel permissions from the destination category when the category changes.
- If the move succeeds but notice posting or permission sync fails, the transfer still succeeds and returns a warning.

## Staff List

`/stafflist` displays wings in the global order:

`internals`, `hr`, `partnership`, `moderation`, `assistants`

It uses `staffHierarchy` directly and labels entries as:

- `(internal)`
- `(lead)`
- `(rank N)`

On-break staff are listed using their removed roles.

## Compatibility

The code still supports older `roles`, `wingRoleIds`, and `staffRoleIds` maps through the resolver, but new config should prefer direct `staffHierarchy` role IDs and hierarchy references like `assistants`, `1,assistants`, `M,assistants`, `I,internals`, or `all-hr`. Plain role IDs under `staffHierarchy.internals` count as internal; `I,roleId` is only a compatibility form there.

Old branch aliases still normalize:

- `general` -> `assistants`
- `report` -> `moderation`
- `staff_application` / `manage` / `management` -> `internals`

## Environment

`.env.example` was updated alongside the wing split.

Current relevant entries:

- `ASSISTANTS_CATEGORY_ID`
- `PARTNERSHIP_CATEGORY_ID`
- `REPORT_CATEGORY_ID`
- `HR_CATEGORY_ID`
- `INTERNALS_CATEGORY_ID`

Legacy fallbacks are still present but optional:

- `GENERAL_CATEGORY_ID`
- `STAFF_APPLICATION_CATEGORY_ID`

`/approve` assigns the lowest numbered Assistant role from `staffHierarchy.assistants` (rank `1`). `APPROVED_APPLICANT_ROLE_ID` is legacy and optional; if set, `/approve` adds it as an extra role after Assistant rank `1`.

## Verification

Last verified with:

```sh
npm run check
node index.js
```

`npm run check` passes. `node index.js` reaches the expected missing `DISCORD_TOKEN` guard after policy validation.
