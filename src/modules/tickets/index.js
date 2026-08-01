import config from '../../core/config.js';
import { SlashCommandBuilder } from 'discord.js';
import { escapeRegExp } from './shared.js';

export default {
  name: 'tickets',
  version: '1.0.0',
  requires: [],
  prefixCommands: [
    { command: 'r', handler: './reply.js', permission: 'reply' },
    { command: 'close', handler: './close.js', permission: 'close' },
    { command: 'claim', handler: './claim.js', permission: 'claim' },
    { command: 'c', handler: './claim.js', permission: 'claim' },
    { command: 'unclaim', handler: './claim.js', permission: 'claim' },
    { command: 'transfer', handler: './transfer.js', permission: 'transfer' },
    { command: 't', handler: './transfer.js', permission: 'transfer' },
    { command: 'escalate', handler: './escalate.js', permission: 'transfer' },
    { command: 'rename', handler: './rename.js', permission: 'rename' },
    { command: 'priority', handler: './priority.js', permission: 'priority' },
    { command: 'transcript', handler: './transcript.js', permission: 'transcript' },
    { command: 'note', handler: './note.js', permission: 'note' },
    { command: 'id', handler: './userinfo.js', permission: 'userinfo' },
    { command: 'ad', handler: './ad.js', permission: 'partnershipAd' },
    { command: 'repfin', handler: './report-finished.js', permission: 'reportFinished' },
    { command: 's', handler: './snippets.js', permission: 'snippets' },
    { command: 'h', handler: './help.js', permission: 'help' },
    { command: 'timer', handler: './timer.js', permission: 'timer' },
    { command: 'cancelclose', handler: './cancelclose.js', permission: 'cancelclose' },
    { command: 'claiminfo', handler: './claiminfo.js', permission: 'claiminfo' },
    { command: 'closeinfo', handler: './closeinfo.js', permission: 'closeinfo' },
    { command: 'fclose', handler: './fclose.js', permission: null },
    { command: 'tstart', handler: './tstart.js', permission: null }
  ],
  slashCommands: [
    {
      name: 'fclose',
      handler: './fclose.js',
      data: new SlashCommandBuilder()
        .setName('fclose')
        .setDescription('Force close a ticket bypassing normal checks')
        .addUserOption((opt) => opt.setName('user').setDescription('The ticket opener to force close'))
        .addBooleanOption((opt) => opt.setName('all').setDescription('Force close every tracked ticket'))
    },
    {
      name: 'tstart',
      handler: './tstart.js',
      data: new SlashCommandBuilder()
        .setName('tstart')
        .setDescription('Start a ticket for a user (staff only)')
        .addUserOption((opt) => opt.setName('user').setDescription('The user to open a ticket for').setRequired(true))
        .addStringOption((opt) => opt.setName('wing').setDescription('Ticket wing').setRequired(true)
          .addChoices(
            { name: 'Assistants', value: 'assistants' },
            { name: 'Moderation', value: 'moderation' },
            { name: 'Partnership', value: 'partnership' },
            { name: 'HR', value: 'hr' },
            { name: 'Internals', value: 'internals' }
          ))
    }
  ],
  componentHandlers: {
    'modmail_open_ticket': './ticket.js',
    'modmail_department': './ticket.js'
  },
  components: {
    buttons: ['modmail_open_ticket'],
    selectMenus: ['modmail_department'],
    modals: []
  },
  stateTables: ['tickets', 'ticket_history', 'timed_closes'],
  onLoad: async (core) => {
    const desc = core.registry.get('tickets');
    if (desc && config.supportPanel.buttonId) {
      desc.components.buttons = [config.supportPanel.buttonId];
    }
    const { userIdForChannel, recordHistory, removeTimedClose } = await import('./ticket.js');
    const { getTicketCommands } = await import('./commands.js');
    const { getPrefix } = await import('../../core/prefix.js');

    const cmds = getTicketCommands();
    const TIMER_PRESERVING = [
      cmds.timedClose || '?close', cmds.snippets || '?s', cmds.help || '?h',
      cmds.timer || '?timer', cmds.userInfo || '?id', cmds.transcript || '?transcript',
      cmds.claimInfo || '?claiminfo', cmds.closeInfo || '?closeinfo'
    ];
    const ALL_TICKET_COMMANDS = [
      cmds.partnershipAd || '?ad', cmds.reply || '?r',
      cmds.snippets || '?s', cmds.help || '?h',
      cmds.timedClose || '?close', cmds.reportFinished || '?repfin',
      cmds.claim || '?c', '?claim', cmds.unclaim || '?unclaim',
      cmds.cancelClose || '?cancelclose', cmds.timer || '?timer',
      cmds.note || '?note', cmds.userInfo || '?id',
      cmds.transfer || '?transfer', cmds.rename || '?rename',
      cmds.priority || '?priority', cmds.transcript || '?transcript',
      cmds.claimInfo || '?claiminfo', cmds.closeInfo || '?closeinfo',
      cmds.escalate || '?escalate'
    ];
    for (const s of Object.values(config.policy.savedSnippets || {})) {
      if (s.command) ALL_TICKET_COMMANDS.push(s.command);
    }
    function shouldCancelTimedClose(text) {
      const trimmed = text.trim();
      const isTicketCmd = ALL_TICKET_COMMANDS.some((cmd) => {
        return new RegExp(`^${escapeRegExp(cmd)}(?:\\s|$)`, 'i').test(trimmed);
      });
      if (!isTicketCmd) return false;
      const isPreserving = TIMER_PRESERVING.some((cmd) => {
        return new RegExp(`^${escapeRegExp(cmd)}(?:\\s|$)`, 'i').test(trimmed);
      });
      return !isPreserving;
    }

    core.client.on('messageCreate', async (message) => {
      if (message.author.bot || !message.guild) return;
      const userId = userIdForChannel(message.channel.id);
      if (!userId) return;
      const prefix = getPrefix(message.guild.id);
      const text = message.content;
      const startsWithPrefix = text.startsWith(prefix) || text.startsWith('?');

      // Cancel timed close for staff commands (except timer-preserving ones)
      if (startsWithPrefix && shouldCancelTimedClose(text) && userId) {
        const tcState = globalThis.__HALLOWS_TIMED_CLOSE_STATE__ || {};
        if (tcState[userId]) {
          removeTimedClose(userId);
        }
        return; // Let main.js route the command
      }

      // Record unmatched messages as staff notes
      if (startsWithPrefix) return;
      const { recordStaffNote } = await import('./reply.js');
      await recordStaffNote(message, userId);
    });
  },
  onReady: async (core) => {
    const tcState = globalThis.__HALLOWS_TIMED_CLOSE_STATE__ || {};
    const { scheduleTimedClose } = await import('./close.js');
    for (const userId of Object.keys(tcState.ticketsByUserId || {})) {
      scheduleTimedClose(userId);
    }
    core.logger.info({ restored: Object.keys(tcState.ticketsByUserId || {}).length }, 'Timed close timers restored');

    const { restoreTicketChannelNames } = await import('./shared.js');
    restoreTicketChannelNames().catch((e) => core.logger.error({ error: e.message }, 'Failed to restore ticket channel names'));
  }
};
