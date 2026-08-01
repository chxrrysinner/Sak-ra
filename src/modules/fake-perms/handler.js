import stateManager from '../../core/state.js';
import { EmbedBuilder } from 'discord.js';
import { FAKE_PERMISSION_FLAGS } from '../../core/permissions.js';
import { getPrefix } from '../../core/prefix.js';

const FLAG_ALIASES = {};
for (const [key, def] of Object.entries(FAKE_PERMISSION_FLAGS)) {
  FLAG_ALIASES[key] = key;
  FLAG_ALIASES[key.replace(/([A-Z])/g, '_$1').toLowerCase()] = key;
  FLAG_ALIASES[def.label.toLowerCase()] = key;
}

function resolveFlag(input) {
  if (!input) return null;
  const lowered = input.toLowerCase().replace(/[\s_-]+/g, '_');
  return FLAG_ALIASES[lowered] || FLAG_ALIASES[input] || null;
}

function flagLabel(flag) {
  return FAKE_PERMISSION_FLAGS[flag]?.label || flag;
}

async function handlePrefixCommand(message, args, guildId) {
  if (!guildId) {
    await message.reply('This command can only be used in a server.');
    return;
  }

  const parts = args.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();

  switch (subcommand) {
    case 'grant':
      await handleGrant(message, guildId, parts.slice(1));
      break;
    case 'revoke':
      await handleRevoke(message, guildId, parts.slice(1));
      break;
    case 'list':
      await handleList(message, guildId, parts.slice(1));
      break;
    default:
      const prefix = getPrefix(guildId);
      await message.reply(
        `Fake permission management:\n` +
        `\`${prefix}fakeperms grant <flag> <@role>\` — grant a permission to a role\n` +
        `\`${prefix}fakeperms revoke <flag> [@role]\` — revoke from a role\n` +
        `\`${prefix}fakeperms list [flag]\` — list grants`
      );
  }
}

async function handleSlashCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  switch (subcommand) {
    case 'grant': {
      const flag = interaction.options.getString('flag', true);
      const role = interaction.options.getRole('role', true);
      stateManager.grantFakePermission(guildId, flag, role.id);
      await interaction.reply({
        content: `Granted **${flagLabel(flag)}** to ${role}.`,
        ephemeral: true
      });
      break;
    }
    case 'revoke': {
      const flag = interaction.options.getString('flag', true);
      const role = interaction.options.getRole('role');
      if (role) {
        stateManager.revokeFakePermission(guildId, flag, role.id);
        await interaction.reply({
          content: `Revoked **${flagLabel(flag)}** from ${role}.`,
          ephemeral: true
        });
      } else {
        stateManager.revokeAllFakePermissions(guildId, flag);
        await interaction.reply({
          content: `Revoked **${flagLabel(flag)}** from all roles.`,
          ephemeral: true
        });
      }
      break;
    }
    case 'list': {
      const filterFlag = interaction.options.getString('flag');
      const entries = stateManager.getAllFakePermissions(guildId);
      const filtered = filterFlag
        ? entries.filter((e) => e.permission_flag === filterFlag)
        : entries;

      if (!filtered.length) {
        await interaction.reply({
          content: filterFlag
            ? `No roles have **${flagLabel(filterFlag)}**.`
            : 'No fake permissions configured.',
          ephemeral: true
        });
        return;
      }

      const byFlag = {};
      for (const e of filtered) {
        (byFlag[e.permission_flag] ||= []).push(e.role_id);
      }

      const lines = Object.entries(byFlag).map(([flag, roleIds]) =>
        `**${flagLabel(flag)}** (\`${flag}\`) — ${roleIds.map((id) => `<@&${id}>`).join(', ')}`
      );

      const embed = new EmbedBuilder()
        .setColor(0xc67a3a)
        .setTitle('Fake Permissions')
        .setDescription(lines.join('\n'))
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

async function handleGrant(message, guildId, args) {
  const flagInput = args[0];
  const roleMention = args[1];
  if (!flagInput || !roleMention) {
    await message.reply('Usage: `fakeperms grant <flag> <@role>`');
    return;
  }

  const flag = resolveFlag(flagInput);
  if (!flag) {
    const flags = Object.keys(FAKE_PERMISSION_FLAGS).map((k) => `\`${k}\``).join(', ');
    await message.reply(`Unknown flag. Available: ${flags}`);
    return;
  }

  const roleId = roleMention.replace(/[<@&>]/g, '');
  stateManager.grantFakePermission(guildId, flag, roleId);
  await message.reply(`Granted **${flagLabel(flag)}** to <@&${roleId}>.`);
}

async function handleRevoke(message, guildId, args) {
  const flagInput = args[0];
  const roleMention = args[1];

  if (!flagInput) {
    await message.reply('Usage: `fakeperms revoke <flag> [@role]`');
    return;
  }

  const flag = resolveFlag(flagInput);
  if (!flag) {
    await message.reply('Unknown flag.');
    return;
  }

  if (roleMention) {
    const roleId = roleMention.replace(/[<@&>]/g, '');
    stateManager.revokeFakePermission(guildId, flag, roleId);
    await message.reply(`Revoked **${flagLabel(flag)}** from <@&${roleId}>.`);
  } else {
    stateManager.revokeAllFakePermissions(guildId, flag);
    await message.reply(`Revoked **${flagLabel(flag)}** from all roles.`);
  }
}

async function handleList(message, guildId, args) {
  const filterInput = args[0];
  const filterFlag = filterInput ? resolveFlag(filterInput) : null;
  const entries = stateManager.getAllFakePermissions(guildId);
  const filtered = filterFlag
    ? entries.filter((e) => e.permission_flag === filterFlag)
    : entries;

  if (!filtered.length) {
    await message.reply(filterFlag
      ? `No roles have **${flagLabel(filterFlag)}**.`
      : 'No fake permissions configured.');
    return;
  }

  const byFlag = {};
  for (const e of filtered) {
    (byFlag[e.permission_flag] ||= []).push(e.role_id);
  }

  const lines = Object.entries(byFlag).map(([flag, roleIds]) =>
    `**${flagLabel(flag)}** (\`${flag}\`) — ${roleIds.map((id) => `<@&${id}>`).join(', ')}`
  );

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Fake Permissions')
    .setDescription(lines.join('\n'))
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
