import { SlashCommandBuilder } from 'discord.js';
import { getPrefix } from '../../core/prefix.js';

const hierarchySlashCommand = new SlashCommandBuilder()
  .setName('hierarchy')
  .setDescription('Manage server hierarchy and wings')
  .addSubcommand((sub) =>
    sub.setName('view').setDescription('Show current hierarchy'))
  .addSubcommand((sub) =>
    sub.setName('wing')
      .setDescription('Manage wings')
      .addStringOption((opt) => opt.setName('action').setDescription('add/rename/remove/reorder').setRequired(true))
      .addStringOption((opt) => opt.setName('id').setDescription('Wing ID'))
      .addStringOption((opt) => opt.setName('label').setDescription('Display label')));

const prefixSlashCommand = new SlashCommandBuilder()
  .setName('prefix')
  .setDescription('View or change the command prefix')
  .addStringOption((opt) =>
    opt.setName('value').setDescription('New prefix (1-3 chars)').setRequired(false));

export default {
  name: 'admin',
  version: '1.0.0',
  requires: [],
  permissionNodes: {
    'admin.hierarchy': { description: 'Manage wings and hierarchy', group: 'admin' },
    'admin.prefix': { description: 'Change command prefix', group: 'admin' }
  },
  prefixCommands: [
    { command: 'prefix', handler: './prefix.js', permission: 'admin.prefix' },
    { command: 'hierarchy', handler: './hierarchy.js', permission: 'admin.hierarchy' }
  ],
  slashCommands: [
    { name: 'hierarchy', handler: './hierarchy.js', data: hierarchySlashCommand },
    { name: 'prefix', handler: './prefix.js', data: prefixSlashCommand }
  ],
  components: {
    buttons: [],
    selectMenus: [],
    modals: []
  },
  stateTables: ['guild_config', 'wings', 'wing_roles'],
  onLoad: async (core) => {},
  onReady: async (core) => {}
};
