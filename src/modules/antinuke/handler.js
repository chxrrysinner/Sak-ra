import stateManager from '../../core/state.js';
import client from '../../core/client.js';
import logger from '../../core/logger.js';
import { EmbedBuilder, AuditLogEvent } from 'discord.js';
import { getPrefix } from '../../core/prefix.js';

const eventBuffer = new Map();

function eventBufferKey(guildId, eventType) {
  return `${guildId}:${eventType}`;
}

function pruneBuffer(guildId, eventType, windowMs) {
  const key = eventBufferKey(guildId, eventType);
  const buf = eventBuffer.get(key);
  if (!buf) return [];
  const now = Date.now();
  const recent = buf.filter((t) => now - t < windowMs);
  eventBuffer.set(key, recent);
  return recent;
}

function recordEvent(guildId, eventType) {
  const key = eventBufferKey(guildId, eventType);
  if (!eventBuffer.has(key)) eventBuffer.set(key, []);
  eventBuffer.get(key).push(Date.now());
}

async function fetchAuditLogActor(guild, eventType) {
  try {
    const auditTypes = {
      channel_delete: AuditLogEvent.ChannelDelete,
      role_delete: AuditLogEvent.RoleDelete,
      ban_add: AuditLogEvent.MemberBanAdd
    };
    const auditType = auditTypes[eventType];
    if (!auditType) return null;
    const entries = await guild.fetchAuditLogs({ type: auditType, limit: 1 });
    const entry = entries.entries.first();
    return entry?.executor || null;
  } catch {
    return null;
  }
}

function isWhitelisted(guildId, actor) {
  if (!actor) return false;
  const config = stateManager.getAntinukeConfig(guildId);
  if (config.whitelist_user_ids?.includes(actor.id)) return true;
  if (config.whitelist_role_ids?.length && actor.roles) {
    return actor.roles.cache.some((role) => config.whitelist_role_ids.includes(role.id));
  }
  return false;
}

async function applyLockdown(guildId) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const everyone = guild.roles.everyone;
  for (const channel of guild.channels.cache.values()) {
    if (channel.isTextBased()) {
      try {
        const overwrite = channel.permissionOverwrites.cache.get(everyone.id);
        if (overwrite && overwrite.deny.has('SendMessages')) continue;
        await channel.permissionOverwrites.edit(everyone, { SendMessages: false });
      } catch {}
    }
  }
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
}

async function rollbackChannel(channel) {
  if (!channel || !channel.guild) return null;
  try {
    const cloned = await channel.clone({
      name: channel.name,
      reason: 'Anti-nuke rollback'
    });
    if (channel.parentId) {
      await cloned.setParent(channel.parentId, { lockPermissions: false }).catch(() => null);
    }
    return cloned;
  } catch (error) {
    logger.warn({ channelId: channel.id, error: error.message }, 'Failed to rollback channel');
    return null;
  }
}

async function rollbackRole(role) {
  if (!role || !role.guild) return null;
  try {
    const cloned = await role.clone({ reason: 'Anti-nuke rollback' });
    return cloned;
  } catch (error) {
    logger.warn({ roleId: role.id, error: error.message }, 'Failed to rollback role');
    return null;
  }
}

async function notify(guildId, embed) {
  const config = stateManager.getAntinukeConfig(guildId);
  if (!config.notify_channel_id) return;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  const channel = guild.channels.cache.get(config.notify_channel_id);
  if (!channel) return;
  await channel.send({ embeds: [embed] }).catch(() => null);
}

const deletedChannels = new Map();
const deletedRoles = new Map();

async function checkAndTrigger(guild, eventType) {
  const guildId = guild.id;
  const config = stateManager.getAntinukeConfig(guildId);
  if (!config.enabled) return;

  const thresholdKey = {
    channel_delete: 'channel_delete_threshold',
    role_delete: 'role_delete_threshold',
    ban_add: 'ban_add_threshold'
  }[eventType];

  const threshold = config[thresholdKey] || 3;
  const windowMs = (config.time_window_seconds || 5) * 1000;

  recordEvent(guildId, eventType);
  const recent = pruneBuffer(guildId, eventType, windowMs);

  if (recent.length < threshold) return;

  const actor = await fetchAuditLogActor(guild, eventType);
  if (actor && isWhitelisted(guildId, actor)) return;

  stateManager.logAntinukeEvent(guildId, eventType, actor?.id || null, recent.length, config.action_on_trigger, `Threshold exceeded: ${recent.length} in ${config.time_window_seconds}s`);

  if (config.action_on_trigger === 'log') return;

  await applyLockdown(guildId);

  if (actor && guild.members.me.permissions.has('BanMembers')) {
    try {
      await guild.bans.create(actor.id, { reason: 'Anti-nuke: mass destruction detected' });
    } catch {}
  }

  if (config.action_on_trigger === 'rollback') {
    const channelsToRestore = deletedChannels.get(guildId) || [];
    const rolesToRestore = deletedRoles.get(guildId) || [];
    for (const ch of channelsToRestore) await rollbackChannel(ch);
    for (const r of rolesToRestore) await rollbackRole(r);
    deletedChannels.delete(guildId);
    deletedRoles.delete(guildId);
  }

  const lockoutMs = (config.auto_lockout_minutes || 30) * 60 * 1000;
  setTimeout(async () => {
    await removeLockdown(guildId);
  }, lockoutMs);

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🚨 Anti-Nuke Triggered')
    .setDescription(`**Event:** ${eventType}\n**Count:** ${recent.length} in ${config.time_window_seconds}s\n**Action:** ${config.action_on_trigger}${actor ? `\n**Actor:** ${actor.tag} (\`${actor.id}\`)` : ''}`)
    .setTimestamp();

  await notify(guildId, embed);
  logger.warn({ guildId, eventType, count: recent.length, actorId: actor?.id }, 'Anti-nuke triggered');
}

async function handleChannelDelete(channel) {
  if (channel.partial) return;
  if (channel.type === 1) return;
  const guild = channel.guild;
  if (!guild) return;
  const config = stateManager.getAntinukeConfig(guild.id);
  if (!config.enabled) return;

  if (!deletedChannels.has(guild.id)) deletedChannels.set(guild.id, []);
  deletedChannels.get(guild.id).push(channel);

  await checkAndTrigger(guild, 'channel_delete');
}

async function handleRoleDelete(role) {
  if (role.managed) return;
  const guild = role.guild;
  if (!guild) return;
  const config = stateManager.getAntinukeConfig(guild.id);
  if (!config.enabled) return;

  if (!deletedRoles.has(guild.id)) deletedRoles.set(guild.id, []);
  deletedRoles.get(guild.id).push(role);

  await checkAndTrigger(guild, 'role_delete');
}

async function handleGuildBanAdd(ban) {
  const guild = ban.guild;
  if (!guild) return;
  const config = stateManager.getAntinukeConfig(guild.id);
  if (!config.enabled) return;

  await checkAndTrigger(guild, 'ban_add');
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
    case 'threshold':
      return handleThreshold(message, guildId, parts.slice(1));
    case 'window':
      return handleWindow(message, guildId, parts.slice(1));
    case 'lockout':
      return handleLockout(message, guildId, parts.slice(1));
    case 'action':
      return handleAction(message, guildId, parts.slice(1));
    case 'whitelist':
      return handleWhitelist(message, guildId, parts.slice(1));
    case 'status':
      return handleStatus(message, guildId);
    default:
      await message.reply(
        `Anti-nuke management:\n` +
        `\`${prefix}antinuke toggle <on|off>\` — enable/disable\n` +
        `\`${prefix}antinuke threshold <channel_delete|role_delete|ban_add> <count>\` — set threshold\n` +
        `\`${prefix}antinuke window <seconds>\` — time window\n` +
        `\`${prefix}antinuke lockout <minutes>\` — auto-unlock\n` +
        `\`${prefix}antinuke action <log|lockdown|rollback>\` — trigger action\n` +
        `\`${prefix}antinuke whitelist <add|remove> <role|user> <id>\` — whitelist\n` +
        `\`${prefix}antinuke status\` — show config`
      );
  }
}

async function handleToggle(message, guildId, args) {
  const state = args[0]?.toLowerCase();
  if (state !== 'on' && state !== 'off') {
    await message.reply('Usage: `antinuke toggle <on|off>`');
    return;
  }
  stateManager.setAntinukeConfig(guildId, { enabled: state === 'on' ? 1 : 0 });
  await message.reply(`Anti-nuke turned **${state}**.`);
}

async function handleThreshold(message, guildId, args) {
  const type = args[0]?.toLowerCase();
  const count = parseInt(args[1], 10);
  const validTypes = ['channel_delete', 'role_delete', 'ban_add'];
  if (!validTypes.includes(type) || !count || count < 1) {
    await message.reply('Usage: `antinuke threshold <channel_delete|role_delete|ban_add> <count>`');
    return;
  }
  const fieldMap = {
    channel_delete: 'channel_delete_threshold',
    role_delete: 'role_delete_threshold',
    ban_add: 'ban_add_threshold'
  };
  stateManager.setAntinukeConfig(guildId, { [fieldMap[type]]: count });
  await message.reply(`**${type}** threshold set to **${count}**.`);
}

async function handleWindow(message, guildId, args) {
  const seconds = parseInt(args[0], 10);
  if (!seconds || seconds < 1 || seconds > 3600) {
    await message.reply('Usage: `antinuke window <1-3600>`');
    return;
  }
  stateManager.setAntinukeConfig(guildId, { time_window_seconds: seconds });
  await message.reply(`Time window set to **${seconds}s**.`);
}

async function handleLockout(message, guildId, args) {
  const minutes = parseInt(args[0], 10);
  if (!minutes || minutes < 1 || minutes > 1440) {
    await message.reply('Usage: `antinuke lockout <1-1440>`');
    return;
  }
  stateManager.setAntinukeConfig(guildId, { auto_lockout_minutes: minutes });
  await message.reply(`Auto-unlock set to **${minutes} minutes**.`);
}

async function handleAction(message, guildId, args) {
  const action = args[0]?.toLowerCase();
  const valid = ['log', 'lockdown', 'rollback'];
  if (!valid.includes(action)) {
    await message.reply('Usage: `antinuke action <log|lockdown|rollback>`');
    return;
  }
  stateManager.setAntinukeConfig(guildId, { action_on_trigger: action });
  await message.reply(`Trigger action set to **${action}**.`);
}

async function handleWhitelist(message, guildId, args) {
  const action = args[0]?.toLowerCase();
  const type = args[1]?.toLowerCase();
  const id = args[2]?.replace(/[<@&>]/g, '');

  if (!action || !type || !id || (action !== 'add' && action !== 'remove') || (type !== 'role' && type !== 'user')) {
    await message.reply('Usage: `antinuke whitelist <add|remove> <role|user> <id>`');
    return;
  }

  const config = stateManager.getAntinukeConfig(guildId);
  const listKey = type === 'role' ? 'whitelist_role_ids' : 'whitelist_user_ids';
  let list = config[listKey] || [];

  if (action === 'add') {
    if (list.includes(id)) {
      await message.reply(`Already whitelisted.`);
      return;
    }
    list.push(id);
  } else {
    list = list.filter((x) => x !== id);
  }

  stateManager.setAntinukeConfig(guildId, { [listKey]: list });
  await message.reply(`${action === 'add' ? 'Added' : 'Removed'} ${type} <@${type === 'role' ? '&' : ''}${id}> ${action === 'add' ? 'to' : 'from'} whitelist.`);
}

async function handleStatus(message, guildId) {
  const config = stateManager.getAntinukeConfig(guildId);

  const embed = new EmbedBuilder()
    .setColor(config.enabled ? 0x57f287 : 0x95a5a6)
    .setTitle('Anti-Nuke Configuration')
    .addFields(
      { name: 'Status', value: config.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
      { name: 'Time Window', value: `${config.time_window_seconds}s`, inline: true },
      { name: 'Auto-Unlock', value: `${config.auto_lockout_minutes} min`, inline: true },
      { name: 'Channel Delete Threshold', value: String(config.channel_delete_threshold), inline: true },
      { name: 'Role Delete Threshold', value: String(config.role_delete_threshold), inline: true },
      { name: 'Ban Add Threshold', value: String(config.ban_add_threshold), inline: true },
      { name: 'Action on Trigger', value: config.action_on_trigger, inline: true },
      { name: 'Whitelisted Roles', value: config.whitelist_role_ids?.length
        ? config.whitelist_role_ids.map((id) => `<@&${id}>`).join(', ')
        : 'None', inline: false },
      { name: 'Whitelisted Users', value: config.whitelist_user_ids?.length
        ? config.whitelist_user_ids.map((id) => `<@${id}>`).join(', ')
        : 'None', inline: false },
      { name: 'Notify Channel', value: config.notify_channel_id ? `<#${config.notify_channel_id}>` : 'Not set', inline: true }
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
      stateManager.setAntinukeConfig(guildId, { enabled: state === 'on' ? 1 : 0 });
      await interaction.reply({ content: `Anti-nuke turned **${state}**.`, ephemeral: true });
      break;
    }
    case 'threshold': {
      const type = interaction.options.getString('type', true);
      const count = interaction.options.getInteger('count', true);
      const fieldMap = { channel_delete: 'channel_delete_threshold', role_delete: 'role_delete_threshold', ban_add: 'ban_add_threshold' };
      stateManager.setAntinukeConfig(guildId, { [fieldMap[type]]: count });
      await interaction.reply({ content: `**${type}** threshold set to **${count}**.`, ephemeral: true });
      break;
    }
    case 'window': {
      const seconds = interaction.options.getInteger('seconds', true);
      stateManager.setAntinukeConfig(guildId, { time_window_seconds: seconds });
      await interaction.reply({ content: `Time window set to **${seconds}s**.`, ephemeral: true });
      break;
    }
    case 'lockout': {
      const minutes = interaction.options.getInteger('minutes', true);
      stateManager.setAntinukeConfig(guildId, { auto_lockout_minutes: minutes });
      await interaction.reply({ content: `Auto-unlock set to **${minutes} minutes**.`, ephemeral: true });
      break;
    }
    case 'action': {
      const action = interaction.options.getString('value', true);
      stateManager.setAntinukeConfig(guildId, { action_on_trigger: action });
      await interaction.reply({ content: `Trigger action set to **${action}**.`, ephemeral: true });
      break;
    }
    case 'whitelist': {
      const action = interaction.options.getString('action', true);
      const type = interaction.options.getString('type', true);
      const id = interaction.options.getString('id', true);
      const config = stateManager.getAntinukeConfig(guildId);
      const listKey = type === 'role' ? 'whitelist_role_ids' : 'whitelist_user_ids';
      let list = config[listKey] || [];
      if (action === 'add') {
        if (list.includes(id)) {
          await interaction.reply({ content: 'Already whitelisted.', ephemeral: true });
          return;
        }
        list.push(id);
      } else {
        list = list.filter((x) => x !== id);
      }
      stateManager.setAntinukeConfig(guildId, { [listKey]: list });
      await interaction.reply({ content: `${action === 'add' ? 'Added' : 'Removed'} ${type}.`, ephemeral: true });
      break;
    }
    case 'status': {
      const config = stateManager.getAntinukeConfig(guildId);
      const embed = new EmbedBuilder()
        .setColor(config.enabled ? 0x57f287 : 0x95a5a6)
        .setTitle('Anti-Nuke Configuration')
        .addFields(
          { name: 'Status', value: config.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
          { name: 'Time Window', value: `${config.time_window_seconds}s`, inline: true },
          { name: 'Auto-Unlock', value: `${config.auto_lockout_minutes} min`, inline: true },
          { name: 'Channel Delete Threshold', value: String(config.channel_delete_threshold), inline: true },
          { name: 'Role Delete Threshold', value: String(config.role_delete_threshold), inline: true },
          { name: 'Ban Add Threshold', value: String(config.ban_add_threshold), inline: true },
          { name: 'Action', value: config.action_on_trigger, inline: true },
          { name: 'Whitelist Roles', value: config.whitelist_role_ids?.length
            ? config.whitelist_role_ids.map((id) => `<@&${id}>`).join(', ') : 'None', inline: false },
          { name: 'Whitelist Users', value: config.whitelist_user_ids?.length
            ? config.whitelist_user_ids.map((id) => `<@${id}>`).join(', ') : 'None', inline: false },
          { name: 'Notify Channel', value: config.notify_channel_id ? `<#${config.notify_channel_id}>` : 'Not set', inline: true }
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

export { handlePrefixCommand, handleSlashCommand, handleChannelDelete, handleRoleDelete, handleGuildBanAdd };
export default handlePrefixCommand;
