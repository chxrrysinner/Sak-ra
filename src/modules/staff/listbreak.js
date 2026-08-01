import { styledEmbed, trimTo } from '../../core/embeds.js';
import { memberHasPermission } from '../../core/permissions.js';
import { memberDisplayName } from './shared.js';

async function listBreaks(guild, guildId) {
  const brState = globalThis.__HALLOWS_BREAK_STATE__ || {};
  const activeBreaks = Object.entries(brState.activeByUserId || {})
    .filter(([, activeBreak]) => activeBreak.guildId === guildId);

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

  const allowed = interaction.member && memberHasPermission(interaction.member, 'staff.breaks.manage');
  if (!allowed) {
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

  const allowed = message.member && memberHasPermission(message.member, 'staff.breaks.manage');
  if (!allowed) {
    await message.reply('Command failed.');
    return;
  }

  const embed = await listBreaks(message.guild, message.guildId);
  await message.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
