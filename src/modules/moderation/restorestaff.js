import { getSuccessResponse, checkHierarchy, extractUserAndReason } from './shared.js';
import stateManager from '../../core/state.js';

async function handlePrefixCommand(message, args, guildId) {
  const { userId, reason } = extractUserAndReason(args);
  if (!userId) {
    await message.reply('Usage: `?restorestaff <@user> [reason]`');
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

  const savedJson = stateManager.getGuildSetting(guildId, `saved_roles_${userId}`, '');
  if (!savedJson) {
    await message.reply('No saved roles found for that user. They were never strippstaffed.');
    return;
  }

  let roleIds;
  try { roleIds = JSON.parse(savedJson); } catch {
    await message.reply('Saved roles data is corrupted.');
    return;
  }

  const rolesToAdd = roleIds.map((id) => message.guild.roles.cache.get(id)).filter(Boolean);
  if (!rolesToAdd.length) {
    await message.reply('None of the saved roles exist in this server anymore.');
    return;
  }

  try {
    await member.roles.add(rolesToAdd, `Restore staff: ${reason}`);
    stateManager.setGuildSetting(guildId, `saved_roles_${userId}`, '');
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

  const savedJson = stateManager.getGuildSetting(guildId, `saved_roles_${user.id}`, '');
  if (!savedJson) {
    await interaction.reply({ content: 'No saved roles found.', ephemeral: true });
    return;
  }

  let roleIds;
  try { roleIds = JSON.parse(savedJson); } catch {
    await interaction.reply({ content: 'Saved roles data is corrupted.', ephemeral: true });
    return;
  }

  const rolesToAdd = roleIds.map((id) => interaction.guild.roles.cache.get(id)).filter(Boolean);
  if (!rolesToAdd.length) {
    await interaction.reply({ content: 'None of the saved roles exist anymore.', ephemeral: true });
    return;
  }

  try {
    await interaction.deferReply();
    await member.roles.add(rolesToAdd, `Restore staff: ${reason}`);
    stateManager.setGuildSetting(guildId, `saved_roles_${user.id}`, '');
    await interaction.editReply(getSuccessResponse(guildId));
  } catch (error) {
    await interaction.editReply('nuuu');
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
