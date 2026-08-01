import { readFileSync, existsSync } from 'node:fs';
import { styledEmbed, trimTo } from '../../core/embeds.js';
import { memberHasAnyCachedRole, staffRoleHierarchyIds } from '../../core/permissions.js';
import { memberDisplayName } from './shared.js';
import config from '../../core/config.js';

function loadBreaksFromJson() {
  try {
    const filePath = './data/staff-breaks.json';
    if (!existsSync(filePath)) return {};
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch { return {}; }
}

function loadActiveBreaksForGuild(guildId) {
  const brState = globalThis.__HALLOWS_BREAK_STATE__ || {};
  let activeBreaks = Object.entries(brState.activeByUserId || {})
    .filter(([, activeBreak]) => activeBreak.guildId === guildId);

  if (!activeBreaks.length) {
    const jsonData = loadBreaksFromJson();
    activeBreaks = Object.entries(jsonData.activeByUserId || {})
      .filter(([, activeBreak]) => activeBreak.guildId === guildId);
  }

  return activeBreaks;
}

async function listBreaks(guild, guildId) {
  const activeBreaks = loadActiveBreaksForGuild(guildId);

  if (!activeBreaks.length) {
    return styledEmbed('Staff Breaks', 'No staff members are currently on break.');
  }

  const lines = [];
  for (const [userId, activeBreak] of activeBreaks) {
    const member = await guild.members.fetch(userId).catch(() => null);
    const displayName = member ? memberDisplayName(member) : userId;
    const endTimestamp = Math.floor(activeBreak.endsAt / 1000);
    lines.push(
      `<@${userId}> (${displayName})`,
      `Reason: ${trimTo(activeBreak.reason, 200)}`,
      `Until: <t:${endTimestamp}:F> (<t:${endTimestamp}:R>)`,
      ''
    );
  }

  return styledEmbed('Staff Breaks', trimTo(lines.join('\n'), 3900));
}

async function handleSlashCommand(interaction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  const staffRoleIds = staffRoleHierarchyIds();
  if (!staffRoleIds.length || !memberHasAnyCachedRole(interaction.member, staffRoleIds)) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const embed = await listBreaks(interaction.guild, interaction.guildId);
  await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
}

async function handlePrefixCommand(message, args, guildId) {
  if (!message.guildId) {
    await message.reply('Command failed.');
    return;
  }

  const staffRoleIds = staffRoleHierarchyIds();
  if (!staffRoleIds.length || !memberHasAnyCachedRole(message.member, staffRoleIds)) {
    await message.reply('Command failed.');
    return;
  }

  const embed = await listBreaks(message.guild, message.guildId);
  await message.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
