import { SlashCommandBuilder } from 'discord.js';

const fakepermsSlashCommand = new SlashCommandBuilder()
  .setName('fakeperms')
  .setDescription('Manage fake permissions')
  .addSubcommand((sub) =>
    sub.setName('grant')
      .setDescription('Grant a fake permission flag to a role')
      .addStringOption((opt) =>
        opt.setName('flag').setDescription('Permission flag').setRequired(true))
      .addRoleOption((opt) =>
        opt.setName('role').setDescription('Role to grant the permission to').setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('revoke')
      .setDescription('Revoke a fake permission from a role')
      .addStringOption((opt) =>
        opt.setName('flag').setDescription('Permission flag').setRequired(true))
      .addRoleOption((opt) =>
        opt.setName('role').setDescription('Role to revoke from (omit to revoke all)').setRequired(false)))
  .addSubcommand((sub) =>
    sub.setName('list')
      .setDescription('List all fake permissions for this server')
      .addStringOption((opt) =>
        opt.setName('flag').setDescription('Filter by flag (optional)').setRequired(false)));

export default {
  name: 'fake-perms',
  version: '1.0.0',
  requires: [],
  permissionNodes: {
    'fake-perms.manage': { description: 'Manage fake permissions', group: 'admin' }
  },
  prefixCommands: [
    { command: 'fakeperms', handler: './handler.js', permission: 'fake-perms.manage' }
  ],
  slashCommands: [
    { name: 'fakeperms', handler: './handler.js', data: fakepermsSlashCommand }
  ],
  components: {
    buttons: [],
    selectMenus: [],
    modals: []
  },
  stateTables: ['fake_permissions'],
  onLoad: async (core) => {},
  onReady: async (core) => {}
};
