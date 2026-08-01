import stateManager from '../../core/state.js';
import client from '../../core/client.js';
import logger from '../../core/logger.js';
import { EmbedBuilder } from 'discord.js';
import { getPrefix } from '../../core/prefix.js';

function formatCounterName(format, count, guild) {
  return format.replace(/{count}/g, String(count))
    .replace(/{server}/g, guild?.name || 'Server')
    .replace(/{members}/g, String(guild?.memberCount || count));
}

function getCounterValue(guild, type) {
  switch (type) {
    case 'members':
      return guild.members.cache.filter((m) => !m.user.bot).size;
    case 'bots':
      return guild.members.cache.filter((m) => m.user.bot).size;
    case 'total':
      return guild.memberCount;
    case 'channels':
      return guild.channels.cache.size;
    case 'roles':
      return guild.roles.cache.size;
    case 'boosts':
      return guild.premiumSubscriptionCount || 0;
    case 'boost_tier':
      return guild.premiumTier;
    default:
      return 0;
  }
}

async function updateCounter(guild, counter) {
  const value = getCounterValue(guild, counter.counter_type);
  const channel = guild.channels.cache.get(counter.channel_id);
  if (!channel || !channel.isVoiceBased()) {
    stateManager.deleteCounter(guild.id, counter.channel_id);
    return;
  }

  const newName = formatCounterName(counter.format || '{count}', value, guild);
  if (channel.name !== newName) {
    await channel.setName(newName, 'Counter update').catch(() => {
      stateManager.deleteCounter(guild.id, counter.channel_id);
    });
  }
}

async function updateAllCounters(guild) {
  const counters = stateManager.getCounters(guild.id);
  for (const counter of counters) {
    await updateCounter(guild, counter);
  }
}

async function restoreCounters(core) {
  for (const guild of core.client.guilds.cache.values()) {
    try {
      await updateAllCounters(guild);
    } catch {}
  }

  setInterval(async () => {
    for (const guild of core.client.guilds.cache.values()) {
      try {
        await updateAllCounters(guild);
      } catch {}
    }
  }, 600000);
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
    case 'create':
      return handleCreate(message, guildId, parts.slice(1));
    case 'delete':
      return handleDelete(message, guildId, parts.slice(1));
    case 'list':
      return handleList(message, guildId);
    default:
      await message.reply(
        `Counter management:\n` +
        `\`${prefix}counters create <type> [name]\`\n` +
        `Types: members, bots, total, channels, roles, boosts, boost_tier\n` +
        `Name uses \`{count}\` as placeholder.\n` +
        `\`${prefix}counters delete #channel\`\n` +
        `\`${prefix}counters list\``
      );
  }
}

async function handleCreate(message, guildId, args) {
  const type = args[0]?.toLowerCase();
  const validTypes = ['members', 'bots', 'total', 'channels', 'roles', 'boosts', 'boost_tier'];
  if (!type || !validTypes.includes(type)) {
    await message.reply('Usage: `counters create <type> [name]`\nTypes: members, bots, total, channels, roles, boosts, boost_tier');
    return;
  }

  const formatStr = args.slice(1).join(' ') || '{count}';
  const guild = message.guild;
  const value = getCounterValue(guild, type);
  const channelName = formatCounterName(formatStr, value, guild);

  try {
    const channel = await guild.channels.create({
      name: channelName,
      type: 2,
      reason: 'Counter channel'
    });

    stateManager.createCounter(guildId, channel.id, type, type, formatStr);
    await message.reply(`Counter **${type}** created: ${channel}`);
  } catch (error) {
    await message.reply(`Failed to create counter: ${error.message}`);
  }
}

async function handleDelete(message, guildId, args) {
  const channelMention = args[0];
  const channelId = channelMention?.replace(/[<#>]/g, '');
  if (!channelId) {
    await message.reply('Usage: `counters delete #channel`');
    return;
  }

  stateManager.deleteCounter(guildId, channelId);
  const channel = message.guild.channels.cache.get(channelId);
  if (channel) {
    await channel.delete('Counter removed').catch(() => null);
  }
  await message.reply('Counter deleted.');
}

async function handleList(message, guildId) {
  const counters = stateManager.getCounters(guildId);
  if (!counters.length) {
    await message.reply('No counters configured.');
    return;
  }

  const lines = counters.map((c) => {
    const channel = message.guild.channels.cache.get(c.channel_id);
    const channelStr = channel ? channel.toString() : `\`${c.channel_id}\` (deleted)`;
    return `${channelStr} — **${c.counter_type}** \`${c.format}\``;
  });

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Counters')
    .setDescription(lines.join('\n'))
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleSlashCommand(interaction) {
  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'create': {
      const type = interaction.options.getString('type', true);
      const formatStr = interaction.options.getString('name') || '{count}';
      const guild = interaction.guild;
      const value = getCounterValue(guild, type);
      const channelName = formatCounterName(formatStr, value, guild);

      try {
        const channel = await guild.channels.create({
          name: channelName,
          type: 2,
          reason: 'Counter channel'
        });
        stateManager.createCounter(guildId, channel.id, type, type, formatStr);
        await interaction.reply({ content: `Counter **${type}** created: ${channel}`, ephemeral: true });
      } catch (error) {
        await interaction.reply({ content: `Failed: ${error.message}`, ephemeral: true });
      }
      break;
    }
    case 'delete': {
      const channel = interaction.options.getChannel('channel', true);
      stateManager.deleteCounter(guildId, channel.id);
      await channel.delete('Counter removed').catch(() => null);
      await interaction.reply({ content: 'Counter deleted.', ephemeral: true });
      break;
    }
    case 'list': {
      const counters = stateManager.getCounters(guildId);
      if (!counters.length) {
        await interaction.reply({ content: 'No counters configured.', ephemeral: true });
        return;
      }
      const lines = counters.map((c) => {
        const ch = interaction.guild.channels.cache.get(c.channel_id);
        return `${ch || '`deleted`'} — **${c.counter_type}**`;
      });
      const embed = new EmbedBuilder()
        .setColor(0xc67a3a)
        .setTitle('Counters')
        .setDescription(lines.join('\n'))
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

export { handlePrefixCommand, handleSlashCommand, restoreCounters };
export default handlePrefixCommand;
