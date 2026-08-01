import client from './core/client.js';

const BRIDGE_KEY = '__HALLOWS_STATE__';

function getState() {
  return globalThis[BRIDGE_KEY] || null;
}

function setState(stateObj) {
  globalThis[BRIDGE_KEY] = stateObj;
}

function getTicketState() {
  const state = getState();
  return state?.ticketsByUserId || {};
}

function getPendingState() {
  const state = getState();
  return state?.pendingByUserId || {};
}

function getTimedCloseState() {
  const tcState = globalThis.__HALLOWS_TIMED_CLOSE_STATE__;
  return tcState?.ticketsByUserId || {};
}

function getBreakState() {
  const brState = globalThis.__HALLOWS_BREAK_STATE__;
  return brState?.requestsByUserId || {};
}

function getActiveBreaks() {
  const brState = globalThis.__HALLOWS_BREAK_STATE__;
  return brState?.activeByUserId || {};
}

async function saveBridgeState() {
  const state = getState();
  if (!state) return;
  if (typeof globalThis.__HALLOWS_SAVE_STATE__ === 'function') {
    await globalThis.__HALLOWS_SAVE_STATE__();
  }
}

function getClient() {
  return client;
}

async function findGuild(options = {}) {
  const { guildId, userId, departmentId } = options;
  const configuredGuildId = process.env.GUILD_ID || guildId;

  if (configuredGuildId) {
    try {
      return await client.guilds.fetch(configuredGuildId);
    } catch {
      throw new Error(`Could not fetch configured guild ${configuredGuildId}`);
    }
  }

  if (userId) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (user) {
      const mutualGuilds = client.guilds.cache.filter((g) => g.members.cache.has(userId));
      if (mutualGuilds.size) return mutualGuilds.first();
    }
  }

  if (client.guilds.cache.size) return client.guilds.cache.first();
  throw new Error('No guild available.');
}

function getTimedCloseTimeouts() {
  return globalThis.__HALLOWS_TIMED_CLOSE_TIMEOUTS__ || new Map();
}

function getPbanProposals() {
  const state = getState();
  return state?.pbanProposalsByMessageId || {};
}

function getBanProfiles() {
  const state = getState();
  return state?.banProfilesByGuildUser || {};
}

function getPbanTimeouts() {
  return globalThis.__HALLOWS_PBAN_TIMEOUTS__ || new Map();
}

function getPendingAddProofUploads() {
  return globalThis.__HALLOWS_PENDING_ADD_PROOF_UPLOADS__ || new Map();
}

function getPerformancePlanState() {
  return globalThis.__HALLOWS_PERFORMANCE_PLAN_STATE__?.plansByUserId || {};
}

function getReviewerState() {
  return globalThis.__HALLOWS_REVIEWER_STATE__ || { lastSubmittedTime: null, processedResponseIds: [] };
}

function getIsPolling() {
  return Boolean(globalThis.__HALLOWS_IS_POLLING__);
}

function getReviewerEnabled() {
  return Boolean(globalThis.__HALLOWS_REVIEWER_ENABLED__);
}

function populateGlobals(stateManager) {
  const mainState = stateManager.loadAllState();
  globalThis[BRIDGE_KEY] = mainState;

  const breakState = stateManager.loadBreaksState();
  globalThis.__HALLOWS_BREAK_STATE__ = breakState;

  const pplanState = stateManager.loadPerformancePlansState();
  globalThis.__HALLOWS_PERFORMANCE_PLAN_STATE__ = pplanState;

  const tcState = stateManager.loadTimedCloseState();
  globalThis.__HALLOWS_TIMED_CLOSE_STATE__ = tcState;

  const reviewerStateData = stateManager.loadReviewerState();
  globalThis.__HALLOWS_REVIEWER_STATE__ = reviewerStateData || { lastSubmittedTime: null, processedResponseIds: [] };

  globalThis.__HALLOWS_TIMED_CLOSE_TIMEOUTS__ = new Map();
  globalThis.__HALLOWS_PBAN_TIMEOUTS__ = new Map();
  globalThis.__HALLOWS_PENDING_ADD_PROOF_UPLOADS__ = new Map();
  globalThis.__HALLOWS_BREAK_TIMEOUTS__ = new Map();
  globalThis.__HALLOWS_IS_POLLING__ = false;
  globalThis.__HALLOWS_REVIEWER_AUTH_INVALID_LOGGED__ = false;
  globalThis.__HALLOWS_REVIEWER_ENABLED__ = Boolean(process.env.GOOGLE_FORM_ID && process.env.GEMINI_API_KEY && process.env.GOOGLE_REFRESH_TOKEN);

  globalThis.__HALLOWS_SAVE_STATE__ = () => { stateManager.saveAllState(mainState); };
  globalThis.__HALLOWS_SAVE_BREAK_STATE__ = () => { stateManager.saveBreaksState(breakState); };
  globalThis.__HALLOWS_SAVE_PERFORMANCE_PLAN_STATE__ = () => { stateManager.savePerformancePlansState(pplanState); };
  globalThis.__HALLOWS_SAVE_TIMED_CLOSE_STATE__ = () => { stateManager.saveTimedCloseState(tcState); };
  globalThis.__HALLOWS_SAVE_REVIEWER_STATE__ = () => { stateManager.saveReviewerState(reviewerStateData); };
}

function saveAllGlobals(stateManager) {
  try {
    const mainState = globalThis[BRIDGE_KEY];
    if (mainState) stateManager.saveAllState(mainState);
    if (globalThis.__HALLOWS_BREAK_STATE__) stateManager.saveBreaksState(globalThis.__HALLOWS_BREAK_STATE__);
    if (globalThis.__HALLOWS_PERFORMANCE_PLAN_STATE__) stateManager.savePerformancePlansState(globalThis.__HALLOWS_PERFORMANCE_PLAN_STATE__);
    if (globalThis.__HALLOWS_TIMED_CLOSE_STATE__) stateManager.saveTimedCloseState(globalThis.__HALLOWS_TIMED_CLOSE_STATE__);
    if (globalThis.__HALLOWS_REVIEWER_STATE__) stateManager.saveReviewerState(globalThis.__HALLOWS_REVIEWER_STATE__);
  } catch (e) {
    console.error('saveAllGlobals error:', e);
  }
}

export {
  getState, setState, getTicketState, getPendingState,
  getTimedCloseState, getBreakState, getActiveBreaks, saveBridgeState,
  getClient, findGuild, getTimedCloseTimeouts, BRIDGE_KEY,
  getPbanProposals, getBanProfiles, getPbanTimeouts,
  getPendingAddProofUploads, getPerformancePlanState,
  getReviewerState, getIsPolling, getReviewerEnabled,
  populateGlobals, saveAllGlobals
};
