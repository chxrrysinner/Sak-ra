import stateManager from '../../core/state.js';
import { getSuccessResponse,  runModAction } from './shared.js';

async function handlePrefixCommand(message, args, guildId) {
  const parts = args.trim().split(/\s+/);
  const action = parts[0]?.toLowerCase();
  const channelMention = parts[1];
  const channel = channelMention
    ? message.guild.channels.cache.get(channelMention.replace(/[<#>]/g, ''))
    : message.channel;

  if (!action || (action !== 'lock' && action !== 'unlock')) {
    await message.reply('Usage: `lockdown <lock|unlock> [#channel]`');
    return;
  }

  if (!channel || !channel.isTextBased()) {
    await message.reply('Invalid channel.');
    return;
  }

  if (!channel.permissionsFor(message.guild.members.me).has('ManageChannels')) {
    await message.reply('I need the Manage Channels permission.');
    return;
  }

  const everyoneRole = message.guild.roles.everyone;

  try {
    if (action === 'lock') {
      await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false });
      await runModAction(guildId, message.guild.id, message.author.id, 'lockdown', `Channel locked in ${channel.name}`, { channelId: channel.id }, message.guild);
      await message.channel.send(getSuccessResponse(guildId));
    } else {
      await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: null });
      await runModAction(guildId, message.guild.id, message.author.id, 'unlock', `Channel unlocked in ${channel.name}`, { channelId: channel.id }, message.guild);
      await message.channel.send(getSuccessResponse(guildId));
    }
  } catch (error) {
    await message.channel.send('nuuu');
  }
}

async function handleSlashCommand(interaction) {
  const guildId = interaction.guildId;
  const action = interaction.options.getString('action', true);
  const channel = interaction.options.getChannel('channel') || interaction.channel;

  if (!channel || !channel.isTextBased()) {
    await interaction.reply({ content: 'Invalid channel.', ephemeral: true });
    return;
  }

  if (!channel.permissionsFor(interaction.guild.members.me).has('ManageChannels')) {
    await interaction.reply({ content: 'I need the Manage Channels permission.', ephemeral: true });
    return;
  }

  const everyoneRole = interaction.guild.roles.everyone;

  try {
    if (action === 'lock') {
      await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false });
      await runModAction(interaction.guildId, interaction.guildId, interaction.user.id, 'lockdown', `Channel locked in ${channel.name}`, { channelId: channel.id }, interaction.guild);
      await interaction.reply(getSuccessResponse(guildId));
    } else {
      await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: null });
      await runModAction(interaction.guildId, interaction.guildId, interaction.user.id, 'unlock', `Channel unlocked in ${channel.name}`, { channelId: channel.id }, interaction.guild);
      await interaction.reply(getSuccessResponse(guildId));
    }
  } catch (error) {
    await interaction.reply('nuuu');
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
