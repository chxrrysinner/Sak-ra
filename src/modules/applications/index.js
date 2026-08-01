import { SlashCommandBuilder } from 'discord.js';
import config from '../../core/config.js';
import logger from '../../core/logger.js';

const refreshCommand = new SlashCommandBuilder()
  .setName('refresh')
  .setDescription('Manually check for new applications');

const approveCommand = new SlashCommandBuilder()
  .setName('approve')
  .setDescription('Approve an applicant')
  .addUserOption((option) => option.setName('user').setDescription('The applicant to approve').setRequired(true));

const rejectCommand = new SlashCommandBuilder()
  .setName('reject')
  .setDescription('Reject an applicant')
  .addUserOption((option) => option.setName('user').setDescription('The applicant to reject').setRequired(true));

export default {
  name: 'applications',
  version: '1.0.0',
  requires: [],
  prefixCommands: [
    { command: 'refresh', handler: './refresh.js', permission: null },
    { command: 'approve', handler: './approve.js', permission: null },
    { command: 'reject', handler: './reject.js', permission: null }
  ],
  slashCommands: [
    { name: 'refresh', handler: './refresh.js', data: refreshCommand.toJSON() },
    { name: 'approve', handler: './approve.js', data: approveCommand.toJSON() },
    { name: 'reject', handler: './reject.js', data: rejectCommand.toJSON() }
  ],
  components: {
    buttons: [],
    selectMenus: [],
    modals: []
  },
  stateTables: ['reviewed_applications'],
  onLoad: async (core) => {},
  onReady: async (core) => {
    try {
      const reviewer = await import('./reviewer.js');

      if (!config.reviewer.enabled) {
        logger.warn('Reviewer not configured — missing env vars');
        return;
      }

      await reviewer.loadReviewerState();
      globalThis.__HALLOWS_REVIEWER_ENABLED__ = true;
      await reviewer.pollApplications();
      setInterval(() => reviewer.pollApplications(), Number(process.env.POLL_INTERVAL_SECONDS || 60) * 1000);
      logger.info('Application reviewer polling started');
    } catch (error) {
      logger.warn({ error: error.message }, 'Reviewer failed to start');
    }
  }
};
