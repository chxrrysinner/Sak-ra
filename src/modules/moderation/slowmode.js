async function handlePrefixCommand(message, args, guildId) {
  const parts = args.trim().split(/\s+/);
  const seconds = parseInt(parts[0], 10);
  const channelMention = parts[1];
  const channel = channelMention
    ? message.guild.channels.cache.get(channelMention.replace(/[<#>]/g, ''))
    : message.channel;

  if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
    await message.reply('Usage: `slowmode <0-21600> [#channel]`\nSet to 0 to disable.');
    return;
  }

  if (!channel || !channel.isTextBased()) {
    await message.reply('Invalid channel.');
    return;
  }

  try {
    await channel.setRateLimitPerUser(seconds, `Slowmode set by ${message.author.tag}`);
    const label = channel.id === message.channel.id ? 'this channel' : `<#${channel.id}>`;
    if (seconds === 0) {
      await message.channel.send(getSuccessResponse(guildId));
    } else {
      await message.channel.send(getSuccessResponse(guildId));
    }
  } catch (error) {
    await message.channel.send('nuuu');
  }
}

async function handleSlashCommand(interaction) {
  const guildId = interaction.guildId;
  const seconds = interaction.options.getInteger('seconds', true);
  const channel = interaction.options.getChannel('channel') || interaction.channel;

  if (seconds < 0 || seconds > 21600) {
    await interaction.reply({ content: 'Slowmode must be between 0 and 21600 seconds.', ephemeral: true });
    return;
  }

  if (!channel || !channel.isTextBased()) {
    await interaction.reply({ content: 'Invalid channel.', ephemeral: true });
    return;
  }

  try {
    await channel.setRateLimitPerUser(seconds, `Slowmode set by ${interaction.user.tag}`);
    const label = channel.id === interaction.channel.id ? 'this channel' : `<#${channel.id}>`;
    if (seconds === 0) {
      await interaction.reply(getSuccessResponse(guildId));
    } else {
      await interaction.reply(getSuccessResponse(guildId));
    }
  } catch (error) {
    await interaction.reply('nuuu');
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
