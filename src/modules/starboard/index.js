import { SlashCommandBuilder } from 'discord.js';
import logger from '../../core/logger.js';

const starboardSlashCommand = new SlashCommandBuilder()
  .setName('starboard')
  .setDescription('Configure starboard')
  .addSubcommand((sub) =>
    sub.setName('toggle')
      .setDescription('Enable or disable')
      .addStringOption((opt) =>
        opt.setName('state').setDescription('on or off').setRequired(true)
          .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' })))
  .addSubcommand((sub) =>
    sub.setName('channel')
      .setDescription('Set the starboard channel')
      .addChannelOption((opt) => opt.setName('channel').setDescription('Channel').setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('threshold')
      .setDescription('Set reaction threshold')
      .addIntegerOption((opt) => opt.setName('count').setDescription('Stars needed').setRequired(true).setMinValue(1).setMaxValue(100)))
  .addSubcommand((sub) =>
    sub.setName('emoji')
      .setDescription('Set star emoji')
      .addStringOption((opt) => opt.setName('emoji').setDescription('Emoji').setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('show')
      .setDescription('Show current config'));

export default {
  name: 'starboard',
  version: '1.0.0',
  requires: [],
  permissionNodes: {
    'starboard.manage': { description: 'Manage starboard', group: 'engagement' }
  },
  prefixCommands: [
    { command: 'starboard', handler: './handler.js', permission: 'starboard.manage' }
  ],
  slashCommands: [
    { name: 'starboard', handler: './handler.js', data: starboardSlashCommand }
  ],
  components: { buttons: [], selectMenus: [], modals: [] },
  stateTables: ['starboard_config', 'starboard_messages'],
  onLoad: async (core) => {
    const mod = await import('./handler.js');
    core.client.on('messageReactionAdd', (reaction, user) => {
      mod.handleReactionAdd(reaction, user);
    });
    core.client.on('messageReactionRemove', (reaction, user) => {
      mod.handleReactionRemove(reaction, user);
    });
    logger.info('Starboard reaction handlers registered');
  },
  onReady: async (core) => {}
};
