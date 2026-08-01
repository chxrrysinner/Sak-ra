import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import client from '../../core/client.js';
import { styledEmbed, trimTo } from '../../core/embeds.js';
import { staffRoleHierarchyIds, memberHasAnyCachedRole, staffWingNameFor } from '../../core/permissions.js';

export function memberDisplayName(member) {
  return member.displayName || member.user?.username || member.id;
}

export function sortStaffListEntries(entries) {
  return entries.sort((a, b) =>
    a.rankSortValue - b.rankSortValue
    || a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
  );
}

export function userIdsOnBreakForDepartment(guildId, departmentRoleIds) {
  const brState = globalThis.__HALLOWS_BREAK_STATE__ || {};
  return Object.entries(brState.activeByUserId || {})
    .filter(([, activeBreak]) =>
      activeBreak.guildId === guildId
      && (activeBreak.removedRoleIds || []).some((roleId) => departmentRoleIds.includes(roleId))
    )
    .map(([userId]) => userId);
}

export function chunkStaffListValue(lines) {
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > 1000 && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function parseBreakDuration(text) {
  const value = text.trim().toLowerCase();
  const match = value.match(/^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;

  const unitMs = {
    m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000,
    h: 3_600_000, hr: 3_600_000, hrs: 3_600_000, hour: 3_600_000, hours: 3_600_000,
    d: 86_400_000, day: 86_400_000, days: 86_400_000,
    w: 604_800_000, week: 604_800_000, weeks: 604_800_000
  }[match[2]];
  const durationMs = amount * unitMs;
  return Number.isSafeInteger(durationMs) ? durationMs : null;
}

export function formatBreakDuration(ms) {
  const units = [
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000]
  ];

  for (const [label, unitMs] of units) {
    if (ms % unitMs === 0) {
      const amount = ms / unitMs;
      return `${amount} ${label}${amount === 1 ? '' : 's'}`;
    }
  }

  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function breakDecisionRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`staff_break_approve:${userId}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`staff_break_deny:${userId}`)
      .setLabel('Deny')
      .setStyle(ButtonStyle.Secondary)
  );
}

export function breakRequestEmbed(request, status = null) {
  const period = request.durationMs
    ? formatBreakDuration(request.durationMs)
    : `Needs clarification. Reply to this embed with a duration such as \`3d\` or \`2 weeks\`.`;
  const lines = [
    `**Staff Member:** <@${request.userId}> (\`${request.userId}\`)`,
    `**Requested Length:** ${trimTo(request.durationText, 200)}`,
    `**Time Period:** ${period}`,
    `**Reason:** ${trimTo(request.reason, 1000)}`
  ];

  if (status) lines.push('', `**Status:** ${status}`);
  return styledEmbed('Staff Break Request', lines.join('\n'));
}

export function breakRequestModal() {
  return new ModalBuilder()
    .setCustomId('staff_break_request_modal')
    .setTitle('Request a Staff Break')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('duration')
          .setLabel('How long is the break?')
          .setPlaceholder('Example: 3d or 2 weeks')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Why are you requesting a break?')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true)
      )
    );
}

function clearBreakTimeout(userId) {
  const timeouts = globalThis.__HALLOWS_BREAK_TIMEOUTS__;
  if (!timeouts) return;
  const timeout = timeouts.get(userId);
  if (timeout) clearTimeout(timeout);
  timeouts.delete(userId);
}

export async function endStaffBreak(userId, reason) {
  const brState = globalThis.__HALLOWS_BREAK_STATE__ || {};
  const activeBreak = brState.activeByUserId?.[userId];
  if (!activeBreak) return { ok: false, message: 'You do not have an active staff break.' };

  clearBreakTimeout(userId);
  const guild = await client.guilds.fetch(activeBreak.guildId).catch(() => null);
  const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
  const onBreakRoleId = process.env.ON_BREAK_ROLE_ID || null;
  if (onBreakRoleId) {
    await member?.roles.remove(onBreakRoleId, `Staff break ended: ${reason}`).catch(() => null);
  }
  if (member && activeBreak.removedRoleIds?.length) {
    await member.roles.add(activeBreak.removedRoleIds, `Staff break ended: ${reason}`);
  }

  delete brState.activeByUserId[userId];
  if (typeof globalThis.__HALLOWS_SAVE_BREAK_STATE__ === 'function') {
    await globalThis.__HALLOWS_SAVE_BREAK_STATE__();
  }

  const user = await client.users.fetch(userId).catch(() => null);
  await user?.send({
    embeds: [styledEmbed('Staff Break Ended', reason)],
    allowedMentions: { parse: [] }
  }).catch(() => null);

  return { ok: true, message: 'Your break is ended, welcome back.' };
}

export function scheduleStaffBreakEnd(userId) {
  clearBreakTimeout(userId);
  const brState = globalThis.__HALLOWS_BREAK_STATE__ || {};
  const activeBreak = brState.activeByUserId?.[userId];
  const endsAt = Number(activeBreak?.endsAt);
  if (!Number.isFinite(endsAt)) return;

  const delay = Math.max(0, Math.min(endsAt - Date.now(), 2_147_483_647));
  const timeouts = globalThis.__HALLOWS_BREAK_TIMEOUTS__ || new Map();
  const timeout = setTimeout(async () => {
    timeouts.delete(userId);
    const currentBrState = globalThis.__HALLOWS_BREAK_STATE__ || {};
    const currentBreak = currentBrState.activeByUserId?.[userId];
    if (!currentBreak || Number(currentBreak.endsAt) !== endsAt) return;
    if (endsAt > Date.now()) {
      scheduleStaffBreakEnd(userId);
      return;
    }

    await endStaffBreak(userId, 'your break is ended, welcome back.').catch((error) => {
      console.error(`Could not end expired staff break for ${userId}:`, error);
    });
  }, delay);
  timeouts.set(userId, timeout);
}

export function strikeRecordsFor(userId) {
  const state = globalThis.__HALLOWS_STATE__ || {};
  const strikes = state.strikesByUserId?.[userId];
  if (Array.isArray(strikes)) {
    return strikes.map(s => ({ reason: s?.reason || 'Reason unavailable.' }));
  }
  const legacyCount = Number(strikes) || 0;
  return Array.from({ length: legacyCount }, () => ({ reason: 'Reason unavailable.' }));
}
