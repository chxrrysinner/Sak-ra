import { SlashCommandBuilder } from 'discord.js';
import logger from '../../core/logger.js';

const autoroleSlashCommand = new SlashCommandBuilder()
  .setName('autorole')
  .setDescription('Manage auto-role assignment')
  .addSubcommand((sub) =>
    sub.setName('add')
      .setDescription('Add a role to auto-assign on join')
      .addRoleOption((opt) => opt.setName('role').setDescription('Role to assign').setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('remove')
      .setDescription('Remove an auto-role')
      .addRoleOption((opt) => opt.setName('role').setDescription('Role to remove').setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('list')
      .setDescription('List all auto-roles'));

export default {
  name: 'autoroles',
  version: '1.0.0',
  requires: [],
  permissionNodes: {
    'autoroles.manage': { description: 'Manage auto-roles', group: 'engagement' }
  },
  prefixCommands: [
    { command: 'autorole', handler: './handler.js', permission: 'autoroles.manage' }
  ],
  slashCommands: [
    { name: 'autorole', handler: './handler.js', data: autoroleSlashCommand }
  ],
  components: { buttons: [], selectMenus: [], modals: [] },
  stateTables: ['autoroles'],
  onLoad: async (core) => {
    const mod = await import('./handler.js');
    core.client.on('guildMemberAdd', (member) => {
      mod.handleGuildMemberAdd(member);
    });
    logger.info('Autorole handler registered');
  },
  onReady: async (core) => {}
};
