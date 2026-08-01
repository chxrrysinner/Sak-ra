import { SlashCommandBuilder } from 'discord.js';
import logger from '../../core/logger.js';

const giveawaySlashCommand = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Manage giveaways')
  .addSubcommand((sub) =>
    sub.setName('start')
      .setDescription('Start a giveaway')
      .addStringOption((opt) => opt.setName('prize').setDescription('Prize name').setRequired(true))
      .addStringOption((opt) => opt.setName('duration').setDescription('Duration (e.g. 1h, 1d, 30m)').setRequired(true))
      .addIntegerOption((opt) => opt.setName('winners').setDescription('Number of winners').setRequired(false).setMinValue(1).setMaxValue(50))
      .addStringOption((opt) => opt.setName('description').setDescription('Description').setRequired(false)))
  .addSubcommand((sub) =>
    sub.setName('end')
      .setDescription('End a giveaway early')
      .addStringOption((opt) => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('reroll')
      .setDescription('Reroll a giveaway')
      .addStringOption((opt) => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true)));

export default {
  name: 'giveaways',
  version: '1.0.0',
  requires: [],
  permissionNodes: {
    'giveaways.manage': { description: 'Manage giveaways', group: 'engagement' }
  },
  prefixCommands: [
    { command: 'giveaway', handler: './handler.js', permission: 'giveaways.manage' }
  ],
  slashCommands: [
    { name: 'giveaway', handler: './handler.js', data: giveawaySlashCommand }
  ],
  components: {
    buttons: ['giveaway_enter'],
    selectMenus: [],
    modals: []
  },
  stateTables: ['giveaways', 'giveaway_entries'],
  onLoad: async (core) => {
    const mod = await import('./handler.js');
    mod.restoreGiveawayTimers(core);
    core.client.on('interactionCreate', (interaction) => {
      if (interaction.isButton() && interaction.customId === 'giveaway_enter') {
        mod.handleGiveawayButton(interaction);
      }
    });
    logger.info('Giveaway handler registered');
  },
  onReady: async (core) => {}
};
