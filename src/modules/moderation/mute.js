import { getSuccessResponse,  sendModerationDM, runModAction, checkHierarchy, parseDuration, formatDuration, extractUserAndReason } from './shared.js';

async function handlePrefixCommand(message, args, guildId) {
  const { userId, reason } = extractUserAndReason(args);
  if (!userId) {
    await message.reply('Usage: `mute <@user> <duration> [reason]`\nDurations: 10m, 1h, 1d, 1w');
    return;
  }

  const parts = args.trim().split(/\s+/);
  const durationStr = parts[1];
  if (!durationStr) {
    await message.reply('Usage: `mute <@user> <duration> [reason]`\nDurations: 10m, 1h, 1d, 1w');
    return;
  }

  const ms = parseDuration(durationStr);
  if (!ms) {
    await message.reply('Invalid duration. Use format like `10m`, `1h`, `1d`, `1w`.');
    return;
  }
  if (ms > 2419200000) {
    await message.reply('Maximum timeout is 28 days.');
    return;
  }

  const member = await message.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await message.reply('User not found in this server.');
    return;
  }
  if (!member.moderatable) {
    await message.reply('I cannot timeout that member.');
    return;
  }
  const hierarchy = checkHierarchy(message.member, member);
  if (!hierarchy.allowed) {
    await message.reply(hierarchy.message);
    return;
  }

  try {
    await sendModerationDM(userId, 'mute', reason, guildId);
    await member.timeout(ms, reason);
    await runModAction(guildId, userId, message.author.id, 'mute', reason, { duration: formatDuration(ms) }, message.guild);
    await message.channel.send(getSuccessResponse(guildId));
  } catch (error) {
    await message.channel.send('nuuu');
  }
}

async function handleUnmute(message, args, guildId) {
  const { userId, reason } = extractUserAndReason(args);
  if (!userId) {
    await message.reply('Usage: `unmute <@user> [reason]`');
    return;
  }

  const member = await message.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await message.reply('User not found in this server.');
    return;
  }

  try {
    await member.timeout(null, reason);
    await runModAction(guildId, userId, message.author.id, 'unmute', reason, {}, message.guild);
    await message.channel.send(getSuccessResponse(guildId));
  } catch (error) {
    await message.channel.send('nuuu');
  }
}

async function handleSlashCommand(interaction) {
  if (interaction.commandName === 'unmute') {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided.';
    const guildId = interaction.guildId;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) {
      await interaction.reply({ content: 'User not found in this server.', ephemeral: true });
      return;
    }

    try {
      await interaction.deferReply();
      await member.timeout(null, reason);
      await runModAction(guildId, user.id, interaction.user.id, 'unmute', reason, {}, interaction.guild);
      await interaction.editReply(getSuccessResponse(guildId));
    } catch (error) {
      await interaction.editReply('nuuu');
    }
    return;
  }

  const user = interaction.options.getUser('user', true);
  const durationStr = interaction.options.getString('duration', true);
  const reason = interaction.options.getString('reason') || 'No reason provided.';
  const guildId = interaction.guildId;

  const ms = parseDuration(durationStr);
  if (!ms) {
    await interaction.reply({ content: 'Invalid duration. Use format like `10m`, `1h`, `1d`, `1w`.', ephemeral: true });
    return;
  }
  if (ms > 2419200000) {
    await interaction.reply({ content: 'Maximum timeout is 28 days.', ephemeral: true });
    return;
  }

  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: 'User not found in this server.', ephemeral: true });
    return;
  }
  if (!member.moderatable) {
    await interaction.reply({ content: 'I cannot timeout that member.', ephemeral: true });
    return;
  }
  const hierarchy = checkHierarchy(interaction.member, member);
  if (!hierarchy.allowed) {
    await interaction.reply({ content: hierarchy.message, ephemeral: true });
    return;
  }

  try {
    await interaction.deferReply();
    await sendModerationDM(user.id, 'mute', reason, guildId);
    await member.timeout(ms, reason);
    await runModAction(guildId, user.id, interaction.user.id, 'mute', reason, { duration: formatDuration(ms) }, interaction.guild);
    await interaction.editReply(getSuccessResponse(guildId));
  } catch (error) {
    await interaction.editReply('nuuu');
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
