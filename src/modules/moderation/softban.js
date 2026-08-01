import { getSuccessResponse,  sendModerationDM, runModAction, checkHierarchy, extractUserAndReason, hasProtectedRole } from './shared.js';

async function handlePrefixCommand(message, args, guildId) {
  const { userId, reason } = extractUserAndReason(args);
  if (!userId) {
    await message.reply('Usage: `softban <@user> [reason]`');
    return;
  }

  const member = await message.guild.members.fetch(userId).catch(() => null);
  if (member) {
    if (!member.bannable) {
      await message.reply('I cannot ban that member.');
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
  }

  try {
    await sendModerationDM(userId, 'softban', reason, guildId);
    await message.guild.members.ban(userId, { reason: `[Softban] ${reason}`, deleteMessageDays: 7 });
    await message.guild.members.unban(userId, `Softban complete: ${reason}`);
    await runModAction(guildId, userId, message.author.id, 'softban', reason, {}, message.guild);
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
  if (member) {
    if (!member.bannable) {
      await interaction.reply({ content: 'I cannot ban that member.', ephemeral: true });
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
  }

  try {
    await interaction.deferReply();
    await sendModerationDM(user.id, 'softban', reason, guildId);
    await interaction.guild.members.ban(user.id, { reason: `[Softban] ${reason}`, deleteMessageDays: 7 });
    await interaction.guild.members.unban(user.id, `Softban complete: ${reason}`);
    await runModAction(guildId, user.id, interaction.user.id, 'softban', reason, {}, interaction.guild);
    await interaction.editReply(getSuccessResponse(guildId));
  } catch (error) {
    await interaction.editReply('nuuu');
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
