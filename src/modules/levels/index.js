import { SlashCommandBuilder } from 'discord.js';
import logger from '../../core/logger.js';

const rankSlashCommand = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('View your rank or another member\'s')
  .addUserOption((opt) => opt.setName('user').setDescription('User to check').setRequired(false));

const leaderboardSlashCommand = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Show the server leaderboard');

const levelconfigSlashCommand = new SlashCommandBuilder()
  .setName('levelconfig')
  .setDescription('Configure leveling system')
  .addSubcommand((sub) =>
    sub.setName('toggle')
      .setDescription('Enable/disable XP')
      .addStringOption((opt) =>
        opt.setName('state').setDescription('on or off').setRequired(true)
          .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' })))
  .addSubcommand((sub) =>
    sub.setName('xp')
      .setDescription('Set XP range per message')
      .addIntegerOption((opt) => opt.setName('min').setDescription('Min XP').setRequired(true).setMinValue(1).setMaxValue(100))
      .addIntegerOption((opt) => opt.setName('max').setDescription('Max XP').setRequired(true).setMinValue(1).setMaxValue(100)))
  .addSubcommand((sub) =>
    sub.setName('cooldown')
      .setDescription('Set cooldown between XP gains (seconds)')
      .addIntegerOption((opt) => opt.setName('seconds').setDescription('Cooldown').setRequired(true).setMinValue(5).setMaxValue(3600)))
  .addSubcommand((sub) =>
    sub.setName('factor')
      .setDescription('Set level scaling factor (higher = slower)')
      .addNumberOption((opt) => opt.setName('value').setDescription('Scaling factor').setRequired(true).setMinValue(1).setMaxValue(10000)))
  .addSubcommand((sub) =>
    sub.setName('announce')
      .setDescription('Toggle level-up announcements')
      .addStringOption((opt) =>
        opt.setName('state').setDescription('on or off').setRequired(true)
          .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' }))
      .addChannelOption((opt) => opt.setName('channel').setDescription('Announcement channel').setRequired(false)))
  .addSubcommand((sub) =>
    sub.setName('reward')
      .setDescription('Add/remove level role rewards')
      .addStringOption((opt) =>
        opt.setName('action').setDescription('add or remove').setRequired(true)
          .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }))
      .addIntegerOption((opt) => opt.setName('level').setDescription('Level').setRequired(true).setMinValue(1).setMaxValue(500))
      .addRoleOption((opt) => opt.setName('role').setDescription('Role (required for add)').setRequired(false)))
  .addSubcommand((sub) =>
    sub.setName('show')
      .setDescription('Show current leveling config'));

export default {
  name: 'levels',
  version: '1.0.0',
  requires: [],
  permissionNodes: {
    'levels.manage': { description: 'Manage leveling config', group: 'engagement' }
  },
  prefixCommands: [
    { command: 'rank', handler: './handler.js' },
    { command: 'leaderboard', handler: './handler.js' },
    { command: 'levelconfig', handler: './handler.js', permission: 'levels.manage' }
  ],
  slashCommands: [
    { name: 'rank', handler: './handler.js', data: rankSlashCommand },
    { name: 'leaderboard', handler: './handler.js', data: leaderboardSlashCommand },
    { name: 'levelconfig', handler: './handler.js', data: levelconfigSlashCommand }
  ],
  components: { buttons: [], selectMenus: [], modals: [] },
  stateTables: ['levels', 'level_config', 'level_rewards'],
  onLoad: async (core) => {
    const mod = await import('./handler.js');
    core.client.on('messageCreate', (message) => {
      mod.handleMessageXp(message);
    });
    logger.info('Level XP handler registered');
  },
  onReady: async (core) => {}
};
