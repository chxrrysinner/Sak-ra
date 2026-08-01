import { SlashCommandBuilder } from 'discord.js';
import logger from '../../core/logger.js';

const antiraidSlashCommand = new SlashCommandBuilder()
  .setName('antiraid')
  .setDescription('Anti-raid configuration')
  .addSubcommand((sub) =>
    sub.setName('toggle')
      .setDescription('Enable or disable raid detection')
      .addStringOption((opt) =>
        opt.setName('state').setDescription('on or off').setRequired(true)
          .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' })))
  .addSubcommand((sub) =>
    sub.setName('threshold')
      .setDescription('Set join threshold (joins in time window)')
      .addIntegerOption((opt) =>
        opt.setName('count').setDescription('Number of joins').setRequired(true).setMinValue(1).setMaxValue(100)))
  .addSubcommand((sub) =>
    sub.setName('window')
      .setDescription('Set time window in seconds')
      .addIntegerOption((opt) =>
        opt.setName('seconds').setDescription('Time window').setRequired(true).setMinValue(1).setMaxValue(3600)))
  .addSubcommand((sub) =>
    sub.setName('lockout')
      .setDescription('Set auto-lockout duration in minutes')
      .addIntegerOption((opt) =>
        opt.setName('minutes').setDescription('Lockout duration').setRequired(true).setMinValue(1).setMaxValue(1440)))
  .addSubcommand((sub) =>
    sub.setName('whitelist')
      .setDescription('Add or remove a whitelisted role')
      .addStringOption((opt) =>
        opt.setName('action').setDescription('add or remove').setRequired(true)
          .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }))
      .addRoleOption((opt) =>
        opt.setName('role').setDescription('Role').setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('status')
      .setDescription('Show current anti-raid configuration'))
  .addSubcommand((sub) =>
    sub.setName('end')
      .setDescription('End active raid mode manually'));

const raidmodeSlashCommand = new SlashCommandBuilder()
  .setName('raidmode')
  .setDescription('Manually toggle raid mode lockdown')
  .addStringOption((opt) =>
    opt.setName('action').setDescription('on or off').setRequired(true)
      .addChoices({ name: 'On (lockdown)', value: 'on' }, { name: 'Off (unlock)', value: 'off' }));

export default {
  name: 'antiraid',
  version: '1.0.0',
  requires: [],
  permissionNodes: {
    'antiraid.manage': { description: 'Manage anti-raid settings', group: 'security' }
  },
  prefixCommands: [
    { command: 'raid', handler: './handler.js', permission: 'antiraid.manage' },
    { command: 'raidmode', handler: './handler.js', requiredFakePermission: 'administrator' },
    { command: 'antiraid', handler: './handler.js', permission: 'antiraid.manage' }
  ],
  slashCommands: [
    { name: 'antiraid', handler: './handler.js', data: antiraidSlashCommand },
    { name: 'raidmode', handler: './handler.js', data: raidmodeSlashCommand }
  ],
  components: { buttons: [], selectMenus: [], modals: [] },
  stateTables: ['raid_config', 'raid_events'],
  onLoad: async (core) => {
    const mod = await import('./handler.js');
    core.client.on('guildMemberAdd', (member) => {
      mod.handleGuildMemberAdd(member);
    });
    logger.info('Anti-raid event handler registered');
  },
  onReady: async (core) => {}
};
