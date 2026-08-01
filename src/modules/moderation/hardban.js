import { getSuccessResponse,  runModAction, checkHierarchy, extractUserAndReason } from './shared.js';

async function handlePrefixCommand(message, args, guildId) {
  const { userId, reason } = extractUserAndReason(args);
  if (!userId) {
    await message.reply('Usage: `hardban <@user> [reason]`');
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
  }

  try {
    await message.guild.members.ban(userId, { reason, deleteMessageDays: 7 });
    await runModAction(guildId, userId, message.author.id, 'hardban', reason, {}, message.guild);
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
  }

  try {
    await interaction.deferReply();
    await interaction.guild.members.ban(user.id, { reason, deleteMessageDays: 7 });
    await runModAction(guildId, user.id, interaction.user.id, 'hardban', reason, {}, interaction.guild);
    await interaction.editReply(getSuccessResponse(guildId));
  } catch (error) {
    await interaction.editReply('nuuu');
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
