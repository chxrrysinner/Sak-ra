import { styledEmbed } from '../../core/embeds.js';
import { commandRoleIds, roleIdsFor, departmentFor, memberCanUsePrefixRoles } from '../../core/permissions.js';
import { handleSnippetPreview, handleSavedSnippetCommand } from './handlers.js';
import { userIdForChannel } from './ticket.js';
import { getTicketCommands } from './commands.js';

function tc(key) {
  return getTicketCommands()[key];
}

const SNIPPETS_COMMAND = tc('snippets') || '?s';

function snippetsEmbed() {
  const SNIPPETS = getAllSnippetCommands();
  return styledEmbed('Snippets', SNIPPETS.map((s) => `• ${s.replace(/^\?/, '')}`).join('\n'));
}

function getAllSnippetCommands() {
  const cmds = getTicketCommands();
  const list = [
    cmds.partnershipAd || '?ad',
    cmds.reply || '?r',
    cmds.snippets || '?s',
    `${cmds.timedClose || '?close'} <time>`,
    cmds.reportFinished || '?repfin',
  ];
  const saved = globalThis.__HALLOWS_CONFIG__?.policy?.savedSnippets || {};
  for (const s of Object.values(saved)) {
    if (s.command) list.push(s.command);
  }
  list.push(
    cmds.claim || '?c', cmds.unclaim || '?unclaim',
    cmds.cancelClose || '?cancelclose', cmds.timer || '?timer',
    `${cmds.note || '?note'} <text>`,
    cmds.userInfo || '?id',
    `${cmds.transfer || '?transfer'} <wing>`,
    `${cmds.rename || '?rename'} <name>`,
    `${cmds.priority || '?priority'} <low|normal|high|urgent>`,
    cmds.transcript || '?transcript',
    cmds.claimInfo || '?claiminfo', cmds.closeInfo || '?closeinfo',
    cmds.escalate || '?escalate',
    `${cmds.snippets || '?s'} <command> perms`,
    `${cmds.help || '?h'} <command>`
  );
  return list;
}

function prefixCommandPermissionLookup(commandName) {
  const normalizedName = commandName.replace(/^\?/, '').toLowerCase();
  const cmds = getTicketCommands();
  const policy = globalThis.__HALLOWS_CONFIG__?.policy?.modmailCommandPolicy || {};
  for (const [commandKey, commandPolicy] of Object.entries(policy.prefixCommands || {})) {
    const commandNames = [cmds[commandKey], ...(commandPolicy.aliases || [])].filter(Boolean);
    if (commandNames.some((c) => c.replace(/^\?/, '').toLowerCase() === normalizedName)) {
      return { command: commandNames[0], commandPolicy };
    }
  }
  for (const [snippetKey, commandPolicy] of Object.entries(policy.savedSnippetCommands || {})) {
    const savedSnippets = globalThis.__HALLOWS_CONFIG__?.policy?.savedSnippets || {};
    const command = savedSnippets[snippetKey]?.command;
    if (command && command.replace(/^\?/, '').toLowerCase() === normalizedName) {
      return { command, commandPolicy };
    }
  }
  return null;
}

function snippetPermissionsEmbed(commandName) {
  const lookup = prefixCommandPermissionLookup(commandName);
  if (!lookup) {
    return styledEmbed('Permissions Not Found', `i could not find **${commandName}**. use **${SNIPPETS_COMMAND}** to list available commands.`);
  }
  const { command, commandPolicy } = lookup;
  const lines = [];
  if (commandPolicy.rolePolicyCommand) {
    lines.push(`**Allowed Roles:** ${commandPolicy.rolePolicyCommand}`);
  } else {
    const departmentIds = commandPolicy.allowedBranches || Object.keys(departmentFor());
    for (const deptId of departmentIds) {
      const dept = departmentFor(deptId);
      const ranks = roleIdsFor(deptId, commandPolicy.ticketPermission || 'reply');
      lines.push(`**${dept?.label || deptId}:** ${ranks.length ? ranks.join(', ') : 'none'}`);
    }
  }
  return styledEmbed(`Permissions: ${command.replace(/^\?/, '')}`, lines.join('\n'));
}

export default async function handler(message, args, guildId) {
  const parts = (args || '').trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();
  const rest = parts.slice(1).join(' ');

  const canUse = await memberCanUsePrefixRoles(message.guild.id, message.author.id, commandRoleIds('snippets'));
  if (!canUse) {
    await message.reply({ embeds: [styledEmbed('Snippets Not Available', 'you need a staff hierarchy role to use this command.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  if (!subcommand) {
    await message.reply({ embeds: [snippetsEmbed()], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  if (rest === 'perms' || parts[1] === 'perms') {
    await message.reply({ embeds: [snippetPermissionsEmbed(subcommand)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const userId = userIdForChannel(message.channel.id);
  if (userId) {
    await handleSnippetPreview(message, subcommand, rest, userId);
  }
}

export { snippetsEmbed, snippetPermissionsEmbed };