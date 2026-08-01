import { getSuccessResponse,  sendModerationDM, runModAction, checkHierarchy, extractUserAndReason } from './shared.js';

async function handlePrefixCommand(message, args, guildId) {
  const { userId, reason } = extractUserAndReason(args);
  if (!userId || !args.trim().includes(' ')) {
    await message.reply('Usage: `warn <@user> <reason>`');
    return;
  }

  const member = await message.guild.members.fetch(userId).catch(() => null);
  const hierarchy = checkHierarchy(message.member, member);
  if (!hierarchy.allowed) {
    await message.reply(hierarchy.message);
    return;
  }

  try {
    await sendModerationDM(userId, 'warn', reason, guildId);
    await runModAction(guildId, userId, message.author.id, 'warn', reason, {}, message.guild);
    await message.channel.send(getSuccessResponse(guildId));
  } catch (error) {
    await message.channel.send('nuuu');
  }
}

async function handleSlashCommand(interaction) {
  const user = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);
  const guildId = interaction.guildId;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const hierarchy = checkHierarchy(interaction.member, member);
  if (!hierarchy.allowed) {
    await interaction.reply({ content: hierarchy.message, ephemeral: true });
    return;
  }

  try {
    await interaction.deferReply();
    await sendModerationDM(user.id, 'warn', reason, guildId);
    await runModAction(guildId, user.id, interaction.user.id, 'warn', reason, {}, interaction.guild);
    await interaction.editReply(getSuccessResponse(guildId));
  } catch (error) {
    await interaction.editReply('nuuu');
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
