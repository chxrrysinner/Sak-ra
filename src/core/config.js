import fs from 'node:fs/promises';

const REQUIRED_ENV = ['DISCORD_TOKEN'];
const REVIEWER_REQUIRED_ENV = [
  'DISCORD_CHANNEL_ID',
  'GOOGLE_FORM_ID',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'GEMINI_API_KEY'
];

function requiredEnv(key) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return process.env[key];
}

function env(key, fallback) {
  return process.env[key] ?? fallback;
}

function envNumber(key, fallback) {
  return Number(process.env[key] || fallback);
}

function envBool(key) {
  return process.env[key] === 'true';
}

const overrides = {};

function setting(key, defaultVal) {
  return overrides[key] ?? process.env[key] ?? defaultVal;
}

function settingNumber(key, defaultVal) {
  const val = overrides[key] ?? process.env[key];
  return val !== undefined ? Number(val) : defaultVal;
}

function getOverride(key) {
  return overrides[key];
}

function setOverride(key, value) {
  if (value !== null && value !== undefined && value !== '') {
    overrides[key] = value;
  } else {
    delete overrides[key];
  }
}

function loadGuildSettings(stateManager, guildId) {
  const settings = stateManager.getAllGuildSettings(guildId);
  for (const [key, value] of Object.entries(settings)) {
    overrides[key] = value;
  }
  const rolePolicyOverride = settings._role_policy;
  if (rolePolicyOverride) {
    try {
      overrides.ROLE_POLICY_OVERRIDE = JSON.parse(rolePolicyOverride);
      if (!overrides.ROLE_POLICY_OVERRIDE.staffHierarchy) {
        delete overrides.ROLE_POLICY_OVERRIDE;
      }
    } catch {}
  }
  const leadRole = settings.leadCategoryRole;
  if (leadRole && config.policy?.rolePolicy) {
    config.policy.rolePolicy.leadCategoryRole = leadRole;
  }
  if (config.policy?.rolePolicy?.categoryRoles) {
    for (const [key, value] of Object.entries(settings)) {
      if (key.startsWith('catrole_')) {
        const wingId = key.slice(8);
        config.policy.rolePolicy.categoryRoles[wingId] = value;
      }
    }
  }
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${label} file at ${filePath}: ${error.message}`);
  }
}

async function readText(filePath, label) {
  try {
    return (await fs.readFile(filePath, 'utf8')).trimEnd();
  } catch (error) {
    throw new Error(`Could not read ${label} file at ${filePath}: ${error.message}`);
  }
}

const config = {
  get discordToken() { return requiredEnv('DISCORD_TOKEN'); },
  get guildId() { return setting('GUILD_ID', null); },
  get ownerId() { return setting('OWNER_ID', null); },
  getOverride,

  supportPanel: {
    get channelId() { return setting('SUPPORT_PANEL_CHANNEL_ID', null); },
    get buttonId() { return setting('SUPPORT_PANEL_BUTTON_ID', 'modmail_open_ticket'); },
    get content() {
      const DEFAULT = '# dm me for support!\nyou can dm me or click the button below for support regarding partnerships, general support, user reporting, HR, or internals!';
      return setting('SUPPORT_PANEL_CONTENT', DEFAULT).replaceAll('\\n', '\n');
    }
  },

  get approvedApplicantRoleId() { return setting('APPROVED_APPLICANT_ROLE_ID', null); },
  get approveGhostPingChannelId() { return setting('APPROVE_GHOST_PING_CHANNEL_ID', null); },

  get approveDmMessage() {
    return (setting('APPROVE_DM_MESSAGE', 'Hello <user>. Thank you for applying for staff. Upon reviewing your application we are happy to let you know that we have decided to move forward with you. You have been accepted onto the staff team. Please review the staff handbook and introduce yourself to the staff team. Thank you for your time.')).replaceAll('\\n', '\n');
  },
  get rejectDmMessage() {
    return (setting('REJECT_DM_MESSAGE', 'Hello. Thank you for applying for staff. Upon reviewing your application we unfortunately decided to not move forward with you as of this time. Your application has been cleared and you are free to try again with a new application whenever you wish to. Thank you for your time.')).replaceAll('\\n', '\n');
  },

  get TRANSCRIPT_CHANNEL_ID() { return setting('TRANSCRIPT_CHANNEL_ID', null); },

  style: {
    get color() { return Number(setting('BOT_STYLE_COLOR', '0xc67a3a')); },
    get titlePrefix() { return setting('BOT_TITLE_PREFIX', ''); },
    get footer() { return setting('BOT_FOOTER', 'Hallows'); }
  },

  paths: {
    stateFile: setting('STATE_FILE', './data/modmail-state.json'),
    reviewerStateFile: setting('REVIEWER_STATE_FILE', './data/app-review-state.json'),
    timedCloseStateFile: setting('TIMED_CLOSE_STATE_FILE', './data/ticket-close-timers.json'),
    breakStateFile: setting('BREAK_STATE_FILE', './data/staff-breaks.json'),
    performancePlanStateFile: setting('PERFORMANCE_PLAN_STATE_FILE', './data/performance-plans.json'),
    commandsFile: setting('COMMANDS_FILE', './commands.json'),
    partnershipAdFile: setting('PARTNERSHIP_AD_FILE', './partnership-ad.txt'),
    partnershipAdIntroFile: setting('PARTNERSHIP_AD_INTRO_FILE', './partnership-ad-intro.txt'),
    timedCloseMessageFile: setting('TIMED_CLOSE_MESSAGE_FILE', './timed-close-message.txt'),
    reportFinishedMessageFile: setting('REPORT_FINISHED_MESSAGE_FILE', './report-finished-message.txt'),
    savedSnippetsFile: setting('SAVED_SNIPPETS_FILE', './saved-snippets.json'),
    rolePolicyFile: setting('ROLE_POLICY_FILE', './role-policy.json'),
    ticketBranchPolicyFile: setting('TICKET_BRANCH_POLICY_FILE', './ticket-branch-policy.json'),
    modmailCommandPolicyFile: setting('MODMAIL_COMMAND_POLICY_FILE', './modmail-command-policy.json')
  },

  reviewer: {
    get enabled() { return REVIEWER_REQUIRED_ENV.every((key) => key === 'DISCORD_CHANNEL_ID' ? Boolean(setting(key)) : Boolean(process.env[key])); },
    get channelId() { return setting('DISCORD_CHANNEL_ID', null); },
    get formId() { return setting('GOOGLE_FORM_ID', null); },
    get geminiApiKey() { return setting('GEMINI_API_KEY', null); },
    get geminiModel() { return setting('GEMINI_MODEL', 'gemini-2.5-flash'); },
    get geminiMaxOutputTokens() { return settingNumber('GEMINI_MAX_OUTPUT_TOKENS', 3000); },
    get pollIntervalSeconds() { return settingNumber('POLL_INTERVAL_SECONDS', 60); },
    get applicationPostDelaySeconds() { return settingNumber('APPLICATION_POST_DELAY_SECONDS', 30); },
    get processExistingResponses() { return (setting('PROCESS_EXISTING_RESPONSES', 'false')) === 'true'; },
    get threadAutoArchiveMinutes() { return settingNumber('THREAD_AUTO_ARCHIVE_MINUTES', 1440); },
    get googleClientId() { return setting('GOOGLE_CLIENT_ID', null); },
    get googleClientSecret() { return setting('GOOGLE_CLIENT_SECRET', null); },
    get googleRefreshToken() { return setting('GOOGLE_REFRESH_TOKEN', null); }
  },

  breaks: {
    get requestChannelId() { return setting('BREAK_REQUEST_CHANNEL_ID', '1511198192211988581'); },
    get onBreakRoleId() { return setting('ON_BREAK_ROLE_ID', null); }
  },

  pban: {
    get proposalChannelId() { return setting('PBAN_PROPOSAL_CHANNEL_ID', '1506933113924747274'); },
    get logChannelId() { return setting('PBAN_LOG_CHANNEL_ID', '1502322786545303572'); },
    get appealsInvite() { return setting('PBAN_APPEALS_INVITE', 'https://discord.gg/KVgBE9MQmH'); },
    get expiresAfterMs() { return 24 * 60 * 60 * 1000; },
    get protectedRoleIds() { 
      const raw = setting('PBAN_PROTECTED_ROLE_IDS', '1502532619924013086');
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  },

  antiBotAutomod: {
    get channelId() { return setting('ANTI_BOT_AUTOMOD_CHANNEL_ID', '1514162125327695872'); },
    get reason() { return 'anti-bot automod'; }
  },

  banSync: {
    get intervalMs() { return settingNumber('BAN_SYNC_INTERVAL_SECONDS', 30) * 1000; }
  },

  documents: {
    get channelId() { return setting('DOCUMENTS_CHANNEL_ID', null); }
  },

  get HALLOWS_ORANGE() { return 0xc67a3a; },

  policy: {
    rolePolicy: null,
    ticketBranchPolicy: null,
    modmailCommandPolicy: null,
    savedSnippets: null,
    commands: null
  },

  overrides,
  setOverride,
  loadGuildSettings
};

async function loadConfig() {
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  const [rolePolicy, ticketBranchPolicy, modmailCommandPolicy, savedSnippets, commands] = await Promise.all([
    readJson(config.paths.rolePolicyFile, 'role policy'),
    readJson(config.paths.ticketBranchPolicyFile, 'ticket branch policy'),
    readJson(config.paths.modmailCommandPolicyFile, 'modmail command policy'),
    readJson(config.paths.savedSnippetsFile, 'saved snippets'),
    readJson(config.paths.commandsFile, 'commands')
  ]);

  config.policy.rolePolicy = rolePolicy;
  config.policy.ticketBranchPolicy = ticketBranchPolicy;
  config.policy.modmailCommandPolicy = modmailCommandPolicy;
  config.policy.savedSnippets = savedSnippets;
  config.policy.commands = commands;

  return config;
}

export { config, loadConfig, readJson, readText, env, envNumber, envBool, requiredEnv, setOverride, getOverride, loadGuildSettings };
export default config;
