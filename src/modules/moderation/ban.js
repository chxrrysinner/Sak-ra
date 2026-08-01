import { getSuccessResponse,  sendModerationDM, runModAction, checkHierarchy, extractUserAndReason, hasProtectedRole } from './shared.js';

async function handlePrefixCommand(message, args, guildId) {
  const { userId, reason } = extractUserAndReason(args);
  if (!userId) {
    await message.reply('Usage: `ban <@user> [reason]`');
    return;
  }

  const member = await message.guild.members.fetch(userId).catch(() => null);
  if (member) {
    if (!member.bannable) {
      await message.reply('I cannot ban that member — they may have higher permissions than me.');
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
    await sendModerationDM(userId, 'ban', reason, guildId);
    await message.guild.members.ban(userId, { reason, deleteMessageDays: 0 });
    await runModAction(guildId, userId, message.author.id, 'ban', reason, {}, message.guild);
    await message.channel.send(getSuccessResponse(guildId));
  } catch (error) {
    await message.channel.send('nuuu');
  }
}

async function handleSlashCommand(interaction) {
  const user = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason') || 'No reason provided.';
  const days = interaction.options.getInteger('days') || 0;
  const guildId = interaction.guildId;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);

  if (member) {
    if (!member.bannable) {
      await interaction.reply({ content: 'I cannot ban that member — they may have higher permissions than me.', ephemeral: true });
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
    await sendModerationDM(user.id, 'ban', reason, guildId);
    await interaction.guild.members.ban(user.id, { reason, deleteMessageDays: Math.min(days, 7) });
    await runModAction(guildId, user.id, interaction.user.id, 'ban', reason, {}, interaction.guild);
    await interaction.editReply(getSuccessResponse(guildId));
  } catch (error) {
    await interaction.editReply('nuuu');
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
