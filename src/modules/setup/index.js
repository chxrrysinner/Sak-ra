import { SlashCommandBuilder } from 'discord.js';
import logger from '../../core/logger.js';

const setupSlashCommand = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Start the Hallows setup wizard');

export default {
  name: 'setup',
  version: '1.0.0',
  requires: [],
  permissionNodes: {},
  prefixCommands: [
    { command: 'setup', handler: './wizard.js', permission: null }
  ],
  slashCommands: [
    { name: 'setup', handler: './wizard.js', data: setupSlashCommand }
  ],
  components: {
    buttons: ['setup:'],
    selectMenus: ['setup:sel:'],
    modals: ['setup_modal:']
  },
  stateTables: [],
  onLoad: async (core) => {
    const mod = await import('./wizard.js');

    core.client.on('interactionCreate', (interaction) => {
      if (interaction.isButton() && interaction.customId.startsWith('setup:')) {
        mod.handleWizardButton(interaction);
      } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('setup:sel:')) {
        mod.handleWizardSelect(interaction);
      } else if (interaction.isModalSubmit() && interaction.customId.startsWith('setup_modal')) {
        mod.handleWizardModal(interaction);
      }
    });
    logger.info('Setup wizard handler registered');
  },
  onReady: async () => {
    logger.info('Setup wizard ready — use `?setup` or `/setup` to start');
  }
};
