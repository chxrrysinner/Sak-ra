import { EmbedBuilder } from 'discord.js';
import config from '../../core/config.js';
import stateManager from '../../core/state.js';
import { memberHasPermission, memberHasAnyCachedRole, staffListRoleIdsForGroup, staffListPartsForRoleIds, staffListRankLabel, staffListSortValue, staffRoleHierarchyIds } from '../../core/permissions.js';
import { memberDisplayName, sortStaffListEntries, chunkStaffListValue, userIdsOnBreakForDepartment } from './shared.js';

const STAFF_LIST_DEPARTMENTS = [
  { heading: 'Internals Wing', staffWingId: 'internals' },
  { heading: 'HR Wing', staffWingId: 'hr' },
  { heading: 'Partnership Wing', staffWingId: 'partnership' },
  { heading: 'Moderation Wing', staffWingId: 'moderation' },
  { heading: 'Assistants Wing', staffWingId: 'assistants' }
];

async function buildStaffListEmbed(guild, guildId) {
  const members = await guild.members.fetch();
  const embed = new EmbedBuilder()
    .setColor(config.style.color)
    .setTitle(`${config.style.titlePrefix} Staff List`)
    .setFooter({ text: config.style.footer })
    .setTimestamp();

  const brState = globalThis.__HALLOWS_BREAK_STATE__ || {};

  for (const group of STAFF_LIST_DEPARTMENTS) {
    const departmentRoleIds = staffListRoleIdsForGroup(group);
    const breakUserIds = new Set(userIdsOnBreakForDepartment(guildId, departmentRoleIds));

    const activeEntries = sortStaffListEntries(
      members
        .filter((member) =>
          !member.user.bot
          && !breakUserIds.has(member.id)
          && memberHasAnyCachedRole(member, departmentRoleIds)
        )
        .map((member) => ({
          id: member.id,
          displayName: memberDisplayName(member),
          rankLabel: staffListRankLabel(staffListPartsForRoleIds(
            group.staffWingId,
            departmentRoleIds.filter((roleId) => member.roles.cache.has(roleId))
          )),
          rankSortValue: staffListSortValue(staffListPartsForRoleIds(
            group.staffWingId,
            departmentRoleIds.filter((roleId) => member.roles.cache.has(roleId))
          ))
        }))
    );

    const lines = [];
    for (const entry of activeEntries) {
      lines.push(`- <@${entry.id}>${entry.rankLabel}`);
    }

    const chunks = chunkStaffListValue(lines.length ? lines : ['- No staff listed']);
    chunks.forEach((value, index) => {
      embed.addFields({
        name: index === 0 ? group.heading : `${group.heading} (continued)`,
        value,
        inline: false
      });
    });
  }

  const onBreakRoleId = await stateManager.getGuildSetting(guildId, 'ON_BREAK_ROLE_ID') || config.breaks?.onBreakRoleId || null;

  const brBreakUserIds = Object.entries(brState.activeByUserId || {})
    .filter(([, activeBreak]) => activeBreak.guildId === guildId)
    .map(([userId]) => userId);

  const roleBreakUserIds = onBreakRoleId
    ? members.filter((m) => !m.user.bot && m.roles.cache.has(onBreakRoleId)).map((m) => m.id)
    : [];

  const allBreakUserIds = [...new Set([...brBreakUserIds, ...roleBreakUserIds])];

  if (allBreakUserIds.length) {
    const breakLines = allBreakUserIds
      .map((userId) => {
        const member = members.get(userId);
        if (!member || member.user.bot) return null;
        return {
          id: member.id,
          displayName: memberDisplayName(member),
          rankSortValue: 0
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }))
      .map((entry) => `- <@${entry.id}>`);

    const chunks = chunkStaffListValue(breakLines);
    chunks.forEach((value, index) => {
      embed.addFields({
        name: index === 0 ? '🌸 On Break' : '🌸 On Break (continued)',
        value,
        inline: false
      });
    });
  }

  return embed;
}

async function handleSlashCommand(interaction) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  let member = interaction.member;
  if (!member || !member.roles) {
    try { member = await interaction.guild.members.fetch(interaction.user.id); } catch {}
  }
  const staffRoleIds = staffRoleHierarchyIds();
  if (!staffRoleIds.length || !memberHasAnyCachedRole(member, staffRoleIds)) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  await interaction.deferReply();
  const embed = await buildStaffListEmbed(interaction.guild, interaction.guildId);
  await interaction.editReply({
    embeds: [embed],
    allowedMentions: { parse: [] }
  });
}

async function handlePrefixCommand(message, args, guildId) {
  if (!message.guildId || !message.guild) {
    await message.reply('Command failed.');
    return;
  }

  let member = message.member;
  if (!member || !member.roles) {
    try { member = await message.guild.members.fetch(message.author.id); } catch {}
  }
  const staffRoleIds = staffRoleHierarchyIds();
  if (!staffRoleIds.length || !memberHasAnyCachedRole(member, staffRoleIds)) {
    await message.reply('Command failed.');
    return;
  }

  const embed = await buildStaffListEmbed(message.guild, message.guildId);
  await message.channel.send({
    embeds: [embed],
    allowedMentions: { parse: [] }
  });
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
