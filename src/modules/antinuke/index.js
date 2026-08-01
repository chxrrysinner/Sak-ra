import { SlashCommandBuilder } from 'discord.js';
import logger from '../../core/logger.js';

const antinukeSlashCommand = new SlashCommandBuilder()
  .setName('antinuke')
  .setDescription('Anti-nuke configuration')
  .addSubcommand((sub) =>
    sub.setName('toggle')
      .setDescription('Enable or disable')
      .addStringOption((opt) =>
        opt.setName('state').setDescription('on or off').setRequired(true)
          .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' })))
  .addSubcommand((sub) =>
    sub.setName('threshold')
      .setDescription('Set threshold for an event type')
      .addStringOption((opt) =>
        opt.setName('type').setDescription('Event type').setRequired(true)
          .addChoices(
            { name: 'Channel Delete', value: 'channel_delete' },
            { name: 'Role Delete', value: 'role_delete' },
            { name: 'Ban Add', value: 'ban_add' }))
      .addIntegerOption((opt) =>
        opt.setName('count').setDescription('Max events before trigger').setRequired(true).setMinValue(1).setMaxValue(50)))
  .addSubcommand((sub) =>
    sub.setName('window')
      .setDescription('Set time window in seconds')
      .addIntegerOption((opt) =>
        opt.setName('seconds').setDescription('Time window').setRequired(true).setMinValue(1).setMaxValue(3600)))
  .addSubcommand((sub) =>
    sub.setName('lockout')
      .setDescription('Set auto-unlock duration in minutes')
      .addIntegerOption((opt) =>
        opt.setName('minutes').setDescription('Duration').setRequired(true).setMinValue(1).setMaxValue(1440)))
  .addSubcommand((sub) =>
    sub.setName('action')
      .setDescription('What to do when triggered')
      .addStringOption((opt) =>
        opt.setName('value').setDescription('Action').setRequired(true)
          .addChoices(
            { name: 'Log only', value: 'log' },
            { name: 'Lockdown', value: 'lockdown' },
            { name: 'Lockdown + Rollback', value: 'rollback' })))
  .addSubcommand((sub) =>
    sub.setName('whitelist')
      .setDescription('Add/remove whitelisted role or user')
      .addStringOption((opt) =>
        opt.setName('action').setDescription('add or remove').setRequired(true)
          .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }))
      .addStringOption((opt) =>
        opt.setName('type').setDescription('role or user').setRequired(true)
          .addChoices({ name: 'Role', value: 'role' }, { name: 'User', value: 'user' }))
      .addStringOption((opt) =>
        opt.setName('id').setDescription('Role or user ID').setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('status')
      .setDescription('Show current configuration'));

export default {
  name: 'antinuke',
  version: '1.0.0',
  requires: [],
  permissionNodes: {
    'antinuke.manage': { description: 'Manage anti-nuke settings', group: 'security' }
  },
  prefixCommands: [
    { command: 'antinuke', handler: './handler.js', permission: 'antinuke.manage' }
  ],
  slashCommands: [
    { name: 'antinuke', handler: './handler.js', data: antinukeSlashCommand }
  ],
  components: { buttons: [], selectMenus: [], modals: [] },
  stateTables: ['antinuke_config', 'antinuke_events'],
  onLoad: async (core) => {
    const mod = await import('./handler.js');
    core.client.on('channelDelete', (channel) => {
      mod.handleChannelDelete(channel);
    });
    core.client.on('roleDelete', (role) => {
      mod.handleRoleDelete(role);
    });
    core.client.on('guildBanAdd', (ban) => {
      mod.handleGuildBanAdd(ban);
    });
    logger.info('Anti-nuke event handlers registered');
  },
  onReady: async (core) => {}
};
