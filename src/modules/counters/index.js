import { SlashCommandBuilder } from 'discord.js';
import logger from '../../core/logger.js';

const countersSlashCommand = new SlashCommandBuilder()
  .setName('counters')
  .setDescription('Manage voice channel counters')
  .addSubcommand((sub) =>
    sub.setName('create')
      .setDescription('Create a counter')
      .addStringOption((opt) =>
        opt.setName('type').setDescription('Counter type').setRequired(true)
          .addChoices(
            { name: 'Member Count', value: 'members' },
            { name: 'Bot Count', value: 'bots' },
            { name: 'Total Users', value: 'total' },
            { name: 'Channel Count', value: 'channels' },
            { name: 'Role Count', value: 'roles' },
            { name: 'Boost Count', value: 'boosts' },
            { name: 'Boost Tier', value: 'boost_tier' }))
      .addStringOption((opt) => opt.setName('name').setDescription('Voice channel name (use {count} as placeholder)').setRequired(false)))
  .addSubcommand((sub) =>
    sub.setName('delete')
      .setDescription('Delete a counter')
      .addChannelOption((opt) => opt.setName('channel').setDescription('Counter voice channel').setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('list')
      .setDescription('List all counters'));

export default {
  name: 'counters',
  version: '1.0.0',
  requires: [],
  permissionNodes: {
    'counters.manage': { description: 'Manage counters', group: 'engagement' }
  },
  prefixCommands: [
    { command: 'counters', handler: './handler.js', permission: 'counters.manage' }
  ],
  slashCommands: [
    { name: 'counters', handler: './handler.js', data: countersSlashCommand }
  ],
  components: { buttons: [], selectMenus: [], modals: [] },
  stateTables: ['counters'],
  onLoad: async (core) => {
    const mod = await import('./handler.js');
    mod.restoreCounters(core);
    logger.info('Counter handler registered');
  },
  onReady: async (core) => {}
};
