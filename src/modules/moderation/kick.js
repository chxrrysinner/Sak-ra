import { getSuccessResponse,  sendModerationDM, runModAction, checkHierarchy, extractUserAndReason } from './shared.js';

async function handlePrefixCommand(message, args, guildId) {
  const { userId, reason } = extractUserAndReason(args);
  if (!userId) {
    await message.reply('Usage: `kick <@user> [reason]`');
    return;
  }

  const member = await message.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await message.reply('User not found in this server.');
    return;
  }
  if (!member.kickable) {
    await message.reply('I cannot kick that member.');
    return;
  }
  const hierarchy = checkHierarchy(message.member, member);
  if (!hierarchy.allowed) {
    await message.reply(hierarchy.message);
    return;
  }

  try {
    await sendModerationDM(userId, 'kick', reason, guildId);
    await member.kick(reason);
    await runModAction(guildId, userId, message.author.id, 'kick', reason, {}, message.guild);
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
    await interaction.reply({ content: 'User not found in this server.', ephemeral: true });
    return;
  }
  if (!member.kickable) {
    await interaction.reply({ content: 'I cannot kick that member.', ephemeral: true });
    return;
  }
  const hierarchy = checkHierarchy(interaction.member, member);
  if (!hierarchy.allowed) {
    await interaction.reply({ content: hierarchy.message, ephemeral: true });
    return;
  }

  try {
    await interaction.deferReply();
    await sendModerationDM(user.id, 'kick', reason, guildId);
    await member.kick(reason);
    await runModAction(guildId, user.id, interaction.user.id, 'kick', reason, {}, interaction.guild);
    await interaction.editReply(getSuccessResponse(guildId));
  } catch (error) {
    await interaction.editReply('nuuu');
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
