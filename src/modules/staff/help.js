import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { HALLOWS_ORANGE, styledEmbed } from '../../core/embeds.js';
import { getPrefix } from '../../core/prefix.js';
import registry from '../../core/registry.js';

const HELP_SELECT_ID = 'help_select_module';

const COMMAND_INFO = {
  ban: { description: 'Ban a member from the server', usage: '<@user> [reason]', permission: 'banMembers' },
  tempban: { description: 'Temporarily ban a member', usage: '<@user> <duration> [reason]', permission: 'banMembers' },
  softban: { description: 'Ban and immediately unban to clear messages', usage: '<@user> [reason]', permission: 'banMembers' },
  hardban: { description: 'Permanently ban a member without DM', usage: '<@user> [reason]', permission: 'banMembers' },
  kick: { description: 'Kick a member from the server', usage: '<@user> [reason]', permission: 'kickMembers' },
  warn: { description: 'Warn a member', usage: '<@user> <reason>', permission: 'moderateMembers' },
  mute: { description: 'Timeout a member', usage: '<@user> <duration> [reason]', permission: 'muteMembers' },
  unmute: { description: 'Remove a timeout from a member', usage: '<@user> [reason]', permission: 'muteMembers' },
  purge: { description: 'Bulk delete messages', usage: '<1-100> [@user]', permission: 'manageMessages' },
  slowmode: { description: 'Set slowmode in a channel', usage: '<seconds> [#channel]', permission: 'manageChannels' },
  lockdown: { description: 'Lock or unlock a channel', usage: '<lock|unlock> [#channel]', permission: 'manageGuild' },
  modlog: { description: 'View and manage the moderation log', usage: '<subcommand> [args]', permission: 'viewAuditLog' },
  case: { description: 'Look up a moderation case', usage: '<case number | @user | user ID>', permission: 'viewAuditLog' },
  jail: { description: 'Jail a member', usage: '<@user> [reason]', permission: 'moderateMembers' },
  unjail: { description: 'Release a member from jail', usage: '<@user> [reason]', permission: 'moderateMembers' },
  setupjail: { description: 'Set up the jail role and channel permissions', permission: 'administrator' },
  unban: { description: 'Unban a user by ID', usage: '<user_id> [reason]', permission: 'banMembers' },
  unwarn: { description: 'Remove a warning from a record', usage: '<case ID> [reason]', permission: 'moderateMembers' },
  stripstaff: { description: 'Remove all staff roles from a member', usage: '<@user> [reason]', permission: 'administrator' },
  restorestaff: { description: 'Restore previously stripped staff roles', usage: '<@user> [reason]', permission: 'administrator' },
  reason: { description: "Change a moderation case's reason", usage: '<case ID> <new reason>', permission: 'moderateMembers' },

  help: { description: 'Show this help message', usage: '[command]' },
  st: { description: 'View staff activity stats', usage: '[@user]' },
  stafflist: { description: 'List staff members by wing' },
  promote: { description: 'Promote a staff member within a wing', usage: '<@user> <wing>', permission: 'staff.promote' },
  demote: { description: 'Demote or remove a staff member', usage: '<@user> <reason> [wing]', permission: 'staff.demote' },
  makelead: { description: 'Assign a staff member to the lead role', usage: '<@user> <wing>', permission: 'staff.makelead' },
  strike: { description: 'Give a staff member a strike', usage: '<@user> <reason>', permission: 'staff.strike' },
  strikes: { description: 'Check your or another member strike count', usage: '[@user]' },
  removestrike: { description: 'Remove one strike from a user', usage: '<@user>', permission: 'staff.strike' },
  break: { description: 'Request a temporary break from staff duties' },
  endbreak: { description: 'End your active staff break early' },
  listbreak: { description: 'List all staff members currently on break' },
  ping: { description: 'Check whether the bot is online' },

  db: { description: 'Open the Discord-native dashboard' },
  dashboard: { description: 'Open the Discord-native dashboard' },

  state: { description: 'View, browse, and flush persistent state', usage: 'flush [category] [entry_id]', permission: 'staff.breaks.manage' },
  setup: { description: 'Run the setup wizard to configure the bot' },
  stats: { description: 'View staff activity statistics' },

  prefix: { description: 'View or change the command prefix', usage: '[new prefix]', permission: 'administrator' },
  hierarchy: { description: 'View or manage the staff hierarchy', usage: '<subcommand> [args]', permission: 'administrator' },

  antinuke: { description: 'Configure anti-nuke protection', usage: '<subcommand> [args]' },
  raid: { description: 'Configure anti-raid protection', usage: '<subcommand> [args]' },
  raidmode: { description: 'Toggle raid mode on or off', usage: '<on|off>' },
  antiraid: { description: 'Configure anti-raid join gate settings' },

  pban: { description: 'Start or manage a PBAN vote', usage: '<@user> [reason]', permission: 'security.pban' },
  addproof: { description: 'Add ban proof to a user profile', usage: '<@user> <url>', permission: 'security.addproof' },

  autorole: { description: 'Configure auto-role assignment', usage: '<subcommand> [args]' },
  counters: { description: 'Configure channel counters', usage: '<subcommand> [args]' },
  fakeperms: { description: 'Manage fake permission flags', usage: '<grant|revoke|list> [args]', permission: 'fake-perms.manage' },
  giveaway: { description: 'Manage giveaways', usage: '<subcommand> [args]' },

  rank: { description: 'View your or another member XP rank', usage: '[@user]' },
  leaderboard: { description: 'View the XP leaderboard' },
  levelconfig: { description: 'Configure leveling rewards and settings', usage: '<subcommand> [args]' },

  starboard: { description: 'Configure the starboard', usage: '<subcommand> [args]' }
};

function getCommandDetail(name, prefix) {
  const info = COMMAND_INFO[name];
  if (!info) return null;

  const lines = [info.description || 'No description.'];
  if (info.usage) lines.push('', `**Usage:** \`${prefix}${name} ${info.usage}\``);
  if (info.permission) lines.push(`**Permission:** ${info.permission}`);

  const slashInfo = findSlashCommandInfo(name);
  if (slashInfo) {
    lines.push('', `**Slash:** \`/${slashInfo.name}${slashInfo.options ? ' ' + slashInfo.options : ''}\``);
  }

  return styledEmbed(`Help: ${name}`, lines.join('\n'));
}

function findSlashCommandInfo(name) {
  for (const [cmdName, cmd] of registry.slashCommands) {
    if (cmdName === name) {
      const data = cmd.data;
      const options = data.options?.map(o => o.name).join('> <') || '';
      return { name: data.name, description: data.description, options: options ? `<${options}>` : '' };
    }
  }
  return null;
}

function findPrefixCommand(name) {
  return registry.prefixCommands.get(name.toLowerCase()) || null;
}

function findCommand(name) {
  const cleaned = name.toLowerCase().replace(/^[?!]+/, '');
  const prefixCmd = findPrefixCommand(cleaned);
  const slashCmd = registry.slashCommands.get(cleaned) || null;
  if (prefixCmd || slashCmd) return { name: cleaned, prefix: !!prefixCmd, slash: !!slashCmd };
  return null;
}

function moduleCommandList(mod, prefix) {
  const lines = [];
  for (const pc of (mod.prefixCommands || [])) {
    const cmd = pc.command.startsWith('?') ? pc.command : prefix + pc.command;
    const info = COMMAND_INFO[pc.command.replace(/^[?!]+/, '')];
    const desc = info?.description || '';
    lines.push(`\`${cmd}\` ${desc ? '— ' + desc : ''}`);
  }
  for (const sc of (mod.slashCommands || [])) {
    const info = COMMAND_INFO[sc.name];
    const desc = info?.description || sc.data?.description || '';
    lines.push(`\`/${sc.name}\` ${desc ? '— ' + desc : ''}`);
  }
  return lines;
}

function moduleSelectOptions(modules) {
  return modules
    .filter(m => (m.prefixCommands?.length || 0) + (m.slashCommands?.length || 0) > 0)
    .map(m => ({
      label: m.name.charAt(0).toUpperCase() + m.name.slice(1),
      value: m.name,
      description: `${(m.prefixCommands?.length || 0) + (m.slashCommands?.length || 0)} commands`
    }));
}

function moduleEmbed(mod, prefix) {
  const cmds = moduleCommandList(mod, prefix);
  const cmdCount = cmds.length;
  const label = mod.name.charAt(0).toUpperCase() + mod.name.slice(1);
  return new EmbedBuilder()
    .setColor(HALLOWS_ORANGE)
    .setTitle(`${label} Commands`)
    .setDescription(cmdCount ? cmds.join('\n') : 'No commands registered.')
    .setFooter({ text: `${cmdCount} command${cmdCount === 1 ? '' : 's'}` })
    .setTimestamp();
}

function overviewEmbed(modules, prefix) {
  const total = modules.reduce((sum, m) => sum + (m.prefixCommands?.length || 0) + (m.slashCommands?.length || 0), 0);
  const moduleList = modules
    .filter(m => (m.prefixCommands?.length || 0) + (m.slashCommands?.length || 0) > 0)
    .map(m => {
      const label = m.name.charAt(0).toUpperCase() + m.name.slice(1);
      const count = (m.prefixCommands?.length || 0) + (m.slashCommands?.length || 0);
      return `**${label}** — ${count} command${count === 1 ? '' : 's'}`;
    });

  return new EmbedBuilder()
    .setColor(HALLOWS_ORANGE)
    .setTitle('Hallows Commands')
    .setDescription([
      `Prefix: \`${prefix}\` · \`/command\` for slash`,
      `**${total} commands** across **${modules.length} modules**`,
      '',
      ...moduleList,
      '',
      'Select a module below to browse its commands,',
      `or use \`${prefix}help <command>\` for details on one.`
    ].join('\n'))
    .setTimestamp();
}

async function handleHelpCommand(context, commandName) {
  const isMessage = !!context.author;
  const guildId = isMessage ? context.guild?.id : context.guildId;
  const prefix = getPrefix(guildId);

  const modules = registry.getAll();

  if (commandName) {
    const cmd = findCommand(commandName);
    if (!cmd) {
      const msg = `Command \`${commandName}\` not found. Use \`${prefix}help\` to list all commands.`;
      if (isMessage) await context.reply(msg);
      else await context.reply({ content: msg, ephemeral: true });
      return;
    }

    const embed = getCommandDetail(cmd.name, prefix);
    if (isMessage) await context.reply({ embeds: [embed] });
    else await context.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const embed = overviewEmbed(modules, prefix);
  const selectOptions = moduleSelectOptions(modules);

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(HELP_SELECT_ID)
      .setPlaceholder('select a module...')
      .addOptions(selectOptions)
  );

  if (isMessage) {
    await context.reply({ embeds: [embed], components: [selectRow] });
  } else {
    await context.reply({ embeds: [embed], components: [selectRow], ephemeral: true });
  }
}

async function handlePrefixCommand(message, args, guildId) {
  return handleHelpCommand(message, args || null);
}

async function handleSlashCommand(interaction) {
  const commandName = interaction.options.getString('command') || null;
  return handleHelpCommand(interaction, commandName);
}

export async function handleComponentInteraction(interaction) {
  if (!interaction.isStringSelectMenu() || interaction.customId !== HELP_SELECT_ID) return;

  const moduleName = interaction.values[0];
  const mod = registry.get(moduleName);
  if (!mod) {
    await interaction.update({ content: 'Module not found.', embeds: [], components: [] });
    return;
  }

  const guildId = interaction.guildId;
  const prefix = getPrefix(guildId);
  const embed = moduleEmbed(mod, prefix);

  const modules = registry.getAll();
  const selectOptions = moduleSelectOptions(modules);
  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(HELP_SELECT_ID)
      .setPlaceholder('select a module...')
      .addOptions(selectOptions)
  );

  await interaction.update({ embeds: [embed], components: [selectRow] });
}

export { handlePrefixCommand, handleSlashCommand };
export default handleHelpCommand;
