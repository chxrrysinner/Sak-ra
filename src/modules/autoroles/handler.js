import stateManager from '../../core/state.js';
import logger from '../../core/logger.js';
import { EmbedBuilder } from 'discord.js';
import { getPrefix } from '../../core/prefix.js';

async function handleGuildMemberAdd(member) {
  if (member.user.bot) return;
  const roleIds = stateManager.getAutoroles(member.guild.id);
  if (!roleIds.length) return;

  for (const roleId of roleIds) {
    try {
      if (member.roles.cache.has(roleId)) continue;
      await member.roles.add(roleId, 'Auto-role on join');
    } catch (error) {
      logger.warn({ guildId: member.guild.id, userId: member.id, roleId, error: error.message }, 'Failed to assign autorole');
    }
  }
}

async function handlePrefixCommand(message, args, guildId) {
  if (!guildId) {
    await message.reply('This command can only be used in a server.');
    return;
  }

  const parts = args.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();

  switch (subcommand) {
    case 'add':
      return handleAdd(message, guildId, parts.slice(1));
    case 'remove':
      return handleRemove(message, guildId, parts.slice(1));
    case 'list':
      return handleList(message, guildId);
    default:
      const prefix = getPrefix(guildId);
      await message.reply(
        `Auto-role management:\n` +
        `\`${prefix}autorole add <@role>\`\n` +
        `\`${prefix}autorole remove <@role>\`\n` +
        `\`${prefix}autorole list\``
      );
  }
}

async function handleAdd(message, guildId, args) {
  const roleMention = args[0];
  const roleId = roleMention?.replace(/[<@&>]/g, '');
  if (!roleId) {
    await message.reply('Usage: `autorole add <@role>`');
    return;
  }
  stateManager.addAutorole(guildId, roleId);
  await message.reply(`<@&${roleId}> will be assigned on join.`);
}

async function handleRemove(message, guildId, args) {
  const roleMention = args[0];
  const roleId = roleMention?.replace(/[<@&>]/g, '');
  if (!roleId) {
    await message.reply('Usage: `autorole remove <@role>`');
    return;
  }
  stateManager.removeAutorole(guildId, roleId);
  await message.reply(`<@&${roleId}> removed from auto-assign.`);
}

async function handleList(message, guildId) {
  const roleIds = stateManager.getAutoroles(guildId);
  if (!roleIds.length) {
    await message.reply('No auto-roles configured.');
    return;
  }
  const lines = roleIds.map((id) => `<@&${id}>`);
  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Auto-Roles')
    .setDescription(lines.join('\n'))
    .setTimestamp();
  await message.reply({ embeds: [embed] });
}

async function handleSlashCommand(interaction) {
  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'add': {
      const role = interaction.options.getRole('role', true);
      stateManager.addAutorole(guildId, role.id);
      await interaction.reply({ content: `${role} will be assigned on join.`, ephemeral: true });
      break;
    }
    case 'remove': {
      const role = interaction.options.getRole('role', true);
      stateManager.removeAutorole(guildId, role.id);
      await interaction.reply({ content: `${role} removed from auto-assign.`, ephemeral: true });
      break;
    }
    case 'list': {
      const roleIds = stateManager.getAutoroles(guildId);
      if (!roleIds.length) {
        await interaction.reply({ content: 'No auto-roles configured.', ephemeral: true });
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(0xc67a3a)
        .setTitle('Auto-Roles')
        .setDescription(roleIds.map((id) => `<@&${id}>`).join('\n'))
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

export { handlePrefixCommand, handleSlashCommand, handleGuildMemberAdd };
export default handlePrefixCommand;
