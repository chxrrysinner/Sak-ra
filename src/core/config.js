import fs from 'node:fs/promises';

const REQUIRED_ENV = ['DISCORD_TOKEN'];

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

const config = {
  get discordToken() { return requiredEnv('DISCORD_TOKEN'); },
  get guildId() { return setting('GUILD_ID', null); },
  get ownerId() { return setting('OWNER_ID', null); },
  getOverride,

  style: {
    get color() { return Number(setting('BOT_STYLE_COLOR', '0xc67a3a')); },
    get titlePrefix() { return setting('BOT_TITLE_PREFIX', ''); },
    get footer() { return setting('BOT_FOOTER', 'Hallows'); }
  },

  paths: {
    rolePolicyFile: setting('ROLE_POLICY_FILE', './role-policy.json')
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

  documents: {
    get channelId() { return setting('DOCUMENTS_CHANNEL_ID', null); }
  },

  get HALLOWS_ORANGE() { return 0xc67a3a; },

  policy: {
    rolePolicy: null
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

  const rolePolicy = await readJson(config.paths.rolePolicyFile, 'role policy');

  config.policy.rolePolicy = rolePolicy;

  return config;
}

export { config, loadConfig, readJson, env, envNumber, envBool, requiredEnv, setOverride, getOverride, loadGuildSettings };
export default config;
