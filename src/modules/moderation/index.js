import { SlashCommandBuilder } from 'discord.js';
import logger from '../../core/logger.js';

const modlogSlashCommand = new SlashCommandBuilder()
  .setName('modlog')
  .setDescription('Moderation log management')
  .addSubcommand((sub) =>
    sub.setName('setchannel')
      .setDescription('Set the modlog channel')
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('Channel for mod logs').setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('case')
      .setDescription('View a mod case')
      .addIntegerOption((opt) =>
        opt.setName('id').setDescription('Case ID').setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('history')
      .setDescription('View moderation history for a user')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('User to check').setRequired(true)));

const banSlashCommand = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a member')
  .addUserOption((opt) => opt.setName('user').setDescription('User to ban').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Ban reason').setRequired(false))
  .addIntegerOption((opt) => opt.setName('days').setDescription('Days of messages to delete (0-7)').setRequired(false));

const kickSlashCommand = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a member')
  .addUserOption((opt) => opt.setName('user').setDescription('User to kick').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Kick reason').setRequired(false));

const warnSlashCommand = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Warn a member')
  .addUserOption((opt) => opt.setName('user').setDescription('User to warn').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Warning reason').setRequired(true));

const muteSlashCommand = new SlashCommandBuilder()
  .setName('mute')
  .setDescription('Timeout/mute a member')
  .addUserOption((opt) => opt.setName('user').setDescription('User to mute').setRequired(true))
  .addStringOption((opt) => opt.setName('duration').setDescription('Duration (e.g. 10m, 1h, 1d)').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Mute reason').setRequired(false));

const unmuteSlashCommand = new SlashCommandBuilder()
  .setName('unmute')
  .setDescription('Remove timeout from a member')
  .addUserOption((opt) => opt.setName('user').setDescription('User to unmute').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(false));

const unbanSlashCommand = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Unban a user by ID')
  .addStringOption((opt) => opt.setName('user_id').setDescription('User ID to unban').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(false));

const unwarnSlashCommand = new SlashCommandBuilder()
  .setName('unwarn')
  .setDescription('Remove a warning from a user\'s record')
  .addIntegerOption((opt) => opt.setName('case_id').setDescription('Case ID of the warning').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Reason for removing').setRequired(false));

const purgeSlashCommand = new SlashCommandBuilder()
  .setName('purge')
  .setDescription('Bulk delete messages')
  .addIntegerOption((opt) => opt.setName('count').setDescription('Number of messages (1-100)').setRequired(true))
  .addUserOption((opt) => opt.setName('user').setDescription('Only delete from this user').setRequired(false));

const slowmodeSlashCommand = new SlashCommandBuilder()
  .setName('slowmode')
  .setDescription('Set slowmode in a channel')
  .addIntegerOption((opt) => opt.setName('seconds').setDescription('Slowmode in seconds (0-21600)').setRequired(true))
  .addChannelOption((opt) => opt.setName('channel').setDescription('Channel (defaults to current)').setRequired(false));

const lockdownSlashCommand = new SlashCommandBuilder()
  .setName('lockdown')
  .setDescription('Lock or unlock a channel')
  .addStringOption((opt) =>
    opt.setName('action').setDescription('lock or unlock').setRequired(true)
      .addChoices({ name: 'Lock', value: 'lock' }, { name: 'Unlock', value: 'unlock' }))
  .addChannelOption((opt) => opt.setName('channel').setDescription('Channel (defaults to current)').setRequired(false));

const tempbanSlashCommand = new SlashCommandBuilder()
  .setName('tempban')
  .setDescription('Temporarily ban a member')
  .addUserOption((opt) => opt.setName('user').setDescription('User to ban').setRequired(true))
  .addStringOption((opt) => opt.setName('duration').setDescription('Duration (e.g. 1h, 1d, 7d)').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Ban reason').setRequired(false));

const softbanSlashCommand = new SlashCommandBuilder()
  .setName('softban')
  .setDescription('Ban and immediately unban to clear messages')
  .addUserOption((opt) => opt.setName('user').setDescription('User to softban').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(false));

const hardbanSlashCommand = new SlashCommandBuilder()
  .setName('hardban')
  .setDescription('Permanently ban a member without DM')
  .addUserOption((opt) => opt.setName('user').setDescription('User to ban').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Ban reason').setRequired(false));

const jailSlashCommand = new SlashCommandBuilder()
  .setName('jail')
  .setDescription('Jail management')
  .addSubcommand((sub) =>
    sub.setName('add')
      .setDescription('Jail a member')
      .addUserOption((opt) => opt.setName('user').setDescription('User to jail').setRequired(true))
      .addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(false)))
  .addSubcommand((sub) =>
    sub.setName('release')
      .setDescription('Release a member from jail')
      .addUserOption((opt) => opt.setName('user').setDescription('User to release').setRequired(true))
      .addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(false)))
  .addSubcommand((sub) =>
    sub.setName('config')
      .setDescription('View or set jail configuration'));

const stripstaffSlashCommand = new SlashCommandBuilder()
  .setName('stripstaff')
  .setDescription('Remove all staff roles from a member')
  .addUserOption((opt) => opt.setName('user').setDescription('User to strip').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(false));

export default {
  name: 'moderation',
  version: '2.0.0',
  requires: [],
  permissionNodes: {
    'moderation.ban': { description: 'Ban members', group: 'moderation' },
    'moderation.kick': { description: 'Kick members', group: 'moderation' },
    'moderation.mute': { description: 'Mute/timeout members', group: 'moderation' },
    'moderation.warn': { description: 'Warn members', group: 'moderation' },
    'moderation.purge': { description: 'Bulk delete messages', group: 'moderation' },
    'moderation.jail': { description: 'Jail/release members', group: 'moderation' },
    'moderation.stripstaff': { description: 'Strip staff roles', group: 'moderation' },
    'moderation.modlog': { description: 'View modlog/history', group: 'moderation' },
    'moderation.setup': { description: 'Configure moderation settings', group: 'moderation' }
  },
  prefixCommands: [
    { command: 'ban', handler: './ban.js', requiredFakePermission: 'banMembers' },
    { command: 'tempban', handler: './tempban.js', requiredFakePermission: 'banMembers' },
    { command: 'softban', handler: './softban.js', requiredFakePermission: 'banMembers' },
    { command: 'hardban', handler: './hardban.js', requiredFakePermission: 'banMembers' },
    { command: 'kick', handler: './kick.js', requiredFakePermission: 'kickMembers' },
    { command: 'warn', handler: './warn.js', requiredFakePermission: 'moderateMembers' },
    { command: 'mute', handler: './mute.js', requiredFakePermission: 'muteMembers' },
    { command: 'unmute', handler: './mute.js', requiredFakePermission: 'muteMembers' },
    { command: 'purge', handler: './purge.js', requiredFakePermission: 'manageMessages' },
    { command: 'slowmode', handler: './slowmode.js', requiredFakePermission: 'manageChannels' },
    { command: 'lockdown', handler: './lockdown.js', requiredFakePermission: 'manageGuild' },
    { command: 'modlog', handler: './modlog.js', requiredFakePermission: 'viewAuditLog' },
    { command: 'case', handler: './case.js', requiredFakePermission: 'viewAuditLog' },
    { command: 'jail', handler: './jail.js', requiredFakePermission: 'moderateMembers' },
    { command: 'unjail', handler: './jail.js', requiredFakePermission: 'moderateMembers' },
    { command: 'setupjail', handler: './setupjail.js', requiredFakePermission: 'administrator' },
    { command: 'unban', handler: './unban.js', requiredFakePermission: 'banMembers' },
    { command: 'unwarn', handler: './unwarn.js', requiredFakePermission: 'moderateMembers' },
    { command: 'stripstaff', handler: './stripstaff.js', requiredFakePermission: 'administrator' },
    { command: 'restorestaff', handler: './restorestaff.js', requiredFakePermission: 'administrator' }
  ],
  slashCommands: [
    { name: 'ban', handler: './ban.js', data: banSlashCommand },
    { name: 'tempban', handler: './tempban.js', data: tempbanSlashCommand },
    { name: 'softban', handler: './softban.js', data: softbanSlashCommand },
    { name: 'hardban', handler: './hardban.js', data: hardbanSlashCommand },
    { name: 'kick', handler: './kick.js', data: kickSlashCommand },
    { name: 'warn', handler: './warn.js', data: warnSlashCommand },
    { name: 'mute', handler: './mute.js', data: muteSlashCommand },
    { name: 'unmute', handler: './mute.js', data: unmuteSlashCommand },
    { name: 'purge', handler: './purge.js', data: purgeSlashCommand },
    { name: 'slowmode', handler: './slowmode.js', data: slowmodeSlashCommand },
    { name: 'lockdown', handler: './lockdown.js', data: lockdownSlashCommand },
    { name: 'modlog', handler: './modlog.js', data: modlogSlashCommand },
    { name: 'case', handler: './case.js', data: new SlashCommandBuilder().setName('case').setDescription('Look up a moderation case')
      .addStringOption((opt) => opt.setName('query').setDescription('Case number, username, or user ID').setRequired(true)) },
    { name: 'jail', handler: './jail.js', data: jailSlashCommand },
    { name: 'unban', handler: './unban.js', data: unbanSlashCommand },
    { name: 'unwarn', handler: './unwarn.js', data: unwarnSlashCommand },
    { name: 'stripstaff', handler: './stripstaff.js', data: stripstaffSlashCommand },
    { name: 'restorestaff', handler: './restorestaff.js', data: new SlashCommandBuilder()
      .setName('restorestaff')
      .setDescription('Restore previously stripped staff roles to a member')
      .addUserOption((opt) => opt.setName('user').setDescription('User to restore').setRequired(true))
      .addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(false))
    },
    { name: 'setupjail', handler: './setupjail.js', data: new SlashCommandBuilder()
      .setName('setupjail')
      .setDescription('Set up the jail role and channel, then configure all channel permissions')
      .addChannelOption((opt) => opt.setName('channel').setDescription('Jail channel (defaults to current)').setRequired(false))
    }
  ],
  components: { buttons: [], selectMenus: [], modals: [] },
  stateTables: ['mod_cases', 'tempbans'],
  onLoad: async (core) => {
    const mod = await import('./shared.js');
    core.client.on('messageCreate', (message) => {
      mod.handleEvidenceCollection(message);
    });
    logger.info('Moderation evidence listener registered');
  },
  onReady: async (core) => {
    const { restoreTempbans } = await import('./tempban.js');
    if (typeof restoreTempbans === 'function') {
      await restoreTempbans(core);
    }
  }
};
