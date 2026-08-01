import { getSuccessResponse, runModAction, checkHierarchy, extractUserAndReason } from './shared.js';
import { staffRoleHierarchyIds, categoryRoleIds, leadCategoryRoleId } from '../../core/permissions.js';
import stateManager from '../../core/state.js';

async function handlePrefixCommand(message, args, guildId) {
  const { userId, reason } = extractUserAndReason(args);
  if (!userId) {
    await message.reply('Usage: `stripstaff <@user> [reason]`');
    return;
  }

  const member = await message.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await message.reply('User not found in this server.');
    return;
  }
  const hierarchy = checkHierarchy(message.member, member);
  if (!hierarchy.allowed) {
    await message.reply(hierarchy.message);
    return;
  }
  if (hasProtectedRole(member, guildId)) {
    await message.reply('that user is protected.');
    return;
  }

  try {
    // Collect all staff-associated roles: hierarchy roles, category roles, lead cat role
    const hierarchyIds = staffRoleHierarchyIds();
    const catIds = categoryRoleIds();
    const leadCatId = leadCategoryRoleId();
    const allStaffIds = [...new Set([...hierarchyIds, ...catIds, ...(leadCatId ? [leadCatId] : [])])];

    const rolesToRemove = member.roles.cache.filter((r) => allStaffIds.includes(r.id));
    if (rolesToRemove.size === 0) {
      await message.reply('That user has no staff roles to remove.');
      return;
    }

    stateManager.setGuildSetting(guildId, `saved_roles_${userId}`, JSON.stringify([...rolesToRemove.keys()]));

    await member.roles.remove(rolesToRemove, `Strip staff: ${reason}`);
    await runModAction(guildId, userId, message.author.id, 'stripstaff', reason, {}, message.guild);
    await message.channel.send(getSuccessResponse(guildId));
  } catch (error) {
    await message.channel.send('nuuu');
  }
}

async function handleSlashCommand(interaction) {
  const user = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason') || 'No reason provided.';
  const guildId = interaction.guildId;

  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: 'User not found.', ephemeral: true });
    return;
  }
  const hierarchy = checkHierarchy(interaction.member, member);
  if (!hierarchy.allowed) {
    await interaction.reply({ content: hierarchy.message, ephemeral: true });
    return;
  }
  if (hasProtectedRole(member, guildId)) {
    await interaction.reply({ content: 'that user is protected.', ephemeral: true });
    return;
  }

  try {
    const hierarchyIds = staffRoleHierarchyIds();
    const catIds = categoryRoleIds();
    const leadCatId = leadCategoryRoleId();
    const allStaffIds = [...new Set([...hierarchyIds, ...catIds, ...(leadCatId ? [leadCatId] : [])])];

    const rolesToRemove = member.roles.cache.filter((r) => allStaffIds.includes(r.id));
    if (rolesToRemove.size === 0) {
      await interaction.reply({ content: 'That user has no staff roles to remove.', ephemeral: true });
      return;
    }

    await interaction.deferReply();
    stateManager.setGuildSetting(guildId, `saved_roles_${user.id}`, JSON.stringify([...rolesToRemove.keys()]));
    await member.roles.remove(rolesToRemove, `Strip staff: ${reason}`);
    await runModAction(guildId, user.id, interaction.user.id, 'stripstaff', reason, {}, interaction.guild);
    await interaction.editReply(getSuccessResponse(guildId));
  } catch (error) {
    await interaction.editReply('nuuu');
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
