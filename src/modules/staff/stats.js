import { EmbedBuilder } from 'discord.js';
import stateManager from '../../core/state.js';
import { HALLOWS_ORANGE } from '../../core/embeds.js';
import { getPrefix } from '../../core/prefix.js';
import { staffRoleHierarchyIds, memberHasAnyCachedRole, memberHasPermission } from '../../core/permissions.js';
import client from '../../core/client.js';

async function resolveTarget(context, query) {
  if (!query) return context.member || await context.guild.members.fetch(context.author.id).catch(() => null);
  const id = query.replace(/[<@!>]/g, '');
  try { return await context.guild.members.fetch(id); } catch {}
  try {
    const users = await context.guild.members.fetch({ query, limit: 1 });
    return users.first() || null;
  } catch { return null; }
}

function formatNumber(n) {
  return n.toLocaleString();
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function generateSparkline(guildId, userId, days = 7) {
  const bars = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = daysAgo(i);
    const row = stateManager.db.prepare(
      'SELECT message_count FROM staff_activity WHERE guild_id = ? AND user_id = ? AND date = ?'
    ).get(guildId, userId, date);
    const count = row?.message_count || 0;
    bars.push(count);
  }
  const max = Math.max(...bars, 1);
  return bars.map((c) => {
    const pct = Math.round((c / max) * 8);
    return ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'][Math.min(pct, 7)] || '▁';
  }).join('');
}

function isStaffMember(member) {
  if (!member) return false;
  const roleIds = staffRoleHierarchyIds();
  return memberHasAnyCachedRole(member, roleIds);
}

async function handleStatsCommand(context, args) {
  const isMessage = !!context.author;
  const guild = context.guild || await client.guilds.fetch(context.guildId).catch(() => null);
  if (!guild) {
    await context.reply('Could not find guild.');
    return;
  }

  const member = isMessage ? context.member : (context.member || await guild.members.fetch(context.user.id).catch(() => null));
  if (!member) {
    await context.reply({ content: 'Could not identify you.', ephemeral: true });
    return;
  }

  if (!isStaffMember(member)) {
    const reply = isMessage ? await context.reply('This command is for staff members only.') : await context.reply({ content: 'This command is for staff members only.', ephemeral: true });
    return;
  }

  let targetMember = member;
  let isSelf = true;
  if (args && args.trim()) {
    const canViewOthers = memberHasPermission(member, 'staff.strikesOthers');
    if (!canViewOthers) return;
    targetMember = await resolveTarget(context, args.trim());
    if (!targetMember) {
      await context.reply({ content: 'Could not find that user.', ephemeral: true });
      return;
    }
    isSelf = targetMember.id === member.id;
  }

  const guildId = guild.id;
  const userId = targetMember.id;
  const prefix = getPrefix(guildId);

  const week = stateManager.getStaffActivity(guildId, userId, 7);
  const allTime = stateManager.getStaffActivityAllTime(guildId, userId);
  const sparkline = generateSparkline(guildId, userId);

  const embed = new EmbedBuilder()
    .setColor(HALLOWS_ORANGE)
    .setTitle('Staff Activity: ' + (targetMember.displayName || targetMember.user.username))
    .setThumbnail(targetMember.user.displayAvatarURL())
    .addFields(
      {
        name: 'Last 7 Days',
        value: [
          '📝 Messages: **' + formatNumber(week.messages) + '**',
          '🔨 Mod Actions: **' + formatNumber(week.modActions) + '**',
          '',
          '`' + sparkline + '`'
        ].join('\n'),
        inline: false
      },
      {
        name: 'All Time',
        value: [
          '📝 Messages: **' + formatNumber(allTime.messages) + '**',
          '🔨 Mod Actions: **' + formatNumber(allTime.modActions) + '**'
        ].join('\n'),
        inline: false
      },
      {
        name: 'Joined',
        value: '<t:' + Math.floor(targetMember.joinedAt / 1000) + ':R>',
        inline: true
      },
      {
        name: 'Roles',
        value: String(targetMember.roles.cache.filter((r) => r.name !== '@everyone').size),
        inline: true
      }
    )
    .setFooter({ text: isSelf ? 'Your stats' : 'Requested by ' + member.displayName })
    .setTimestamp();

  if (isMessage) {
    await context.reply({ embeds: [embed] });
  } else {
    await context.reply({ embeds: [embed], ephemeral: true });
  }
}

async function handlePrefixCommand(message, args, guildId) {
  return handleStatsCommand(message, args);
}

async function handleSlashCommand(interaction) {
  const query = interaction.options.getString('user');
  const args = query || '';
  return handleStatsCommand(interaction, args);
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
