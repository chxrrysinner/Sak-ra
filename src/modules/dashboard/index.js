import { SlashCommandBuilder } from 'discord.js';
import logger from '../../core/logger.js';

const dashboardSlashCommand = new SlashCommandBuilder()
  .setName('dashboard')
  .setDescription('Open the Hallows configuration dashboard');

export default {
  name: 'dashboard',
  version: '2.0.0',
  requires: [],
  permissionNodes: {
    'dashboard.view': { description: 'View the web dashboard', group: 'admin' },
    'dashboard.manage': { description: 'Manage all dashboard settings', group: 'admin' }
  },
  prefixCommands: [
    { command: 'dashboard', handler: './handler.js', permission: null },
    { command: 'db', handler: './handler.js', permission: null }
  ],
  slashCommands: [
    { name: 'dashboard', handler: './handler.js', data: dashboardSlashCommand }
  ],
  components: {
    buttons: ['dashboard'],
    selectMenus: [],
    modals: ['dashboard_modal']
  },
  stateTables: ['permission_nodes', 'role_permissions', 'user_permissions', 'channel_overrides', 'audit_log'],
  onLoad: async (core) => {
    logger.info('Dashboard handler registered');
  },
  onReady: async (core) => {
    if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
      logger.warn('Web dashboard disabled: DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET required');
      return;
    }

    try {
      const { default: startServer } = await import('./web/server.js');
      const url = await startServer(core);
      logger.info({ url }, 'Dashboard server started');

      const channelId = process.env.DASHBOARD_NOTIFY_CHANNEL || '1502322911485235323';
      try {
        const channel = await core.client.channels.fetch(channelId);
        if (channel?.isTextBased()) {
          await channel.send({
            embeds: [{
              title: 'Hallows Dashboard Ready',
              description: `The web dashboard is available at: **${url}**\n\nLogin with Discord to configure your server.`,
              color: 0xc67a3a,
              timestamp: new Date()
            }]
          });
        }
      } catch { }
    } catch (error) {
      logger.error({ error: error.message }, 'Dashboard startup failed');
    }
  }
};
