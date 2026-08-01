import stateManager from '../../core/state.js';
import client from '../../core/client.js';
import logger from '../../core/logger.js';
import { EmbedBuilder } from 'discord.js';
import { getPrefix } from '../../core/prefix.js';

const joinBuffer = new Map();

function pruneJoinBuffer(guildId) {
  const now = Date.now();
  const buf = joinBuffer.get(guildId);
  if (!buf) return [];
  const config = stateManager.getRaidConfig(guildId);
  const windowMs = (config.time_window_seconds || 10) * 1000;
  const recent = buf.filter((t) => now - t < windowMs);
  joinBuffer.set(guildId, recent);
  return recent;
}

function recordJoin(guildId) {
  if (!joinBuffer.has(guildId)) joinBuffer.set(guildId, []);
  joinBuffer.get(guildId).push(Date.now());
}

function memberIsWhitelisted(member) {
  const config = stateManager.getRaidConfig(member.guild.id);
  const whitelist = config.whitelist_role_ids || [];
  if (!whitelist.length) return false;
  return member.roles.cache.some((role) => whitelist.includes(role.id));
}

async function applyLockdown(guildId, reason) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;

  const everyone = guild.roles.everyone;
  const locked = [];

  for (const channel of guild.channels.cache.values()) {
    if (channel.isTextBased()) {
      try {
        const overwrite = channel.permissionOverwrites.cache.get(everyone.id);
        if (overwrite && overwrite.deny.has('SendMessages')) continue;
        await channel.permissionOverwrites.edit(everyone, { SendMessages: false });
        locked.push(channel.id);
      } catch {}
    }
  }

  const config = stateManager.getRaidConfig(guildId);
  const notifyChannel = config.notify_channel_id
    ? guild.channels.cache.get(config.notify_channel_id)
    : null;
  if (notifyChannel) {
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('🚨 Raid Mode Activated')
      .setDescription(reason || 'Join threshold exceeded.')
      .setTimestamp();
    await notifyChannel.send({ embeds: [embed] }).catch(() => null);
  }

  return locked;
}

async function removeLockdown(guildId) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const everyone = guild.roles.everyone;
  for (const channel of guild.channels.cache.values()) {
    if (channel.isTextBased()) {
      try {
        await channel.permissionOverwrites.edit(everyone, { SendMessages: null });
      } catch {}
    }
  }

  const config = stateManager.getRaidConfig(guildId);
  const notifyChannel = config.notify_channel_id
    ? guild.channels.cache.get(config.notify_channel_id)
    : null;
  if (notifyChannel) {
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('✅ Raid Mode Ended')
      .setDescription('Lockdown has been lifted.')
      .setTimestamp();
    await notifyChannel.send({ embeds: [embed] }).catch(() => null);
  }
}

async function handleGuildMemberAdd(member) {
  if (member.user.bot) return;
  const guildId = member.guild.id;

  const config = stateManager.getRaidConfig(guildId);
  if (!config.enabled) return;

  if (memberIsWhitelisted(member)) return;

  recordJoin(guildId);
  const recentJoins = pruneJoinBuffer(guildId);

  if (recentJoins.length >= config.join_threshold) {
    const active = stateManager.getActiveRaidEvent(guildId);
    if (active) return;

    const eventId = stateManager.createRaidEvent(guildId, recentJoins.length, 'lockdown');
    const locked = await applyLockdown(guildId, `Join threshold exceeded: ${recentJoins.length} joins in ${config.time_window_seconds}s`);

    const lockoutMs = (config.auto_lockout_minutes || 15) * 60 * 1000;
    setTimeout(async () => {
      await removeLockdown(guildId);
      stateManager.endRaidEvent(eventId);
      joinBuffer.delete(guildId);
    }, lockoutMs);

    logger.warn({ guildId, joinCount: recentJoins.length, eventId }, 'Raid mode activated');
  }
}

async function handlePrefixCommand(message, args, guildId) {
  if (!guildId) {
    await message.reply('This command can only be used in a server.');
    return;
  }

  const prefix = getPrefix(guildId);
  const parts = args.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();

  const isRaidMode = message.content.startsWith(prefix + 'raidmode');
  if (isRaidMode) {
    const action = parts[0]?.toLowerCase();
    if (action === 'on') {
      await applyLockdown(guildId, 'Manual raid mode by ' + message.author.tag);
      await message.reply('👍');
    } else if (action === 'off') {
      await removeLockdown(guildId);
      await message.reply('👍');
    } else {
      await message.reply('Usage: `raidmode <on|off>`');
    }
    return;
  }

  switch (subcommand) {
    case 'toggle':
      return handleToggle(message, guildId, parts.slice(1));
    case 'threshold':
      return handleThreshold(message, guildId, parts.slice(1));
    case 'window':
      return handleWindow(message, guildId, parts.slice(1));
    case 'lockout':
      return handleLockout(message, guildId, parts.slice(1));
    case 'whitelist':
      return handleWhitelist(message, guildId, parts.slice(1));
    case 'status':
      return handleStatus(message, guildId);
    case 'end':
      return handleEnd(message, guildId);
    default:
      const prefix = getPrefix(guildId);
      await message.reply(
        `Anti-raid management:\n` +
        `\`${prefix}raid toggle <on|off>\` — enable/disable detection\n` +
        `\`${prefix}raid threshold <count>\` — joins before trigger\n` +
        `\`${prefix}raid window <seconds>\` — time window\n` +
        `\`${prefix}raid lockout <minutes>\` — auto-unlock time\n` +
        `\`${prefix}raid whitelist <add|remove> <@role>\` — bypass roles\n` +
        `\`${prefix}raid status\` — show config\n` +
        `\`${prefix}raid end\` — end active raid\n` +
        `\`${prefix}raidmode <on|off>\` — manual toggle`
      );
  }
}

async function handleToggle(message, guildId, args) {
  const state = args[0]?.toLowerCase();
  if (state !== 'on' && state !== 'off') {
    await message.reply('Usage: `raid toggle <on|off>`');
    return;
  }
  stateManager.setRaidConfig(guildId, { enabled: state === 'on' ? 1 : 0 });
  await message.reply(`Anti-raid detection turned **${state}**.`);
}

async function handleThreshold(message, guildId, args) {
  const count = parseInt(args[0], 10);
  if (!count || count < 1 || count > 100) {
    await message.reply('Usage: `raid threshold <1-100>`');
    return;
  }
  stateManager.setRaidConfig(guildId, { join_threshold: count });
  await message.reply(`Join threshold set to **${count}**.`);
}

async function handleWindow(message, guildId, args) {
  const seconds = parseInt(args[0], 10);
  if (!seconds || seconds < 1 || seconds > 3600) {
    await message.reply('Usage: `raid window <1-3600>`');
    return;
  }
  stateManager.setRaidConfig(guildId, { time_window_seconds: seconds });
  await message.reply(`Time window set to **${seconds}s**.`);
}

async function handleLockout(message, guildId, args) {
  const minutes = parseInt(args[0], 10);
  if (!minutes || minutes < 1 || minutes > 1440) {
    await message.reply('Usage: `raid lockout <1-1440>`');
    return;
  }
  stateManager.setRaidConfig(guildId, { auto_lockout_minutes: minutes });
  await message.reply(`Auto-unlock set to **${minutes} minutes**.`);
}

async function handleWhitelist(message, guildId, args) {
  const action = args[0]?.toLowerCase();
  const roleMention = args[1];
  const roleId = roleMention?.replace(/[<@&>]/g, '');

  if (!action || !roleId || (action !== 'add' && action !== 'remove')) {
    await message.reply('Usage: `raid whitelist <add|remove> <@role>`');
    return;
  }

  const config = stateManager.getRaidConfig(guildId);
  let whitelist = config.whitelist_role_ids || [];

  if (action === 'add') {
    if (whitelist.includes(roleId)) {
      await message.reply('Role already whitelisted.');
      return;
    }
    whitelist.push(roleId);
  } else {
    whitelist = whitelist.filter((id) => id !== roleId);
  }

  stateManager.setRaidConfig(guildId, { whitelist_role_ids: whitelist });
  await message.reply(`${action === 'add' ? 'Added' : 'Removed'} <@&${roleId}> ${action === 'add' ? 'to' : 'from'} whitelist.`);
}

async function handleStatus(message, guildId) {
  const config = stateManager.getRaidConfig(guildId);
  const active = stateManager.getActiveRaidEvent(guildId);

  const embed = new EmbedBuilder()
    .setColor(config.enabled ? 0x57f287 : 0x95a5a6)
    .setTitle('Anti-Raid Configuration')
    .addFields(
      { name: 'Status', value: config.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
      { name: 'Threshold', value: `${config.join_threshold} joins`, inline: true },
      { name: 'Time Window', value: `${config.time_window_seconds}s`, inline: true },
      { name: 'Auto-Unlock', value: `${config.auto_lockout_minutes} min`, inline: true },
      { name: 'Whitelisted Roles', value: config.whitelist_role_ids?.length
        ? config.whitelist_role_ids.map((id) => `<@&${id}>`).join(', ')
        : 'None', inline: false },
      { name: 'Notify Channel', value: config.notify_channel_id ? `<#${config.notify_channel_id}>` : 'Not set', inline: true },
      { name: 'Active Raid', value: active ? `Yes (${active.join_count} joins, started <t:${Math.floor(new Date(active.started_at).getTime() / 1000)}:R>)` : 'No', inline: true }
    )
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleEnd(message, guildId) {
  const active = stateManager.getActiveRaidEvent(guildId);
  if (!active) {
    await message.reply('No active raid event.');
    return;
  }

  await removeLockdown(guildId);
  stateManager.endRaidEvent(active.id);
  joinBuffer.delete(guildId);
  await message.reply('👍');
}

async function handleSlashCommand(interaction) {
  const guildId = interaction.guildId;

  if (interaction.commandName === 'raidmode') {
    return handleRaidModeSlash(interaction);
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'toggle': {
      const state = interaction.options.getString('state', true);
      stateManager.setRaidConfig(guildId, { enabled: state === 'on' ? 1 : 0 });
      await interaction.reply({ content: `Anti-raid detection turned **${state}**.`, ephemeral: true });
      break;
    }
    case 'threshold': {
      const count = interaction.options.getInteger('count', true);
      stateManager.setRaidConfig(guildId, { join_threshold: count });
      await interaction.reply({ content: `Join threshold set to **${count}**.`, ephemeral: true });
      break;
    }
    case 'window': {
      const seconds = interaction.options.getInteger('seconds', true);
      stateManager.setRaidConfig(guildId, { time_window_seconds: seconds });
      await interaction.reply({ content: `Time window set to **${seconds}s**.`, ephemeral: true });
      break;
    }
    case 'lockout': {
      const minutes = interaction.options.getInteger('minutes', true);
      stateManager.setRaidConfig(guildId, { auto_lockout_minutes: minutes });
      await interaction.reply({ content: `Auto-unlock set to **${minutes} minutes**.`, ephemeral: true });
      break;
    }
    case 'whitelist': {
      const action = interaction.options.getString('action', true);
      const role = interaction.options.getRole('role', true);
      const config = stateManager.getRaidConfig(guildId);
      let whitelist = config.whitelist_role_ids || [];
      if (action === 'add') {
        if (whitelist.includes(role.id)) {
          await interaction.reply({ content: 'Role already whitelisted.', ephemeral: true });
          return;
        }
        whitelist.push(role.id);
      } else {
        whitelist = whitelist.filter((id) => id !== role.id);
      }
      stateManager.setRaidConfig(guildId, { whitelist_role_ids: whitelist });
      await interaction.reply({ content: `${action === 'add' ? 'Added' : 'Removed'} ${role} ${action === 'add' ? 'to' : 'from'} whitelist.`, ephemeral: true });
      break;
    }
    case 'status': {
      const config = stateManager.getRaidConfig(guildId);
      const active = stateManager.getActiveRaidEvent(guildId);
      const embed = new EmbedBuilder()
        .setColor(config.enabled ? 0x57f287 : 0x95a5a6)
        .setTitle('Anti-Raid Configuration')
        .addFields(
          { name: 'Status', value: config.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
          { name: 'Threshold', value: `${config.join_threshold} joins`, inline: true },
          { name: 'Time Window', value: `${config.time_window_seconds}s`, inline: true },
          { name: 'Auto-Unlock', value: `${config.auto_lockout_minutes} min`, inline: true },
          { name: 'Whitelisted Roles', value: config.whitelist_role_ids?.length
            ? config.whitelist_role_ids.map((id) => `<@&${id}>`).join(', ')
            : 'None', inline: false },
          { name: 'Notify Channel', value: config.notify_channel_id ? `<#${config.notify_channel_id}>` : 'Not set', inline: true },
          { name: 'Active Raid', value: active ? `Yes (${active.join_count} joins)` : 'No', inline: true }
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'end': {
      const active = stateManager.getActiveRaidEvent(guildId);
      if (!active) {
        await interaction.reply({ content: 'No active raid event.', ephemeral: true });
        return;
      }
      await removeLockdown(guildId);
      stateManager.endRaidEvent(active.id);
      joinBuffer.delete(guildId);
      await interaction.reply({ content: '👍', ephemeral: true });
      break;
    }
  }
}

async function handleRaidModeSlash(interaction) {
  const action = interaction.options.getString('action', true);
  if (action === 'on') {
    await applyLockdown(interaction.guildId, 'Manual raid mode by ' + interaction.user.tag);
    await interaction.reply('👍');
  } else {
    await removeLockdown(interaction.guildId);
    await interaction.reply('👍');
  }
}

export { handlePrefixCommand, handleSlashCommand, handleRaidModeSlash, handleGuildMemberAdd };
export default handlePrefixCommand;
