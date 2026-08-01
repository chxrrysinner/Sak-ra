import { EmbedBuilder } from 'discord.js';
import stateManager from '../../core/state.js';
import { getSuccessResponse, sendModerationDM, runModAction, checkHierarchy, extractUserAndReason } from './shared.js';
import config from '../../core/config.js';
import client from '../../core/client.js';
import { getPrefix } from '../../core/prefix.js';

const JAIL_ROLE_SETTING = 'jail_role_id';
const JAIL_CHANNEL_SETTING = 'jail_channel_id';

async function getJailRole(guild) {
  const roleId = stateManager.getGuildSetting(guild.id, JAIL_ROLE_SETTING);
  if (roleId) {
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (role) return role;
  }
  return null;
}

async function handlePrefixCommand(message, args, guildId) {
  const prefix = getPrefix(guildId);
  const isUnjail = message.content.startsWith(prefix + 'unjail');
  const subcommand = args.trim().split(/\s+/)[0]?.toLowerCase();

  if (isUnjail || subcommand === 'release') {
    return handleRelease(message, args, guildId);
  }

  if (subcommand === 'config') {
    return handleConfig(message, guildId, args.trim().split(/\s+/).slice(1));
  }

  const { userId, reason } = extractUserAndReason(args);
  if (!userId) {
    await message.reply('Usage: `jail <@user> [reason]`\n`jail setup` — create jail role\n`jail release <@user> [reason]` — release from jail');
    return;
  }

  const member = await message.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await message.reply('User not found in this server.');
    return;
  }
  const hierarchy = checkHierarchy(message.member, member);
  if (!hierarchy.allowed) {
    await message.reply(hierarchy.message);
    return;
  }

  const jailRole = await getJailRole(message.guild);
  if (!jailRole) {
    await message.reply('Jail role not set up. Use `setupjail` first.');
    return;
  }

  try {
    const rolesToRestore = member.roles.cache
      .filter((r) => r.id !== message.guild.id && !r.managed)
      .map((r) => r.id);

    await member.roles.set([jailRole.id], `Jailed: ${reason}`);

    stateManager.setGuildSetting(guildId, `jail_roles_${userId}`, JSON.stringify(rolesToRestore));

    await sendModerationDM(userId, 'jail', reason, guildId);
    await runModAction(guildId, userId, message.author.id, 'jail', reason, {}, message.guild);
    await message.channel.send(getSuccessResponse(guildId));
  } catch (error) {
    await message.channel.send('nuuu');
  }
}

async function handleConfig(message, guildId, args) {
  const sub = args[0]?.toLowerCase();
  if (sub === 'role') {
    const roleId = args[1]?.replace(/[<@&>]/g, '');
    if (!roleId) {
      await message.reply('Usage: `jail config role <role id/mention>`');
      return;
    }
    const role = await message.guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      await message.reply('Role not found.');
      return;
    }
    stateManager.setGuildSetting(guildId, JAIL_ROLE_SETTING, roleId);
    await message.reply(`Jail role set to ${role}.`);
  } else if (sub === 'channel') {
    const channelId = args[1]?.replace(/[<#>]/g, '');
    if (!channelId) {
      await message.reply('Usage: `jail config channel #channel`');
      return;
    }
    const channel = await message.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      await message.reply('Channel not found.');
      return;
    }
    stateManager.setGuildSetting(guildId, JAIL_CHANNEL_SETTING, channelId);
    await message.reply(`Jail channel set to ${channel}.`);
  } else {
    const roleId = stateManager.getGuildSetting(guildId, JAIL_ROLE_SETTING);
    const channelId = stateManager.getGuildSetting(guildId, JAIL_CHANNEL_SETTING);
    const role = roleId ? `<@&${roleId}>` : 'Not set';
    const channel = channelId ? `<#${channelId}>` : 'Not set';
    await message.reply(`**Jail Config**\nRole: ${role}\nChannel: ${channel}\n\nUse \`jail config role <id>\` or \`jail config channel #channel\` to update.`);
  }
}

async function handleRelease(message, args, guildId) {
  const parts = args.trim().split(/\s+/);
  parts.shift();
  const { userId, reason } = extractUserAndReason(parts.join(' '));

  if (!userId) {
    await message.reply('Usage: `jail release <@user> [reason]`');
    return;
  }

  const member = await message.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await message.reply('User not found in this server.');
    return;
  }

  const jailRole = await getJailRole(message.guild);
  if (!jailRole || !member.roles.cache.has(jailRole.id)) {
    await message.reply('That user is not jailed.');
    return;
  }

  try {
    const rolesJson = stateManager.getGuildSetting(guildId, `jail_roles_${userId}`);
    const rolesToRestore = rolesJson ? JSON.parse(rolesJson) : [];

    if (rolesToRestore.length > 0) {
      await member.roles.set([...rolesToRestore, member.guild.id], `Released from jail: ${reason}`);
    } else {
      await member.roles.remove(jailRole, `Released from jail: ${reason}`);
    }

    stateManager.setGuildSetting(guildId, `jail_roles_${userId}`, '');

    await runModAction(guildId, userId, message.author.id, 'unjail', reason, {}, message.guild);
    await message.channel.send(getSuccessResponse(guildId));
  } catch (error) {
    await message.channel.send('nuuu');
  }
}

async function handleSlashCommand(interaction) {
  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'release') {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'Released from jail';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: 'User not found.', ephemeral: true });
      return;
    }

    const jailRole = await getJailRole(interaction.guild);
    if (!jailRole || !member.roles.cache.has(jailRole.id)) {
      await interaction.reply({ content: 'That user is not jailed.', ephemeral: true });
      return;
    }

    try {
      const rolesJson = stateManager.getGuildSetting(interaction.guildId, `jail_roles_${user.id}`);
      const rolesToRestore = rolesJson ? JSON.parse(rolesJson) : [];
      if (rolesToRestore.length > 0) {
        await member.roles.set([...rolesToRestore, interaction.guild.id], `Released from jail: ${reason}`);
      } else {
        await member.roles.remove(jailRole, `Released from jail: ${reason}`);
      }
      stateManager.setGuildSetting(interaction.guildId, `jail_roles_${user.id}`, '');
      await runModAction(interaction.guildId, user.id, interaction.user.id, 'unjail', reason, {}, interaction.guild);
      await interaction.reply(getSuccessResponse(guildId));
    } catch (error) {
      await interaction.reply({ content: `Failed: ${error.message}`, ephemeral: true });
    }
    return;
  }

  const user = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason') || 'No reason provided.';
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: 'User not found.', ephemeral: true });
    return;
  }
  const hierarchy = checkHierarchy(interaction.member, member);
  if (!hierarchy.allowed) {
    await interaction.reply({ content: hierarchy.message, ephemeral: true });
    return;
  }

  const jailRole = await getJailRole(interaction.guild);
  if (!jailRole) {
    await interaction.reply({ content: 'Jail role not set up. Use `/jail setup` first.', ephemeral: true });
    return;
  }

  try {
    await interaction.deferReply();
    const rolesToRestore = member.roles.cache
      .filter((r) => r.id !== interaction.guild.id && !r.managed)
      .map((r) => r.id);
    await member.roles.set([jailRole.id], `Jailed: ${reason}`);
    stateManager.setGuildSetting(interaction.guildId, `jail_roles_${user.id}`, JSON.stringify(rolesToRestore));
    await sendModerationDM(user.id, 'jail', reason, interaction.guildId);
    await runModAction(interaction.guildId, user.id, interaction.user.id, 'jail', reason, {}, interaction.guild);
    await interaction.editReply(getSuccessResponse(guildId));
  } catch (error) {
    await interaction.editReply('nuuu');
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
