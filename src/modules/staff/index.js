import { SlashCommandBuilder } from 'discord.js';
import { WING_ORDER } from '../../core/permissions.js';

const WING_COMMAND_CHOICES = WING_ORDER.map((wingId) => ({ name: wingId, value: wingId }));

const helpSlashCommand = new SlashCommandBuilder()
  .setName('help')
  .setDescription('List all available Hallows commands.')
  .addStringOption((opt) =>
    opt.setName('command').setDescription('Get help for a specific command').setRequired(false));

const statsSlashCommand = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('View staff activity stats')
  .addStringOption((opt) =>
    opt.setName('user').setDescription('User ID or mention (staff only)').setRequired(false));

const pingCommand = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check whether Hallows is online.');

const stafflistCommand = new SlashCommandBuilder()
  .setName('stafflist')
  .setDescription('List current staff by ticket wing.');

const demoteCommand = new SlashCommandBuilder()
  .setName('demote')
  .setDescription('Demote or remove a staff member.')
  .addUserOption((option) =>
    option.setName('user').setDescription('The staff member to demote.').setRequired(true))
  .addStringOption((option) =>
    option.setName('reason').setDescription('Why this staff member is being demoted or removed.').setRequired(true))
  .addStringOption((option) =>
    option.setName('wing').setDescription('Optional wing to demote from if auto-detection is ambiguous.')
      .setRequired(false).addChoices(...WING_COMMAND_CHOICES));

const promoteCommand = new SlashCommandBuilder()
  .setName('promote')
  .setDescription('Promote a staff member within a wing.')
  .addUserOption((option) =>
    option.setName('user').setDescription('The staff member to promote.').setRequired(true))
  .addStringOption((option) =>
    option.setName('wing').setDescription('The wing this promotion applies to.')
      .setRequired(true).addChoices(...WING_COMMAND_CHOICES));

const makeleadCommand = new SlashCommandBuilder()
  .setName('makelead')
  .setDescription('Assign a staff member to the lead role for a wing.')
  .addUserOption((option) =>
    option.setName('user').setDescription('The staff member to make lead.').setRequired(true))
  .addStringOption((option) =>
    option.setName('wing').setDescription('The wing this lead role applies to.')
      .setRequired(true).addChoices(...WING_COMMAND_CHOICES));

const strikeCommand = new SlashCommandBuilder()
  .setName('strike')
  .setDescription('Give a staff member a strike.')
  .addUserOption((option) =>
    option.setName('user').setDescription('The staff member to strike.').setRequired(true))
  .addStringOption((option) =>
    option.setName('reason').setDescription('Why this staff member is being given a strike.')
      .setMaxLength(1800).setRequired(true));

const strikesCommand = new SlashCommandBuilder()
  .setName('strikes')
  .setDescription('Check your strike count.')
  .addUserOption((option) =>
    option.setName('user').setDescription('The staff member to check. Restricted to approval-command roles.')
      .setRequired(false));

const removestrikeCommand = new SlashCommandBuilder()
  .setName('removestrike')
  .setDescription('Remove one strike from a user.')
  .addUserOption((option) =>
    option.setName('user').setDescription('The user to remove a strike from.').setRequired(true));

const breakCommand = new SlashCommandBuilder()
  .setName('break')
  .setDescription('Request a temporary break from staff duties.');

const endbreakCommand = new SlashCommandBuilder()
  .setName('endbreak')
  .setDescription('End your active staff break early.');

const listbreakCommand = new SlashCommandBuilder()
  .setName('listbreak')
  .setDescription('List all staff members currently on break.');

export default {
  name: 'staff',
  version: '1.0.0',
  requires: [],
  permissionNodes: {
    'staff.breaks.manage': { description: 'Manage and view staff breaks', group: 'staff' },
    'staff.stafflist': { description: 'View staff list', group: 'staff' },
    'staff.breaks.request': { description: 'Request staff breaks', group: 'staff' }
  },
  prefixCommands: [
    { command: 'help', handler: './help.js', permission: null },
    { command: 'st', handler: './stats.js', permission: null },
    { command: 'stafflist', handler: './stafflist.js', permission: null },
    { command: 'promote', handler: './promote.js', permission: null },
    { command: 'demote', handler: './demote.js', permission: null },
    { command: 'makelead', handler: './makelead.js', permission: null },
    { command: 'strike', handler: './strike.js', permission: null },
    { command: 'strikes', handler: './strikes.js', permission: null },
    { command: 'removestrike', handler: './removestrike.js', permission: null },
    { command: 'break', handler: './break.js', permission: null },
    { command: 'endbreak', handler: './endbreak.js', permission: null },
    { command: 'listbreak', handler: './listbreak.js', permission: null },
    { command: 'ping', handler: './ping.js', permission: null }
  ],
  slashCommands: [
    { name: 'stafflist', handler: './stafflist.js', data: stafflistCommand },
    { name: 'promote', handler: './promote.js', data: promoteCommand },
    { name: 'demote', handler: './demote.js', data: demoteCommand },
    { name: 'makelead', handler: './makelead.js', data: makeleadCommand },
    { name: 'strike', handler: './strike.js', data: strikeCommand },
    { name: 'strikes', handler: './strikes.js', data: strikesCommand },
    { name: 'removestrike', handler: './removestrike.js', data: removestrikeCommand },
    { name: 'break', handler: './break.js', data: breakCommand },
    { name: 'endbreak', handler: './endbreak.js', data: endbreakCommand },
    { name: 'listbreak', handler: './listbreak.js', data: listbreakCommand },
    { name: 'help', handler: './help.js', data: helpSlashCommand },
    { name: 'stats', handler: './stats.js', data: statsSlashCommand },
    { name: 'ping', handler: './ping.js', data: pingCommand }
  ],
  componentHandlers: {
    'staff_break_approve': './break.js',
    'staff_break_deny': './break.js',
    'staff_break_request_modal': './break.js',
    'help_select_module': './help.js'
  },
  components: {
    buttons: ['staff_break_approve', 'staff_break_deny'],
    selectMenus: ['help_select_module'],
    modals: ['staff_break_request_modal']
  },
  stateTables: ['strikes', 'staff_breaks', 'staff_activity'],
  onLoad: async (core) => {
    const { staffRoleHierarchyIds, memberHasAnyCachedRole } = await import('../../core/permissions.js');
    const stateManager = core.state;
    core.client.on('messageCreate', (message) => {
      if (message.author.bot || !message.guild) return;
      const member = message.member;
      if (!member) return;
      const roleIds = staffRoleHierarchyIds();
      if (!memberHasAnyCachedRole(member, roleIds)) return;
      const excluded = stateManager.getStatsExcludedChannels(message.guild.id);
      if (excluded.includes(message.channel.id)) return;
      const date = new Date().toISOString().split('T')[0];
      stateManager.incrementStaffActivity(message.guild.id, message.author.id, date, 'message_count');
    });
    core.logger.info('Staff activity tracking registered');
  },
  onReady: async (core) => {
    const { scheduleStaffBreakEnd, endStaffBreak } = await import('./shared.js');
    const brState = globalThis.__HALLOWS_BREAK_STATE__ || {};
    let ended = 0, scheduled = 0;
    for (const [userId, activeBreak] of Object.entries(brState.activeByUserId || {})) {
      if (!activeBreak.endsAt || activeBreak.endsAt <= Date.now()) {
        await endStaffBreak(userId, 'your break has ended.').catch(() => null);
        ended++;
      } else {
        scheduleStaffBreakEnd(userId);
        scheduled++;
      }
    }
    core.logger.info({ active: Object.keys(brState.activeByUserId || {}).length, ended, scheduled }, 'Staff break timers restored');
  }
};
