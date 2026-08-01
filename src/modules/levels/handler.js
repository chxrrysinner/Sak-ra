import stateManager from '../../core/state.js';
import client from '../../core/client.js';
import logger from '../../core/logger.js';
import { EmbedBuilder } from 'discord.js';
import { getPrefix } from '../../core/prefix.js';

function xpForLevel(level, factor) {
  return Math.floor(factor * (level * level + level));
}

function levelFromXp(xp, factor) {
  return Math.floor(Math.sqrt(xp / factor));
}

async function handleMessageXp(message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  const guildId = message.guild.id;
  const config = stateManager.getLevelConfig(guildId);
  if (!config.enabled) return;

  const userData = stateManager.getUserLevel(guildId, message.author.id);

  if (userData.last_message_at) {
    const elapsed = (Date.now() - new Date(userData.last_message_at).getTime()) / 1000;
    if (elapsed < config.cooldown_seconds) return;
  }

  const xpGain = Math.floor(Math.random() * (config.xp_max - config.xp_min + 1)) + config.xp_min;
  const newXp = userData.xp + xpGain;
  const newLevel = levelFromXp(newXp, config.scaling_factor);

  const now = new Date().toISOString();
  stateManager.upsertUserLevel(guildId, message.author.id, newXp, newLevel, now);

  if (newLevel > userData.level) {
    const reward = stateManager.getLevelReward(guildId, newLevel);
    if (reward) {
      const member = message.member;
      if (member) {
        try {
          await member.roles.add(reward.role_id, `Level ${newLevel} reward`);
        } catch {
          logger.warn({ guildId, userId: message.author.id, level: newLevel, roleId: reward.role_id }, 'Failed to assign level reward role');
        }
      }
    }

    if (config.announce_levelup) {
      const channel = config.announce_channel_id
        ? message.guild.channels.cache.get(config.announce_channel_id)
        : message.channel;
      if (channel) {
        await channel.send(`🎉 ${message.author}, you've reached **level ${newLevel}**!`).catch(() => null);
      }
    }
  }
}

function rankCardEmbed(userData, config, member) {
  const currentLevelXp = xpForLevel(userData.level, config.scaling_factor);
  const nextLevelXp = xpForLevel(userData.level + 1, config.scaling_factor);
  const progress = nextLevelXp > currentLevelXp
    ? Math.min(100, Math.floor(((userData.xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100))
    : 0;

  return new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle(member ? member.displayName : userData.user_id)
    .setThumbnail(member ? member.user.displayAvatarURL() : null)
    .addFields(
      { name: 'Level', value: String(userData.level), inline: true },
      { name: 'XP', value: `${userData.xp} / ${nextLevelXp}`, inline: true },
      { name: 'Progress', value: `${'█'.repeat(Math.floor(progress / 10))}${'░'.repeat(10 - Math.floor(progress / 10))} ${progress}%`, inline: false }
    )
    .setTimestamp();
}

async function handlePrefixCommand(message, args, guildId) {
  if (!guildId) {
    await message.reply('This command can only be used in a server.');
    return;
  }

  const prefix = getPrefix(guildId);
  const cmdName = message.content.startsWith(prefix + 'rank') ? 'rank'
    : message.content.startsWith(prefix + 'leaderboard') ? 'leaderboard'
    : 'levelconfig';

  if (cmdName === 'rank') return handleRank(message, guildId, args);
  if (cmdName === 'leaderboard') return handleLeaderboard(message, guildId);

  const parts = args.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();

  switch (subcommand) {
    case 'toggle':
      return handleToggle(message, guildId, parts.slice(1));
    case 'xp':
      return handleXp(message, guildId, parts.slice(1));
    case 'cooldown':
      return handleCooldown(message, guildId, parts.slice(1));
    case 'factor':
      return handleFactor(message, guildId, parts.slice(1));
    case 'announce':
      return handleAnnounce(message, guildId, parts.slice(1));
    case 'reward':
      return handleReward(message, guildId, parts.slice(1));
    case 'show':
      return handleShow(message, guildId);
    default:
      await message.reply(
        `Leveling config:\n` +
        `\`${prefix}levelconfig toggle <on|off>\`\n` +
        `\`${prefix}levelconfig xp <min> <max>\`\n` +
        `\`${prefix}levelconfig cooldown <seconds>\`\n` +
        `\`${prefix}levelconfig factor <value>\`\n` +
        `\`${prefix}levelconfig announce <on|off> [#channel]\`\n` +
        `\`${prefix}levelconfig reward <add|remove> <level> [@role]\`\n` +
        `\`${prefix}levelconfig show\``
      );
  }
}

async function handleRank(message, guildId, args) {
  const parts = args.trim().split(/\s+/);
  const targetId = parts[0]?.replace(/[<@!>]/g, '') || message.author.id;
  const member = message.guild.members.cache.get(targetId);
  const config = stateManager.getLevelConfig(guildId);
  const userData = stateManager.getUserLevel(guildId, targetId);
  const embed = rankCardEmbed(userData, config, member || null);
  await message.reply({ embeds: [embed] });
}

async function handleLeaderboard(message, guildId) {
  const entries = stateManager.getLeaderboard(guildId, 10);
  if (!entries.length) {
    await message.reply('No ranked members yet. Start chatting!');
    return;
  }

  const lines = entries.map((e, i) => {
    const member = message.guild.members.cache.get(e.user_id);
    const name = member ? member.displayName : `<@${e.user_id}>`;
    return `**${i + 1}.** ${name} — Level **${e.level}** (${e.xp} XP)`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('🏆 Leaderboard')
    .setDescription(lines.join('\n'))
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleToggle(message, guildId, args) {
  const state = args[0]?.toLowerCase();
  if (state !== 'on' && state !== 'off') {
    await message.reply('Usage: `levelconfig toggle <on|off>`');
    return;
  }
  stateManager.setLevelConfig(guildId, { enabled: state === 'on' ? 1 : 0 });
  await message.reply(`XP system turned **${state}**.`);
}

async function handleXp(message, guildId, args) {
  const min = parseInt(args[0], 10);
  const max = parseInt(args[1], 10);
  if (!min || !max || min > max) {
    await message.reply('Usage: `levelconfig xp <min> <max>`');
    return;
  }
  stateManager.setLevelConfig(guildId, { xp_min: min, xp_max: max });
  await message.reply(`XP range set to **${min}-${max}** per message.`);
}

async function handleCooldown(message, guildId, args) {
  const seconds = parseInt(args[0], 10);
  if (!seconds || seconds < 5) {
    await message.reply('Usage: `levelconfig cooldown <seconds>` (min 5)');
    return;
  }
  stateManager.setLevelConfig(guildId, { cooldown_seconds: seconds });
  await message.reply(`XP cooldown set to **${seconds}s**.`);
}

async function handleFactor(message, guildId, args) {
  const value = parseFloat(args[0]);
  if (!value || value < 1) {
    await message.reply('Usage: `levelconfig factor <value>` (e.g. 100)');
    return;
  }
  stateManager.setLevelConfig(guildId, { scaling_factor: value });
  await message.reply(`Level scaling factor set to **${value}**.`);
}

async function handleAnnounce(message, guildId, args) {
  const state = args[0]?.toLowerCase();
  const channelMention = args[1];
  if (state !== 'on' && state !== 'off') {
    await message.reply('Usage: `levelconfig announce <on|off> [#channel]`');
    return;
  }
  const channelId = channelMention ? channelMention.replace(/[<#>]/g, '') : null;
  stateManager.setLevelConfig(guildId, { announce_levelup: state === 'on' ? 1 : 0, announce_channel_id: channelId || null });
  await message.reply(`Level-up announcements turned **${state}**${channelId ? ` in <#${channelId}>` : ''}.`);
}

async function handleReward(message, guildId, args) {
  const action = args[0]?.toLowerCase();
  const level = parseInt(args[1], 10);
  const roleMention = args[2];

  if (!action || !level || (action !== 'add' && action !== 'remove')) {
    await message.reply('Usage: `levelconfig reward <add|remove> <level> [@role]`');
    return;
  }

  if (action === 'add') {
    const roleId = roleMention?.replace(/[<@&>]/g, '');
    if (!roleId) {
      await message.reply('Usage: `levelconfig reward add <level> <@role>`');
      return;
    }
    stateManager.setLevelReward(guildId, level, roleId);
    await message.reply(`Role <@&${roleId}> will be awarded at level **${level}**.`);
  } else {
    stateManager.removeLevelReward(guildId, level);
    await message.reply(`Level **${level}** reward removed.`);
  }
}

async function handleShow(message, guildId) {
  const config = stateManager.getLevelConfig(guildId);
  const rewards = stateManager.getLevelRewards(guildId);

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Leveling Configuration')
    .addFields(
      { name: 'Status', value: config.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
      { name: 'XP Range', value: `${config.xp_min}-${config.xp_max}`, inline: true },
      { name: 'Cooldown', value: `${config.cooldown_seconds}s`, inline: true },
      { name: 'Scaling Factor', value: String(config.scaling_factor), inline: true },
      { name: 'Level-Up Announce', value: config.announce_levelup ? `🟢 ${config.announce_channel_id ? `<#${config.announce_channel_id}>` : 'current channel'}` : '🔴 Off', inline: true }
    )
    .setTimestamp();

  if (rewards.length) {
    const rewardLines = rewards.map((r) => `Level **${r.level}** → <@&${r.role_id}>`);
    embed.addFields({ name: 'Role Rewards', value: rewardLines.join('\n'), inline: false });
  }

  await message.reply({ embeds: [embed] });
}

async function handleSlashCommand(interaction) {
  const guildId = interaction.guildId;

  if (interaction.commandName === 'rank') {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);
    const config = stateManager.getLevelConfig(guildId);
    const userData = stateManager.getUserLevel(guildId, user.id);
    const embed = rankCardEmbed(userData, config, member || null);
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (interaction.commandName === 'leaderboard') {
    const entries = stateManager.getLeaderboard(guildId, 10);
    if (!entries.length) {
      await interaction.reply({ content: 'No ranked members yet.', ephemeral: true });
      return;
    }
    const lines = entries.map((e, i) => {
      const member = interaction.guild.members.cache.get(e.user_id);
      const name = member ? member.displayName : `<@${e.user_id}>`;
      return `**${i + 1}.** ${name} — Level **${e.level}** (${e.xp} XP)`;
    });
    const embed = new EmbedBuilder()
      .setColor(0xc67a3a)
      .setTitle('🏆 Leaderboard')
      .setDescription(lines.join('\n'))
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  switch (subcommand) {
    case 'toggle': {
      const state = interaction.options.getString('state', true);
      stateManager.setLevelConfig(guildId, { enabled: state === 'on' ? 1 : 0 });
      await interaction.reply({ content: `XP turned **${state}**.`, ephemeral: true });
      break;
    }
    case 'xp': {
      const min = interaction.options.getInteger('min', true);
      const max = interaction.options.getInteger('max', true);
      stateManager.setLevelConfig(guildId, { xp_min: min, xp_max: max });
      await interaction.reply({ content: `XP range set to **${min}-${max}**.`, ephemeral: true });
      break;
    }
    case 'cooldown': {
      const seconds = interaction.options.getInteger('seconds', true);
      stateManager.setLevelConfig(guildId, { cooldown_seconds: seconds });
      await interaction.reply({ content: `Cooldown set to **${seconds}s**.`, ephemeral: true });
      break;
    }
    case 'factor': {
      const value = interaction.options.getNumber('value', true);
      stateManager.setLevelConfig(guildId, { scaling_factor: value });
      await interaction.reply({ content: `Scaling factor set to **${value}**.`, ephemeral: true });
      break;
    }
    case 'announce': {
      const state = interaction.options.getString('state', true);
      const channel = interaction.options.getChannel('channel');
      stateManager.setLevelConfig(guildId, { announce_levelup: state === 'on' ? 1 : 0, announce_channel_id: channel?.id || null });
      await interaction.reply({ content: `Announcements turned **${state}**${channel ? ` in ${channel}` : ''}.`, ephemeral: true });
      break;
    }
    case 'reward': {
      const action = interaction.options.getString('action', true);
      const level = interaction.options.getInteger('level', true);
      if (action === 'add') {
        const role = interaction.options.getRole('role', true);
        stateManager.setLevelReward(guildId, level, role.id);
        await interaction.reply({ content: `${role} will be awarded at level **${level}**.`, ephemeral: true });
      } else {
        stateManager.removeLevelReward(guildId, level);
        await interaction.reply({ content: `Level **${level}** reward removed.`, ephemeral: true });
      }
      break;
    }
    case 'show': {
      const config = stateManager.getLevelConfig(guildId);
      const rewards = stateManager.getLevelRewards(guildId);
      const embed = new EmbedBuilder()
        .setColor(0xc67a3a)
        .setTitle('Leveling Configuration')
        .addFields(
          { name: 'Status', value: config.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
          { name: 'XP Range', value: `${config.xp_min}-${config.xp_max}`, inline: true },
          { name: 'Cooldown', value: `${config.cooldown_seconds}s`, inline: true },
          { name: 'Factor', value: String(config.scaling_factor), inline: true },
          { name: 'Announce', value: config.announce_levelup ? `🟢 ${config.announce_channel_id ? `<#${config.announce_channel_id}>` : 'current'}` : '🔴 Off', inline: true }
        )
        .setTimestamp();
      if (rewards.length) {
        embed.addFields({ name: 'Rewards', value: rewards.map((r) => `Lv ${r.level} → <@&${r.role_id}>`).join('\n'), inline: false });
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

export { handlePrefixCommand, handleSlashCommand, handleMessageXp };
export default handlePrefixCommand;
