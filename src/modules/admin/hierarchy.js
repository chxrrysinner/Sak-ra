import stateManager from '../../core/state.js';
import { EmbedBuilder } from 'discord.js';
import { resolveWings, resolveWingOrder } from '../../core/permissions.js';
import { getPrefix } from '../../core/prefix.js';

async function handleHierarchyCommand(message, args, guildId) {
  if (!guildId) {
    await message.reply('This command can only be used in a server.');
    return;
  }

  const parts = args.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();

  if (!subcommand || subcommand === 'view') {
    await showHierarchy(message, guildId);
    return;
  }

  switch (subcommand) {
    case 'wing':
      await handleWingSubcommand(message, guildId, parts.slice(1));
      break;
    case 'role':
      await handleRoleSubcommand(message, guildId, parts.slice(1));
      break;
    default:
      const prefix = getPrefix(guildId);
      await message.reply(
        `Wing management:\n` +
        `\`${prefix}hierarchy view\` — show current wings\n` +
        `\`${prefix}hierarchy wing add <id> <label>\` — add a wing\n` +
        `\`${prefix}hierarchy wing rename <id> <label>\` — rename\n` +
        `\`${prefix}hierarchy wing remove <id>\` — delete\n` +
        `\`${prefix}hierarchy wing reorder <id1> <id2> ...\` — reorder\n` +
        `\`${prefix}hierarchy role add <wing> <@role> <rank>\` — add role\n` +
        `\`${prefix}hierarchy role remove <wing> <@role>\` — remove\n` +
        `\`${prefix}hierarchy role lead <wing> <@role>\` — set lead\n` +
        `\`${prefix}hierarchy role category <wing> <@role>\` — set category`
      );
  }
}

async function showHierarchy(message, guildId) {
  const wingOrder = resolveWingOrder(guildId);
  const wings = resolveWings(guildId);

  const lines = [];
  for (const wingId of wingOrder) {
    const wing = wings[wingId];
    if (!wing) continue;
    lines.push(`**${wing.label || wingId}** (\`${wingId}\`)`);
    const roles = stateManager.getWingRoles(guildId, wingId);
    if (roles.length) {
      for (const role of roles) {
        const tags = [];
        if (role.is_lead) tags.push('lead');
        if (role.is_internal) tags.push('internal');
        if (role.is_category) tags.push('category');
        const tagStr = tags.length ? ` *(${tags.join(', ')})*` : '';
        lines.push(`  <@&${role.role_id}> — rank ${role.rank}${tagStr}`);
      }
    } else {
      lines.push('  *No roles configured*');
    }
    lines.push('');
  }

  if (!lines.length) {
    lines.push('*No wings configured. Use default wings from role-policy.json*');
  }

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Wing Hierarchy')
    .setDescription(lines.slice(0, 20).join('\n'))
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleWingSubcommand(message, guildId, args) {
  const action = args[0]?.toLowerCase();

  switch (action) {
    case 'add': {
      const id = args[1]?.toLowerCase();
      const label = args.slice(2).join(' ');
      if (!id || !label) {
        await message.reply('Usage: `hierarchy wing add <id> <label>`\nExample: `hierarchy wing add support "Support Team"`');
        return;
      }
      if (stateManager.getWing(guildId, id)) {
        await message.reply(`Wing \`${id}\` already exists.`);
        return;
      }
      stateManager.createWing(guildId, id, label, id, '');
      await message.reply(`Wing \`${id}\` (${label}) created.`);
      break;
    }
    case 'rename': {
      const id = args[1]?.toLowerCase();
      const label = args.slice(2).join(' ');
      if (!id || !label) {
        await message.reply('Usage: `hierarchy wing rename <id> <label>`');
        return;
      }
      stateManager.updateWing(guildId, id, { label });
      await message.reply(`Wing \`${id}\` renamed to **${label}**.`);
      break;
    }
    case 'remove':
    case 'delete': {
      const id = args[1]?.toLowerCase();
      if (!id) {
        await message.reply('Usage: `hierarchy wing remove <id>`');
        return;
      }
      stateManager.deleteWing(guildId, id);
      await message.reply(`Wing \`${id}\` removed.`);
      break;
    }
    case 'reorder': {
      const order = args.slice(1).map((a) => a.toLowerCase());
      if (order.length < 2) {
        await message.reply('Usage: `hierarchy wing reorder <id1> <id2> ...`\nExample: `hierarchy wing reorder internals hr moderation partnership assistants`');
        return;
      }
      stateManager.reorderWings(guildId, order);
      await message.reply('Wing order updated.');
      break;
    }
    default:
      await message.reply('Wing subcommands: `add`, `rename`, `remove`, `reorder`');
  }
}

async function handleRoleSubcommand(message, guildId, args) {
  const action = args[0]?.toLowerCase();
  const wingId = args[1]?.toLowerCase();
  const roleMention = args[2];
  const roleId = roleMention?.replace(/[<@&>]/g, '') || null;
  const rank = args[3] || '1';
  const label = args.slice(4).join(' ') || null;

  if (!wingId || !roleId && action !== 'list') {
    await message.reply('Usage: `hierarchy role <add|remove|lead|category> <wing> <@role> [rank]`');
    return;
  }

  switch (action) {
    case 'add':
      stateManager.addWingRole(guildId, wingId, roleId, rank, { label });
      await message.reply(`<@&${roleId}> added to **${wingId}** at rank ${rank}.`);
      break;

    case 'remove':
      stateManager.removeWingRole(guildId, wingId, roleId);
      await message.reply(`<@&${roleId}> removed from **${wingId}**.`);
      break;

    case 'lead':
      stateManager.addWingRole(guildId, wingId, roleId, 'M', { isLead: true, label: label || 'Lead' });
      await message.reply(`<@&${roleId}> set as lead of **${wingId}**.`);
      break;

    case 'category':
      stateManager.addWingRole(guildId, wingId, roleId, '0', { isCategory: true, label: label || 'Category' });
      await message.reply(`<@&${roleId}> set as category role for **${wingId}**.`);
      break;

    default:
      await message.reply('Role subcommands: `add`, `remove`, `lead`, `category`');
  }
}

export { handleHierarchyCommand };
export default handleHierarchyCommand;
