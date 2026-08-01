import stateManager from '../../core/state.js';
import client from '../../core/client.js';
import logger from '../../core/logger.js';
import { EmbedBuilder } from 'discord.js';
import { getPrefix } from '../../core/prefix.js';

async function getStarCount(message, emoji) {
  if (message.partial) await message.fetch().catch(() => null);
  if (!message) return 0;
  const reactions = message.reactions.cache.find((r) => {
    const e = r.emoji;
    return e.name === emoji || e.id === emoji || e.toString() === emoji;
  });
  return reactions ? reactions.count : 0;
}

async function updateStarboard(message, config) {
  if (message.author.bot) return;
  if (message.channel.id === config.channel_id) return;

  const starCount = await getStarCount(message, config.emoji);
  const existing = stateManager.getStarboardMessage(message.guild.id, message.id);

  if (starCount < config.threshold) {
    if (existing) {
      const starChannel = message.guild.channels.cache.get(config.channel_id);
      if (starChannel && existing.starboard_message_id) {
        const sbMsg = await starChannel.messages.fetch(existing.starboard_message_id).catch(() => null);
        if (sbMsg) await sbMsg.delete().catch(() => null);
      }
      stateManager.removeStarboardMessage(message.guild.id, message.id);
    }
    return;
  }

  const content = message.cleanContent || '';
  const attachmentUrl = message.attachments.first()?.url || null;
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
    .setDescription(content.substring(0, 2000))
    .addFields({ name: 'Jump', value: `[Go to message](${message.url})` })
    .setFooter({ text: `⭐ ${starCount} | #${message.channel.name}` })
    .setTimestamp(message.createdAt);

  if (attachmentUrl) embed.setImage(attachmentUrl);

  const starChannel = message.guild.channels.cache.get(config.channel_id);
  if (!starChannel) return;

  if (existing && existing.starboard_message_id) {
    try {
      const sbMsg = await starChannel.messages.fetch(existing.starboard_message_id).catch(() => null);
      if (sbMsg) {
        await sbMsg.edit({ embeds: [embed] });
        stateManager.upsertStarboardMessage(message.guild.id, message.id, message.channel.id, message.author.id, content, starCount, existing.starboard_message_id);
        return;
      }
    } catch {}
  }

  const sbMsg = await starChannel.send({ embeds: [embed] }).catch(() => null);
  if (sbMsg) {
    stateManager.upsertStarboardMessage(message.guild.id, message.id, message.channel.id, message.author.id, content, starCount, sbMsg.id);
  }
}

async function handleReactionAdd(reaction, user) {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (!reaction || !reaction.message || !reaction.message.guild) return;

  const config = stateManager.getStarboardConfig(reaction.message.guild.id);
  if (!config.enabled || !config.channel_id) return;

  const emojiStr = reaction.emoji.name || reaction.emoji.id || reaction.emoji.toString();
  const configEmoji = config.emoji;

  if (emojiStr !== configEmoji && reaction.emoji.toString() !== configEmoji) return;

  await updateStarboard(reaction.message, config);
}

async function handleReactionRemove(reaction, user) {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (!reaction || !reaction.message || !reaction.message.guild) return;

  const config = stateManager.getStarboardConfig(reaction.message.guild.id);
  if (!config.enabled || !config.channel_id) return;

  const emojiStr = reaction.emoji.name || reaction.emoji.id || reaction.emoji.toString();
  const configEmoji = config.emoji;

  if (emojiStr !== configEmoji && reaction.emoji.toString() !== configEmoji) return;

  await updateStarboard(reaction.message, config);
}

async function handlePrefixCommand(message, args, guildId) {
  if (!guildId) {
    await message.reply('This command can only be used in a server.');
    return;
  }

  const prefix = getPrefix(guildId);
  const parts = args.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();

  switch (subcommand) {
    case 'toggle':
      return handleToggle(message, guildId, parts.slice(1));
    case 'channel':
      return handleChannel(message, guildId, parts.slice(1));
    case 'threshold':
      return handleThreshold(message, guildId, parts.slice(1));
    case 'emoji':
      return handleEmoji(message, guildId, parts.slice(1));
    case 'show':
      return handleShow(message, guildId);
    default:
      await message.reply(
        `Starboard config:\n` +
        `\`${prefix}starboard toggle <on|off>\`\n` +
        `\`${prefix}starboard channel #channel\`\n` +
        `\`${prefix}starboard threshold <count>\`\n` +
        `\`${prefix}starboard emoji <emoji>\`\n` +
        `\`${prefix}starboard show\``
      );
  }
}

async function handleToggle(message, guildId, args) {
  const state = args[0]?.toLowerCase();
  if (state !== 'on' && state !== 'off') {
    await message.reply('Usage: `starboard toggle <on|off>`');
    return;
  }
  stateManager.setStarboardConfig(guildId, { enabled: state === 'on' ? 1 : 0 });
  await message.reply(`Starboard turned **${state}**.`);
}

async function handleChannel(message, guildId, args) {
  const channelMention = args[0];
  if (!channelMention) {
    await message.reply('Usage: `starboard channel #channel`');
    return;
  }
  const channelId = channelMention.replace(/[<#>]/g, '');
  stateManager.setStarboardConfig(guildId, { channel_id: channelId });
  await message.reply(`Starboard channel set to <#${channelId}>.`);
}

async function handleThreshold(message, guildId, args) {
  const count = parseInt(args[0], 10);
  if (!count || count < 1) {
    await message.reply('Usage: `starboard threshold <count>`');
    return;
  }
  stateManager.setStarboardConfig(guildId, { threshold: count });
  await message.reply(`Starboard threshold set to **${count}**.`);
}

async function handleEmoji(message, guildId, args) {
  const emoji = args.join(' ');
  if (!emoji) {
    await message.reply('Usage: `starboard emoji <emoji>`');
    return;
  }
  stateManager.setStarboardConfig(guildId, { emoji });
  await message.reply(`Starboard emoji set to ${emoji}.`);
}

async function handleShow(message, guildId) {
  const config = stateManager.getStarboardConfig(guildId);
  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Starboard Configuration')
    .addFields(
      { name: 'Status', value: config.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
      { name: 'Channel', value: config.channel_id ? `<#${config.channel_id}>` : 'Not set', inline: true },
      { name: 'Threshold', value: String(config.threshold), inline: true },
      { name: 'Emoji', value: config.emoji || '⭐', inline: true }
    )
    .setTimestamp();
  await message.reply({ embeds: [embed] });
}

async function handleSlashCommand(interaction) {
  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'toggle': {
      const state = interaction.options.getString('state', true);
      stateManager.setStarboardConfig(guildId, { enabled: state === 'on' ? 1 : 0 });
      await interaction.reply({ content: `Starboard turned **${state}**.`, ephemeral: true });
      break;
    }
    case 'channel': {
      const channel = interaction.options.getChannel('channel', true);
      stateManager.setStarboardConfig(guildId, { channel_id: channel.id });
      await interaction.reply({ content: `Starboard channel set to ${channel}.`, ephemeral: true });
      break;
    }
    case 'threshold': {
      const count = interaction.options.getInteger('count', true);
      stateManager.setStarboardConfig(guildId, { threshold: count });
      await interaction.reply({ content: `Threshold set to **${count}**.`, ephemeral: true });
      break;
    }
    case 'emoji': {
      const emoji = interaction.options.getString('emoji', true);
      stateManager.setStarboardConfig(guildId, { emoji });
      await interaction.reply({ content: `Starboard emoji set to ${emoji}.`, ephemeral: true });
      break;
    }
    case 'show': {
      const config = stateManager.getStarboardConfig(guildId);
      const embed = new EmbedBuilder()
        .setColor(0xc67a3a)
        .setTitle('Starboard')
        .addFields(
          { name: 'Status', value: config.enabled ? '🟢' : '🔴', inline: true },
          { name: 'Channel', value: config.channel_id ? `<#${config.channel_id}>` : 'Not set', inline: true },
          { name: 'Threshold', value: String(config.threshold), inline: true },
          { name: 'Emoji', value: config.emoji || '⭐', inline: true }
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

export { handlePrefixCommand, handleSlashCommand, handleReactionAdd, handleReactionRemove };
export default handlePrefixCommand;
