import stateManager from '../../core/state.js';

const DEFAULTS = {
  reply: '?r',
  partnershipAd: '?ad',
  snippets: '?s',
  help: '?h',
  timedClose: '?close',
  reportFinished: '?repfin',
  claim: '?c',
  unclaim: '?unclaim',
  cancelClose: '?cancelclose',
  timer: '?timer',
  note: '?note',
  userInfo: '?id',
  transfer: '?transfer',
  rename: '?rename',
  priority: '?priority',
  transcript: '?transcript',
  claimInfo: '?claiminfo',
  closeInfo: '?closeinfo',
  escalate: '?escalate',
  previewPrefix: '!!!'
};

function getTicketCommands(guildId) {
  const saved = stateManager.getGuildSetting(guildId, 'ticket_commands', '');
  if (saved) {
    try { return { ...DEFAULTS, ...JSON.parse(saved) }; } catch { /* fall through */ }
  }
  return { ...DEFAULTS };
}

function setTicketCommand(guildId, key, value) {
  const current = getTicketCommands(guildId);
  current[key] = value;
  stateManager.setGuildSetting(guildId, 'ticket_commands', JSON.stringify(current));
}

export { DEFAULTS, getTicketCommands, setTicketCommand };
