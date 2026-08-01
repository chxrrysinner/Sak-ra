import stateManager from '../../core/state.js';
import { getSuccessResponse,  runModAction, checkHierarchy, extractUserAndReason } from './shared.js';

async function handlePrefixCommand(message, args, guildId) {
  const { userId, reason } = extractUserAndReason(args);
  if (!userId) {
    await message.reply('Usage: `unban <user ID> [reason]`');
    return;
  }

  if (!message.guild.members.me.permissions.has('BanMembers')) {
    await message.reply('I need the Ban Members permission to unban.');
    return;
  }

  try {
    const ban = await message.guild.bans.fetch(userId).catch(() => null);
    if (!ban) {
      await message.reply('That user is not banned.');
      return;
    }
    await message.guild.members.unban(userId, reason);
    stateManager.removeTempban(guildId, userId);
    await runModAction(guildId, userId, message.author.id, 'unban', reason, {}, message.guild);
    await message.channel.send(getSuccessResponse(guildId));
  } catch (error) {
    await message.channel.send('nuuu');
  }
}

async function handleSlashCommand(interaction) {
  const userId = interaction.options.getString('user_id', true);
  const reason = interaction.options.getString('reason') || 'No reason provided.';
  const guildId = interaction.guildId;

  if (!interaction.guild.members.me.permissions.has('BanMembers')) {
    await interaction.reply({ content: 'I need the Ban Members permission to unban.', ephemeral: true });
    return;
  }

  try {
    await interaction.deferReply();
    const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!ban) {
      await interaction.editReply('That user is not banned.');
      return;
    }
    await interaction.guild.members.unban(userId, reason);
    stateManager.removeTempban(guildId, userId);
    await runModAction(guildId, userId, interaction.user.id, 'unban', reason, {}, interaction.guild);
    await interaction.editReply(getSuccessResponse(guildId));
  } catch (error) {
    await interaction.editReply('nuuu');
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
