import 'dotenv/config';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  AuditLogEvent,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  ModalBuilder,
  Partials,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { GoogleGenAI } from '@google/genai';
import { google } from 'googleapis';

const REQUIRED_ENV = ['DISCORD_TOKEN'];
const REVIEWER_REQUIRED_ENV = [
  'DISCORD_CHANNEL_ID',
  'GOOGLE_FORM_ID',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'GEMINI_API_KEY'
];
const REQUIRED_CLIENT_INTENTS = [
  ['Guilds', GatewayIntentBits.Guilds],
  ['GuildMessages', GatewayIntentBits.GuildMessages],
  ['DirectMessages', GatewayIntentBits.DirectMessages],
  ['GuildMembers', GatewayIntentBits.GuildMembers],
  ['MessageContent', GatewayIntentBits.MessageContent]
];
const DEFAULT_SUPPORT_PANEL_CONTENT = [
  '# dm me for support!',
  'you can dm me or click the button below for support regarding partnerships, general support, user reporting, HR, or internals!'
].join('\n');
const DEFAULT_APPROVE_DM_MESSAGE = 'Hello <user>. Thank you for applying for staff. Upon reviewing your application we are happy to let you know that we have decided to move forward with you. You have been accepted onto the staff team. Please review the staff handbook and introduce yourself to the staff team. Thank you for your time.';
const DEFAULT_REJECT_DM_MESSAGE = 'Hello. Thank you for applying for staff. Upon reviewing your application we unfortunately decided to not move forward with you as of this time. Your application has been cleared and you are free to try again with a new application whenever you wish to. Thank you for your time.';
const STATE_FILE = process.env.STATE_FILE || './data/modmail-state.json';
const REVIEWER_STATE_FILE = process.env.REVIEWER_STATE_FILE || './data/app-review-state.json';
const TIMED_CLOSE_STATE_FILE = process.env.TIMED_CLOSE_STATE_FILE || './data/ticket-close-timers.json';
const BREAK_STATE_FILE = process.env.BREAK_STATE_FILE || './data/staff-breaks.json';
const BREAK_REQUEST_CHANNEL_ID = process.env.BREAK_REQUEST_CHANNEL_ID || '1511198192211988581';
const PBAN_PROPOSAL_CHANNEL_ID = process.env.PBAN_PROPOSAL_CHANNEL_ID || '1506933113924747274';
const PBAN_LOG_CHANNEL_ID = process.env.PBAN_LOG_CHANNEL_ID || '1502322786545303572';
const PBAN_APPEALS_INVITE = process.env.PBAN_APPEALS_INVITE || 'https://discord.gg/KVgBE9MQmH';
const ANTI_BOT_AUTOMOD_CHANNEL_ID = process.env.ANTI_BOT_AUTOMOD_CHANNEL_ID || '1514162125327695872';
const ANTI_BOT_AUTOMOD_REASON = 'anti-bot automod';
const PBAN_EXPIRES_AFTER_MS = 24 * 60 * 60 * 1000;
const PBAN_PROTECTED_ROLE_IDS = ['1502532619924013086'];
const BAN_SYNC_INTERVAL_MS = Number(process.env.BAN_SYNC_INTERVAL_SECONDS || 30) * 1000;
const SUPPORT_PANEL_CHANNEL_ID = process.env.SUPPORT_PANEL_CHANNEL_ID || null;
const SUPPORT_PANEL_BUTTON_ID = process.env.SUPPORT_PANEL_BUTTON_ID || 'modmail_open_ticket';
const SUPPORT_PANEL_CONTENT = (process.env.SUPPORT_PANEL_CONTENT || DEFAULT_SUPPORT_PANEL_CONTENT).replaceAll('\\n', '\n');
const STYLE_COLOR = Number(process.env.BOT_STYLE_COLOR || 0xffb7c5);
const TITLE_PREFIX = process.env.BOT_TITLE_PREFIX || '🌸';
const FOOTER_TEXT = process.env.BOT_FOOTER || 'ModMail  🌸';
const COMMANDS_FILE = process.env.COMMANDS_FILE || './commands.json';
const PARTNERSHIP_AD_FILE = process.env.PARTNERSHIP_AD_FILE || './partnership-ad.txt';
const PARTNERSHIP_AD_INTRO_FILE = process.env.PARTNERSHIP_AD_INTRO_FILE || './partnership-ad-intro.txt';
const TIMED_CLOSE_MESSAGE_FILE = process.env.TIMED_CLOSE_MESSAGE_FILE || './timed-close-message.txt';
const REPORT_FINISHED_MESSAGE_FILE = process.env.REPORT_FINISHED_MESSAGE_FILE || './report-finished-message.txt';
const SAVED_SNIPPETS_FILE = process.env.SAVED_SNIPPETS_FILE || './saved-snippets.json';
const ROLE_POLICY_FILE = process.env.ROLE_POLICY_FILE || './role-policy.json';
const TICKET_BRANCH_POLICY_FILE = process.env.TICKET_BRANCH_POLICY_FILE || './ticket-branch-policy.json';
const MODMAIL_COMMAND_POLICY_FILE = process.env.MODMAIL_COMMAND_POLICY_FILE || './modmail-command-policy.json';
const DISCORD_INVITE_PATTERN = /\b(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i;
const APPLICATION_EMBED_DESCRIPTION_LIMIT = 3900;
const APPROVE_DM_MESSAGE = (process.env.APPROVE_DM_MESSAGE || DEFAULT_APPROVE_DM_MESSAGE).replaceAll('\\n', '\n');
const REJECT_DM_MESSAGE = (process.env.REJECT_DM_MESSAGE || DEFAULT_REJECT_DM_MESSAGE).replaceAll('\\n', '\n');
const COMMANDS = await readRequiredJsonFile(COMMANDS_FILE, 'commands');
const REPLY_PREFIX = requiredCommandValue(COMMANDS.reply, 'reply');
const PARTNERSHIP_AD_COMMAND = requiredCommandValue(COMMANDS.partnershipAd, 'partnershipAd');
const SNIPPETS_COMMAND = requiredCommandValue(COMMANDS.snippets, 'snippets');
const HELP_COMMAND = requiredCommandValue(COMMANDS.help, 'help');
const SNIPPET_PREVIEW_PREFIX = requiredCommandValue(COMMANDS.previewPrefix, 'previewPrefix');
const TIMED_CLOSE_COMMAND = requiredCommandValue(COMMANDS.timedClose, 'timedClose');
const REPORT_FINISHED_COMMAND = requiredCommandValue(COMMANDS.reportFinished, 'reportFinished');
const CLAIM_COMMAND = requiredCommandValue(COMMANDS.claim, 'claim');
const CLAIM_COMMAND_ALIASES = [...new Set([CLAIM_COMMAND, '?claim'])];
const UNCLAIM_COMMAND = requiredCommandValue(COMMANDS.unclaim, 'unclaim');
const CANCEL_CLOSE_COMMAND = requiredCommandValue(COMMANDS.cancelClose, 'cancelClose');
const TIMER_COMMAND = requiredCommandValue(COMMANDS.timer, 'timer');
const NOTE_COMMAND = requiredCommandValue(COMMANDS.note, 'note');
const USER_INFO_COMMAND = requiredCommandValue(COMMANDS.userInfo, 'userInfo');
const TRANSFER_COMMAND = requiredCommandValue(COMMANDS.transfer, 'transfer');
const RENAME_COMMAND = requiredCommandValue(COMMANDS.rename, 'rename');
const PRIORITY_COMMAND = requiredCommandValue(COMMANDS.priority, 'priority');
const TRANSCRIPT_COMMAND = requiredCommandValue(COMMANDS.transcript, 'transcript');
const CLAIM_INFO_COMMAND = requiredCommandValue(COMMANDS.claimInfo, 'claimInfo');
const CLOSE_INFO_COMMAND = requiredCommandValue(COMMANDS.closeInfo, 'closeInfo');
const ESCALATE_COMMAND = requiredCommandValue(COMMANDS.escalate, 'escalate');
const HIDDEN_DELETE_BOT_MESSAGE_COMMAND = '𖣐abcdefghijk';
const PARTNERSHIP_AD_INTRO_MESSAGE = await readRequiredTextFile(PARTNERSHIP_AD_INTRO_FILE, 'partnership ad intro');
const TIMED_CLOSE_MESSAGE = await readRequiredTextFile(TIMED_CLOSE_MESSAGE_FILE, 'timed close message');
const REPORT_FINISHED_MESSAGE = await readRequiredTextFile(REPORT_FINISHED_MESSAGE_FILE, 'report finished message');
const SAVED_SNIPPETS = await readRequiredJsonFile(SAVED_SNIPPETS_FILE, 'saved snippets');
const ROLE_POLICY = await readRequiredJsonFile(ROLE_POLICY_FILE, 'role policy');
const TICKET_BRANCH_POLICY = await readRequiredJsonFile(TICKET_BRANCH_POLICY_FILE, 'ticket branch policy');
const MODMAIL_COMMAND_POLICY = await readRequiredJsonFile(MODMAIL_COMMAND_POLICY_FILE, 'modmail command policy');

const DEPARTMENTS = {
  assistants: {
    label: 'Assistants',
    description: 'Contact assistants for general server support.',
    categoryEnv: ['ASSISTANTS_CATEGORY_ID', 'GENERAL_CATEGORY_ID'],
    channelPrefix: 'general'
  },
  partnership: {
    label: 'Partnership',
    description: 'Contact the partnership wing.',
    categoryEnv: 'PARTNERSHIP_CATEGORY_ID',
    channelPrefix: 'partner'
  },
  moderation: {
    label: 'Moderation',
    description: 'Report a member to the moderation wing.',
    categoryEnv: 'REPORT_CATEGORY_ID',
    channelPrefix: 'report'
  },
  hr: {
    label: 'HR',
    description: 'Contact the HR wing.',
    categoryEnv: 'HR_CATEGORY_ID',
    channelPrefix: 'hr'
  },
  internals: {
    label: 'Internals',
    description: 'Contact the internals wing.',
    categoryEnv: ['INTERNALS_CATEGORY_ID', 'STAFF_APPLICATION_CATEGORY_ID'],
    channelPrefix: 'internals'
  }
};

const DEPARTMENT_ALIASES = {
  general: 'assistants',
  support: 'assistants',
  assistant: 'assistants',
  report: 'moderation',
  reports: 'moderation',
  mod: 'moderation',
  moderation: 'moderation',
  moderations: 'moderation',
  manage: 'internals',
  management: 'internals',
  staff_application: 'internals',
  applications: 'internals'
};

const TRANSFER_DEPARTMENTS = {
  general: 'assistants',
  support: 'assistants',
  assistant: 'assistants',
  assistants: 'assistants',
  partner: 'partnership',
  partnership: 'partnership',
  partnerships: 'partnership',
  mod: 'moderation',
  moderation: 'moderation',
  moderations: 'moderation',
  report: 'moderation',
  reports: 'moderation',
  hr: 'hr',
  humanresources: 'hr',
  manage: 'internals',
  management: 'internals',
  internals: 'internals',
  internal: 'internals',
  staff_application: 'internals',
  applications: 'internals'
};

const WING_ORDER = ['internals', 'hr', 'partnership', 'moderation', 'assistants'];
const WING_COMMAND_CHOICES = WING_ORDER.map((wingId) => ({
  name: wingId,
  value: wingId
}));

const STAFF_LIST_DEPARTMENTS = [
  { heading: 'Internals Wing', staffWingId: 'internals' },
  { heading: 'HR Wing', staffWingId: 'hr' },
  { heading: 'Partnership Wing', staffWingId: 'partnership' },
  { heading: 'Moderation Wing', staffWingId: 'moderation' },
  { heading: 'Assistants Wing', staffWingId: 'assistants' }
];

const STAFF_HIERARCHY_WINGS = {
  internals: 'Internals',
  hr: 'HR',
  partnership: 'Partnership',
  moderation: 'Moderation',
  assistants: 'Assistants'
};

const STAFF_HIERARCHY_ALIASES = {
  int: 'internals',
  internal: 'internals',
  executive: 'internals',
  exec: 'internals',
  regional: 'internals',
  regions: 'internals',
  executive_regional: 'internals',
  part: 'partnership',
  partner: 'partnership',
  partnerships: 'partnership',
  mod: 'moderation',
  mods: 'moderation',
  report: 'moderation',
  reports: 'moderation',
  assi: 'assistants',
  assistant: 'assistants',
  general: 'assistants'
};

const INTERNAL_HIERARCHY_LEVEL = 2_000_000;

validateRolePolicy();

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

let state = {
  ticketsByUserId: {},
  pendingByUserId: {},
  strikesByUserId: {},
  pbanProposalsByMessageId: {},
  banProfilesByGuildUser: {}
};

let reviewerState = {
  lastSubmittedTime: null,
  processedResponseIds: []
};

let timedCloseState = {
  ticketsByUserId: {}
};

let breakState = {
  requestsByUserId: {},
  activeByUserId: {}
};

let configuredGuildId = process.env.GUILD_ID || null;
let reviewerAuthInvalidLogged = false;
const timedCloseTimeouts = new Map();
const breakTimeouts = new Map();
const pbanTimeouts = new Map();
const ticketChannelRenameJobs = new Map();
const ticketChannelLastRenamedAt = new Map();
const pendingAddProofUploads = new Map();
let banSyncRunning = false;

const pollIntervalMs = Number(process.env.POLL_INTERVAL_SECONDS || 60) * 1000;
const applicationPostDelayMs = Number(process.env.APPLICATION_POST_DELAY_SECONDS || 30) * 1000;
const processExistingResponses = process.env.PROCESS_EXISTING_RESPONSES === 'true';
const threadAutoArchiveMinutes = Number(process.env.THREAD_AUTO_ARCHIVE_MINUTES || 1440);
const ticketChannelRenameCooldownMs = 10 * 60_000;
const addProofUploadTimeoutMs = 5 * 60_000;
const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const geminiMaxOutputTokens = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 3000);
const reviewerEnabled = REVIEWER_REQUIRED_ENV.every((key) => Boolean(process.env[key]));
const gemini = reviewerEnabled ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const oauth2 = reviewerEnabled
  ? new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  : null;
if (oauth2) {
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
}
const forms = oauth2 ? google.forms({ version: 'v1', auth: oauth2 }) : null;
const requiredReviewerChannelPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.SendMessagesInThreads
];
let isPolling = false;

function isGoogleInvalidGrantError(error) {
  return error?.response?.data?.error === 'invalid_grant' || error?.code === 'invalid_grant';
}

function googleInvalidGrantMessage() {
  return [
    'Google OAuth refresh token is expired or revoked.',
    'Run `npm run google:auth`, replace GOOGLE_REFRESH_TOKEN with the new value, then restart the bot.'
  ].join(' ');
}

function trimTo(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readRequiredTextFile(filePath, label) {
  try {
    return (await fs.readFile(filePath, 'utf8')).trimEnd();
  } catch (error) {
    throw new Error(`Could not read ${label} file at ${filePath}: ${error.message}`);
  }
}

async function readRequiredJsonFile(filePath, label) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${label} file at ${filePath}: ${error.message}`);
  }
}

function requiredCommandValue(value, key) {
  if (typeof value !== 'string' || !value.trim() || /\s/.test(value)) {
    throw new Error(`Invalid command value for ${key} in ${COMMANDS_FILE}. Use a non-empty value without spaces.`);
  }

  return value;
}

function formatTimestamp(ms) {
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', ' UTC');
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function normalizeDepartmentId(value) {
  if (!value) return null;
  return DEPARTMENTS[value] ? value : DEPARTMENT_ALIASES[value] || null;
}

function departmentFor(value) {
  const id = normalizeDepartmentId(value);
  return id ? { id, ...DEPARTMENTS[id] } : null;
}

function categoryEnvKeysFor(department) {
  return Array.isArray(department.categoryEnv) ? department.categoryEnv : [department.categoryEnv];
}

function categoryEnvLabel(department) {
  return categoryEnvKeysFor(department).join(' or ');
}

function categoryIdFor(departmentId) {
  const department = departmentFor(departmentId);
  if (!department) return null;
  for (const key of categoryEnvKeysFor(department)) {
    if (process.env[key]) return process.env[key];
  }
  return null;
}

function teamNameForDepartment(departmentId) {
  return {
    assistants: 'assistants wing',
    partnership: 'partnership wing',
    moderation: 'moderation wing',
    hr: 'HR wing',
    internals: 'internals wing'
  }[normalizeDepartmentId(departmentId)] || 'support wing';
}

function formatDepartmentList(departmentIds) {
  const labels = departmentIds
    .map((departmentId) => departmentFor(departmentId)?.label || departmentId)
    .filter(Boolean);
  if (labels.length <= 1) return labels[0] || 'the configured wing';
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`;
}

function restrictedTicketBranchMessage(commandPolicy, commandName) {
  const allowedDepartments = formatDepartmentList(commandPolicy?.allowedBranches || []);
  return `You need to be part of the ${allowedDepartments} wing to use **${commandName}**.`;
}

function parseDiscordMessageUrl(value) {
  const match = value.match(/^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/channels\/(@me|\d+)\/(\d+)\/(\d+)(?:[/?#].*)?$/i);
  if (!match) return null;
  return {
    guildId: match[1],
    channelId: match[2],
    messageId: match[3]
  };
}

function transferDepartmentFor(value) {
  const departmentId = TRANSFER_DEPARTMENTS[value];
  return departmentId ? departmentFor(departmentId) : null;
}

function normalizeStaffWingId(value) {
  if (!value) return null;
  return normalizeDepartmentId(value) || STAFF_HIERARCHY_ALIASES[value] || null;
}

function staffWingNameFor(value) {
  const id = normalizeStaffWingId(value);
  return id ? STAFF_HIERARCHY_WINGS[id] || departmentFor(id)?.label || id : value;
}

function rolePolicyValueParts(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (/^M\d+$/.test(text)) {
    return { roleId: text.slice(1), isLead: true, isInternal: false, level: null };
  }
  return { roleId: text, isLead: false, isInternal: false, level: null };
}

function configuredRoleIdForToken(token) {
  return ROLE_POLICY.wingRoleIds?.[token]
    || ROLE_POLICY.staffRoleIds?.[token]
    || ROLE_POLICY.roles?.[token]
    || null;
}

function rolePolicyEntryParts(entry, fallbackLevel = null, options = {}) {
  const rawText = typeof entry === 'string' ? entry.trim() : '';
  const internalMatch = rawText.match(/^I,(.+)$/);
  const leadMatch = internalMatch ? null : rawText.match(/^M,(.+)$/);
  const hierarchyMatch = internalMatch || leadMatch ? null : rawText.match(/^(?:(M)?)(\d+),(.+)$/);
  const hierarchyLevel = hierarchyMatch ? Number(hierarchyMatch[2]) : null;
  const hierarchyLead = Boolean(hierarchyMatch?.[1] || leadMatch);
  const roleEntry = internalMatch ? internalMatch[1].trim() : leadMatch ? leadMatch[1].trim() : hierarchyMatch ? hierarchyMatch[3].trim() : rawText;
  const explicitLevel = internalMatch
    ? INTERNAL_HIERARCHY_LEVEL + (fallbackLevel || 0)
    : Number.isSafeInteger(hierarchyLevel) && hierarchyLevel > 0 ? hierarchyLevel : fallbackLevel;
  const direct = rolePolicyValueParts(roleEntry);
  const mappedRoleId = options.resolveHierarchyReference === false ? null : configuredRoleIdForToken(roleEntry);
  const mapped = rolePolicyValueParts(mappedRoleId);
  const result = mapped.roleId
    ? { roleId: mapped.roleId, isLead: mapped.isLead || direct.isLead || hierarchyLead, isInternal: Boolean(internalMatch) || mapped.isInternal || direct.isInternal }
    : { roleId: direct.roleId, isLead: direct.isLead || hierarchyLead, isInternal: Boolean(internalMatch) || direct.isInternal };
  return { ...result, level: explicitLevel };
}

function roleIdForPolicyEntry(entry) {
  return rolePolicyEntryParts(entry).roleId || null;
}

function allStaffHierarchyParts() {
  return WING_ORDER.flatMap((wingId) => sortedStaffHierarchyPartsForWing(wingId));
}

function hierarchyReferencePartsForEntry(entry) {
  const text = typeof entry === 'string' ? entry.trim() : '';
  const allMatch = text.match(/^all(?:-(.+))?$/);
  if (allMatch) {
    const excludedWingId = normalizeStaffWingId(allMatch[1]);
    return allStaffHierarchyParts()
      .filter((part) => !excludedWingId || excludedWingId === 'internals' || part.wingId !== excludedWingId);
  }

  const internalMatch = text.match(/^I,(.+)$/);
  const leadMatch = internalMatch ? null : text.match(/^M,(.+)$/);
  const numberedMatch = internalMatch || leadMatch ? null : text.match(/^(\d+),(.+)$/);
  const bareWingId = internalMatch || leadMatch || numberedMatch ? null : normalizeStaffWingId(text);
  const wingId = bareWingId || normalizeStaffWingId(internalMatch?.[1] || leadMatch?.[1] || numberedMatch?.[2]);
  if (!wingId) return [];

  const parts = sortedStaffHierarchyPartsForWing(wingId);
  if (bareWingId) return parts;
  if (internalMatch) return parts.filter((part) => part.isInternal);
  if (leadMatch) return parts.filter((part) => part.isLead);
  const level = Number(numberedMatch?.[1]);
  return parts.filter((part) => !part.isLead && part.level === level);
}

function roleIdsForPolicyEntry(entry) {
  const hierarchyRoleIds = hierarchyReferencePartsForEntry(entry).map((part) => part.roleId);
  if (hierarchyRoleIds.length) return hierarchyRoleIds;
  const roleId = roleIdForPolicyEntry(entry);
  return roleId ? [roleId] : [];
}

function sortedStaffHierarchyPartsForWing(wingId) {
  const normalizedWingId = normalizeStaffWingId(wingId);
  return staffHierarchyEntriesForWing(wingId)
    .map((entry, index) => rolePolicyEntryParts(entry, index + 1, { resolveHierarchyReference: false }))
    .map((entry) => ({ ...entry, wingId: normalizedWingId, isInternal: entry.isInternal || normalizedWingId === 'internals' }))
    .filter((entry) => entry.roleId)
    .sort((a, b) => (a.level || 0) - (b.level || 0));
}

function staffHierarchyEntriesForWing(wingId = null) {
  const hierarchy = ROLE_POLICY.staffHierarchy;
  if (Array.isArray(hierarchy)) return hierarchy;
  if (!hierarchy || typeof hierarchy !== 'object') return [];
  if (wingId) return hierarchy[normalizeStaffWingId(wingId)] || [];
  return Object.values(hierarchy).flatMap((entries) => Array.isArray(entries) ? entries : []);
}

function roleAuthorityForWing(member, wingId) {
  const roleParts = sortedStaffHierarchyPartsForWing(wingId);
  const authorityValues = roleParts
    .filter((entry) => member.roles.cache.has(entry.roleId))
    .map((entry) => entry.isInternal ? INTERNAL_HIERARCHY_LEVEL : entry.isLead ? 1_000_000 : entry.level || 0);
  return authorityValues.length ? Math.max(...authorityValues) : 0;
}

function ticketClaimAuthority(member, wingId) {
  if (roleAuthorityForWing(member, 'internals') > 0) return 3_000_000;
  if (roleAuthorityForWing(member, 'hr') > 0) return 2_000_000;
  return roleAuthorityForWing(member, wingId);
}

function demoteCommandRoleIds() {
  return [...new Set([
    ...staffRoleHierarchyIds('hr'),
    ...staffRoleHierarchyIds('internals')
  ])];
}

function categoryRoleIdsByWing() {
  const configured = ROLE_POLICY.categoryRoles || {};
  return Object.fromEntries(Object.entries(configured)
    .map(([wingId, roleId]) => [normalizeStaffWingId(wingId), rolePolicyValueParts(roleId).roleId])
    .filter(([wingId, roleId]) => wingId && roleId));
}

function categoryRoleIds() {
  return [...new Set(Object.values(categoryRoleIdsByWing()).filter(Boolean))];
}

function leadCategoryRoleId() {
  return rolePolicyValueParts(ROLE_POLICY.leadCategoryRole).roleId;
}

function leadHierarchyRoleIds() {
  return [...new Set(WING_ORDER
    .map((wingId) => leadHierarchyPartForWing(wingId)?.roleId)
    .filter(Boolean))];
}

async function removeCategoryRoleForWing(member, wingId, auditReason) {
  const roleId = categoryRoleIdsByWing()[wingId];
  if (roleId && member.roles.cache.has(roleId)) {
    await member.roles.remove(roleId, auditReason);
  }
}

function numberedHierarchyPartsForWing(wingId) {
  return sortedStaffHierarchyPartsForWing(wingId).filter((entry) => !entry.isLead);
}

function leadHierarchyPartForWing(wingId) {
  return sortedStaffHierarchyPartsForWing(wingId).find((entry) => entry.isLead) || null;
}

function memberHierarchyPartsForWing(member, wingId) {
  return sortedStaffHierarchyPartsForWing(wingId).filter((entry) => member.roles.cache.has(entry.roleId));
}

function memberNumberedHierarchyPartForWing(member, wingId) {
  return numberedHierarchyPartsForWing(wingId)
    .filter((entry) => member.roles.cache.has(entry.roleId))
    .sort((a, b) => (b.level || 0) - (a.level || 0))[0] || null;
}

function memberLeadHierarchyPartForWing(member, wingId) {
  const leadPart = leadHierarchyPartForWing(wingId);
  return leadPart && member.roles.cache.has(leadPart.roleId) ? leadPart : null;
}

function memberStaffWingIds(member) {
  return WING_ORDER
    .filter((wingId) => memberHierarchyPartsForWing(member, wingId).length);
}

function nonAssistantStaffWingIds(member) {
  return memberStaffWingIds(member).filter((wingId) => wingId !== 'assistants');
}

async function syncCategoryRoleForWing(member, wingId, auditReason) {
  const byWing = categoryRoleIdsByWing();
  const targetRoleId = byWing[wingId] || null;
  const removeRoleIds = categoryRoleIds().filter((roleId) => roleId !== targetRoleId && member.roles.cache.has(roleId));
  if (removeRoleIds.length) {
    await member.roles.remove(removeRoleIds, auditReason);
  }
  if (targetRoleId && !member.roles.cache.has(targetRoleId)) {
    await member.roles.add(targetRoleId, auditReason);
  }
}

async function syncLeadCategoryRole(member, auditReason = 'Lead category role sync') {
  const targetRoleId = leadCategoryRoleId();
  if (!targetRoleId) return;

  const hasLeadRole = leadHierarchyRoleIds().some((roleId) => member.roles.cache.has(roleId));
  if (hasLeadRole && !member.roles.cache.has(targetRoleId)) {
    await member.roles.add(targetRoleId, auditReason);
    return;
  }

  if (!hasLeadRole && member.roles.cache.has(targetRoleId)) {
    await member.roles.remove(targetRoleId, auditReason);
  }
}

async function syncGuildLeadCategoryRoles(guild) {
  if (!leadCategoryRoleId()) return;

  const leadRoleIds = leadHierarchyRoleIds();
  if (!leadRoleIds.length) return;

  const members = await guild.members.fetch();
  const targetRoleId = leadCategoryRoleId();
  for (const member of members.values()) {
    const shouldSync = member.roles.cache.has(targetRoleId)
      || leadRoleIds.some((roleId) => member.roles.cache.has(roleId));
    if (shouldSync) {
      await syncLeadCategoryRole(member, 'Lead category role startup sync');
    }
  }
}

async function memberCanRunDemote(interaction) {
  if (!interaction.guildId) return false;
  return memberHasAnyRole(interaction.guildId, interaction.user.id, demoteCommandRoleIds());
}

async function memberCanTakeOverClaim(message, ticket) {
  if (!ticket.claimedByStaffUserId || ticket.claimedByStaffUserId === message.author.id) return true;
  const claimant = await message.guild.members.fetch(ticket.claimedByStaffUserId).catch(() => null);
  if (!claimant) return true;
  const actor = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!actor) return false;
  const wingId = normalizeDepartmentId(ticket.departmentId);
  return ticketClaimAuthority(actor, wingId) > ticketClaimAuthority(claimant, wingId);
}

async function memberHasTicketClaimAuthority(message, ticket) {
  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  return member ? ticketClaimAuthority(member, normalizeDepartmentId(ticket.departmentId)) > 0 : false;
}

function claimTakeoverDeniedMessage(message, ticket) {
  const wing = departmentFor(ticket.departmentId)?.label || 'this wing';
  return `This ticket is already claimed by **${ticket.claimedByStaffTag || 'another staff member'}**. You need a higher ${wing} hierarchy rank, that wing's lead role, HR, or Internals to take it over.`;
}

function rolePolicyEntryDisplay(entry) {
  const parts = rolePolicyEntryParts(entry);
  if (parts.isInternal) return `I,${parts.roleId || entry}`;
  const prefix = parts.level ? `${parts.level},` : '';
  const lead = parts.isLead ? 'M' : '';
  return `${prefix}${lead}${parts.roleId || entry}`;
}

function memberHasAnyCachedRole(member, roleIds) {
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

function staffListRoleIdsForGroup(group) {
  return group.staffWingId ? staffRoleHierarchyIds(group.staffWingId) : roleIdsFor(group.departmentId, 'ping');
}

function memberDisplayName(member) {
  return member.displayName || member.user?.username || member.id;
}

function staffListPartsForRoleIds(wingId, roleIds) {
  return sortedStaffHierarchyPartsForWing(wingId)
    .filter((entry) => roleIds.includes(entry.roleId));
}

function staffListBestPart(parts) {
  return [...parts].sort((a, b) => {
    const authorityA = a.isInternal ? INTERNAL_HIERARCHY_LEVEL : a.isLead ? 1_000_000 : a.level || 0;
    const authorityB = b.isInternal ? INTERNAL_HIERARCHY_LEVEL : b.isLead ? 1_000_000 : b.level || 0;
    return authorityB - authorityA;
  })[0] || null;
}

function staffListSortValue(parts) {
  const bestPart = staffListBestPart(parts);
  if (!bestPart) return Number.MAX_SAFE_INTEGER;
  if (bestPart.isInternal) return -INTERNAL_HIERARCHY_LEVEL;
  if (bestPart.isLead) return -1_000_000;
  return -(bestPart.level || 0);
}

function staffListRankLabel(parts) {
  const bestPart = staffListBestPart(parts);
  if (!bestPart) return '';
  if (bestPart.isInternal) return ' (internal)';
  if (bestPart.isLead) return ' (lead)';
  return bestPart.level ? ` (rank ${bestPart.level})` : '';
}

function sortStaffListEntries(entries) {
  return entries.sort((a, b) =>
    a.rankSortValue - b.rankSortValue
    || a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
  );
}

function userIdsOnBreakForDepartment(guildId, departmentRoleIds) {
  return Object.entries(breakState.activeByUserId)
    .filter(([, activeBreak]) =>
      activeBreak.guildId === guildId
      && (activeBreak.removedRoleIds || []).some((roleId) => departmentRoleIds.includes(roleId))
    )
    .map(([userId]) => userId);
}

function chunkStaffListValue(lines) {
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > 1000 && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function validateRolePolicy() {
  const rolePolicyErrors = [];
  const ticketBranchPolicyErrors = [];
  const modmailCommandPolicyErrors = [];
  const checkRoleEntries = (roleEntries, location, errors = rolePolicyErrors, options = {}) => {
    if (!Array.isArray(roleEntries)) {
      errors.push(`${location} must be an array of rank names or role IDs`);
      return;
    }

    for (const entry of roleEntries) {
      if (options.requireLevel && !options.allowPlainRole && !/^(?:\d+|M|I),.+/.test(String(entry || '').trim())) {
        errors.push(`${location} entry ${entry} must use number,role, M,role, or I,role format, such as 1,moderation, M,hr, or I,internals`);
        continue;
      }
      const roleIds = options.requireLevel ? [roleIdForPolicyEntry(entry)].filter(Boolean) : roleIdsForPolicyEntry(entry);
      if (!roleIds.length) {
        errors.push(`${location} references unknown rank or role ID ${entry}`);
      }
    }
  };
  const checkPolicyRoleEntries = (roleEntries, location, errors = rolePolicyErrors) => {
    if (!Array.isArray(roleEntries)) {
      errors.push(`${location} must be an array of rank names or role IDs`);
      return;
    }

    for (const entry of roleEntries) {
      if (!roleIdsForPolicyEntry(entry).length) {
        errors.push(`${location} references unknown rank or role ID ${entry}`);
      }
    }
  };

  for (const [rankName, roleId] of Object.entries(ROLE_POLICY.roles || {})) {
    if (typeof roleId !== 'string' || !rolePolicyValueParts(roleId).roleId) {
      rolePolicyErrors.push(`roles.${rankName} must be a non-empty Discord role ID`);
    }
  }
  for (const [roleName, roleId] of Object.entries(ROLE_POLICY.wingRoleIds || {})) {
    if (typeof roleId !== 'string' || !rolePolicyValueParts(roleId).roleId) {
      rolePolicyErrors.push(`wingRoleIds.${roleName} must be a non-empty Discord role ID`);
    }
  }
  for (const [roleName, roleId] of Object.entries(ROLE_POLICY.staffRoleIds || {})) {
    if (typeof roleId !== 'string' || !rolePolicyValueParts(roleId).roleId) {
      rolePolicyErrors.push(`staffRoleIds.${roleName} must be a non-empty Discord role ID`);
    }
  }
  if (ROLE_POLICY.leadCategoryRole && !rolePolicyValueParts(ROLE_POLICY.leadCategoryRole).roleId) {
    rolePolicyErrors.push('leadCategoryRole must be a Discord role ID when set');
  }

  if (Array.isArray(ROLE_POLICY.staffHierarchy)) {
    checkRoleEntries(ROLE_POLICY.staffHierarchy, 'staffHierarchy', rolePolicyErrors, { requireLevel: true });
  } else if (ROLE_POLICY.staffHierarchy && typeof ROLE_POLICY.staffHierarchy === 'object') {
    for (const wingId of WING_ORDER) {
      checkRoleEntries(ROLE_POLICY.staffHierarchy[wingId], `staffHierarchy.${wingId}`, rolePolicyErrors, { requireLevel: true, allowPlainRole: wingId === 'internals' });
    }
  } else {
    rolePolicyErrors.push('staffHierarchy must be an array or an object keyed by wing');
  }
  checkRoleEntries(ROLE_POLICY.demoteExempt || [], 'demoteExempt');
  for (const departmentId of Object.keys(DEPARTMENTS)) {
    for (const roleType of ['ping', 'reply', 'close']) {
      checkPolicyRoleEntries(TICKET_BRANCH_POLICY[departmentId]?.[roleType], `${departmentId}.${roleType}`, ticketBranchPolicyErrors);
    }
  }
  for (const [commandName, rankNames] of Object.entries(ROLE_POLICY.commands || {})) {
    checkPolicyRoleEntries(rankNames, `commands.${commandName}`);
  }

  const configuredBranches = new Set(Object.keys(DEPARTMENTS));
  const configuredTicketPermissions = new Set(Object.keys(MODMAIL_COMMAND_POLICY.ticketPermissionReferences || {}));
  for (const permission of configuredTicketPermissions) {
    for (const branchId of configuredBranches) {
      if (!Array.isArray(TICKET_BRANCH_POLICY[branchId]?.[permission])) {
        modmailCommandPolicyErrors.push(`ticketPermissionReferences.${permission} does not resolve to ${branchId}.${permission} in ${TICKET_BRANCH_POLICY_FILE}`);
      }
    }
  }
  const checkModmailCommand = (commandPolicy, location) => {
    if (!commandPolicy || typeof commandPolicy !== 'object' || Array.isArray(commandPolicy)) {
      modmailCommandPolicyErrors.push(`${location} must be an object`);
      return;
    }
    if (!['staff', 'ticket'].includes(commandPolicy.scope)) {
      modmailCommandPolicyErrors.push(`${location}.scope must be staff or ticket`);
    }
    if (commandPolicy.ticketPermission && !configuredTicketPermissions.has(commandPolicy.ticketPermission)) {
      modmailCommandPolicyErrors.push(`${location}.ticketPermission references unknown ticket permission ${commandPolicy.ticketPermission}`);
    }
    if (commandPolicy.rolePolicyCommand && !ROLE_POLICY.commands?.[commandPolicy.rolePolicyCommand]) {
      modmailCommandPolicyErrors.push(`${location}.rolePolicyCommand references unknown role policy command ${commandPolicy.rolePolicyCommand}`);
    }
    if (commandPolicy.capabilityOverride && !ROLE_POLICY.commands?.[commandPolicy.capabilityOverride]) {
      modmailCommandPolicyErrors.push(`${location}.capabilityOverride references unknown role policy command ${commandPolicy.capabilityOverride}`);
    }
    if (commandPolicy.allowedBranches && !Array.isArray(commandPolicy.allowedBranches)) {
      modmailCommandPolicyErrors.push(`${location}.allowedBranches must be an array`);
    } else {
      for (const branchId of commandPolicy.allowedBranches || []) {
        if (!configuredBranches.has(branchId)) {
          modmailCommandPolicyErrors.push(`${location}.allowedBranches references unknown branch ${branchId}`);
        }
      }
    }
    if (commandPolicy.targetBranch && !configuredBranches.has(commandPolicy.targetBranch)) {
      modmailCommandPolicyErrors.push(`${location}.targetBranch references unknown branch ${commandPolicy.targetBranch}`);
    }
    for (const [branchId, permissions] of Object.entries(commandPolicy.ticketPermissionsByBranch || {})) {
      if (!configuredBranches.has(branchId)) {
        modmailCommandPolicyErrors.push(`${location}.ticketPermissionsByBranch references unknown branch ${branchId}`);
      }
      if (!Array.isArray(permissions) || !permissions.length) {
        modmailCommandPolicyErrors.push(`${location}.ticketPermissionsByBranch.${branchId} must list at least one ticket permission`);
        continue;
      }
      for (const permission of permissions) {
        if (!configuredTicketPermissions.has(permission)) {
          modmailCommandPolicyErrors.push(`${location}.ticketPermissionsByBranch.${branchId} references unknown ticket permission ${permission}`);
        }
      }
    }
  };
  const prefixPolicies = MODMAIL_COMMAND_POLICY.prefixCommands || {};
  const expectedPrefixCommands = Object.keys(COMMANDS).filter((commandKey) => commandKey !== 'previewPrefix');
  for (const commandKey of expectedPrefixCommands) {
    const policy = prefixPolicies[commandKey];
    if (!policy) {
      modmailCommandPolicyErrors.push(`prefixCommands.${commandKey} is missing`);
      continue;
    }
    if (policy.commandKey !== commandKey) {
      modmailCommandPolicyErrors.push(`prefixCommands.${commandKey}.commandKey must be ${commandKey}`);
    }
    checkModmailCommand(policy, `prefixCommands.${commandKey}`);
  }
  for (const [snippetKey, policy] of Object.entries(MODMAIL_COMMAND_POLICY.savedSnippetCommands || {})) {
    if (!SAVED_SNIPPETS[snippetKey]) {
      modmailCommandPolicyErrors.push(`savedSnippetCommands.${snippetKey} does not exist in ${SAVED_SNIPPETS_FILE}`);
    }
    checkModmailCommand(policy, `savedSnippetCommands.${snippetKey}`);
  }
  for (const snippetKey of Object.keys(SAVED_SNIPPETS)) {
    if (!MODMAIL_COMMAND_POLICY.savedSnippetCommands?.[snippetKey]) {
      modmailCommandPolicyErrors.push(`savedSnippetCommands.${snippetKey} is missing`);
    }
  }
  for (const commandName of ['close', 'transfer']) {
    if (!MODMAIL_COMMAND_POLICY.slashCommands?.[commandName]) {
      modmailCommandPolicyErrors.push(`slashCommands.${commandName} is missing`);
    }
  }
  for (const [commandName, policy] of Object.entries(MODMAIL_COMMAND_POLICY.slashCommands || {})) {
    checkModmailCommand(policy, `slashCommands.${commandName}`);
  }

  if (rolePolicyErrors.length) {
    throw new Error(`Invalid role policy at ${ROLE_POLICY_FILE}: ${rolePolicyErrors.join('; ')}`);
  }
  if (ticketBranchPolicyErrors.length) {
    throw new Error(`Invalid ticket branch policy at ${TICKET_BRANCH_POLICY_FILE}: ${ticketBranchPolicyErrors.join('; ')}`);
  }
  if (modmailCommandPolicyErrors.length) {
    throw new Error(`Invalid modmail command policy at ${MODMAIL_COMMAND_POLICY_FILE}: ${modmailCommandPolicyErrors.join('; ')}`);
  }
}

function staffRoleHierarchyIds(wingId = null) {
  if (wingId) return [...new Set(sortedStaffHierarchyPartsForWing(wingId).map((entry) => entry.roleId))];
  return [...new Set(WING_ORDER
    .flatMap((staffWingId) => sortedStaffHierarchyPartsForWing(staffWingId).map((entry) => entry.roleId)))];
}

function roleIdsFor(departmentId, roleType) {
  return roleIdsForRankNames(TICKET_BRANCH_POLICY[normalizeDepartmentId(departmentId)]?.[roleType]);
}

function modmailPrefixCommandPolicy(commandKey) {
  return MODMAIL_COMMAND_POLICY.prefixCommands?.[commandKey] || null;
}

function savedSnippetCommandPolicy(snippet) {
  const snippetKey = Object.entries(SAVED_SNIPPETS).find(([, candidate]) => candidate === snippet)?.[0];
  return snippetKey ? MODMAIL_COMMAND_POLICY.savedSnippetCommands?.[snippetKey] || null : null;
}

function commandCanRunInTicketBranch(commandPolicy, departmentId) {
  const normalizedDepartmentId = normalizeDepartmentId(departmentId);
  return !commandPolicy?.allowedBranches
    || commandPolicy.allowedBranches.some((branch) => normalizeDepartmentId(branch) === normalizedDepartmentId);
}

function ticketPermissionNamesForCommand(commandPolicy, departmentId) {
  const normalizedDepartmentId = normalizeDepartmentId(departmentId);
  return commandPolicy?.ticketPermissionsByBranch?.[normalizedDepartmentId]
    || (commandPolicy?.ticketPermission ? [commandPolicy.ticketPermission] : []);
}

function ticketRoleIdsForCommand(commandPolicy, departmentId) {
  return [...new Set(ticketPermissionNamesForCommand(commandPolicy, departmentId)
    .flatMap((permission) => roleIdsFor(departmentId, permission)))];
}

function ticketRankNamesForCommand(commandPolicy, departmentId) {
  const normalizedDepartmentId = normalizeDepartmentId(departmentId);
  return [...new Set(ticketPermissionNamesForCommand(commandPolicy, departmentId)
    .flatMap((permission) => TICKET_BRANCH_POLICY[normalizedDepartmentId]?.[permission] || []))];
}

function roleIdsForRankNames(rankNames) {
  if (!Array.isArray(rankNames)) return [];

  return [...new Set(rankNames
    .flatMap((rankName) => roleIdsForPolicyEntry(rankName))
    .filter(Boolean))];
}

function commandRoleIds(commandName) {
  return roleIdsForRankNames(ROLE_POLICY.commands?.[commandName]);
}

function pbanVoteRankForHierarchyPart(part) {
  if (!part?.roleId || part.wingId === 'partnership') return null;
  if (part.wingId === 'assistants' && !part.isLead && part.level === 1) return '1,assistants';
  if (part.wingId === 'assistants' && part.isLead) return 'M,assistants';
  if (part.wingId === 'moderation' && !part.isLead && part.level === 1) return '1,moderation';
  if (part.wingId === 'hr' && !part.isLead && part.level === 1) return '1,hr';
  if (part.wingId === 'hr' && part.isLead) return 'M,hr';
  return 'staff';
}

function pbanVoteWeight(rank) {
  return {
    assistant: 2,
    brew: 3,
    elevated: 6,
    '1,assistants': 2,
    'M,assistants': 3,
    '1,moderation': 3,
    '1,hr': 2,
    'M,hr': 4,
    staff: 6
  }[rank] || 0;
}

function highestPbanVote(member) {
  return allStaffHierarchyParts()
    .filter((part) => member.roles.cache.has(part.roleId))
    .map((part) => pbanVoteRankForHierarchyPart(part))
    .filter(Boolean)
    .map((rank) => ({ rank, weight: pbanVoteWeight(rank) }))
    .filter((vote) => vote.weight > 0)
    .sort((a, b) => b.weight - a.weight)[0] || null;
}

function memberCanStartPban(member) {
  return memberHasAnyCachedRole(member, [
    ...staffRoleHierarchyIds('moderation'),
    ...staffRoleHierarchyIds('hr'),
    ...staffRoleHierarchyIds('internals')
  ]);
}

function memberCanVotePban(member) {
  return Boolean(highestPbanVote(member));
}

function demoteExemptRoleIds() {
  return roleIdsForRankNames(ROLE_POLICY.demoteExempt);
}

function globalTicketCommandBypassRoleIds() {
  return staffRoleHierarchyIds('internals');
}

function allPolicyRoleIds() {
  return [...new Set([
    ...Object.values(ROLE_POLICY.roles || {}),
    ...Object.values(ROLE_POLICY.wingRoleIds || {}),
    ...Object.values(ROLE_POLICY.staffRoleIds || {})
  ].map((roleId) => rolePolicyValueParts(roleId).roleId).filter(Boolean))];
}

function allConfiguredStaffRoleIds() {
  return [...new Set([
    ...allPolicyRoleIds(),
    ...staffRoleHierarchyIds()
  ])];
}

function allConfiguredRoleIdsForDiagnostics() {
  return [...new Set([
    ...allConfiguredStaffRoleIds(),
    ...categoryRoleIds(),
    leadCategoryRoleId()
  ].filter(Boolean))];
}

function pbanProtectedTargetRoleIds() {
  return [...new Set([
    ...allConfiguredStaffRoleIds(),
    ...PBAN_PROTECTED_ROLE_IDS
  ])];
}

function allBreakRemovableStaffRoleIds() {
  return [...new Set([
    ...staffRoleHierarchyIds(),
    ...allConfiguredStaffRoleIds()
  ])];
}

async function memberHasAnyRole(guildId, userId, roleIds) {
  if (!roleIds.length) return false;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return false;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return false;

  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

async function memberCanUsePrefixRoles(guildId, userId, roleIds) {
  return await memberHasAnyRole(guildId, userId, globalTicketCommandBypassRoleIds())
    || await memberHasAnyRole(guildId, userId, roleIds);
}

async function memberCanUsePrefixWithRoles(message, roleIds) {
  return memberCanUsePrefixRoles(message.guild.id, message.author.id, roleIds);
}

async function memberCanUsePolicyCommand(guildId, userId, commandName) {
  return memberHasAnyRole(guildId, userId, commandRoleIds(commandName));
}

async function memberCanBypassTicketCommandPolicy(guildId, userId) {
  return memberHasAnyRole(guildId, userId, globalTicketCommandBypassRoleIds());
}

async function commandCanRunInTicketBranchForMember(message, commandPolicy, departmentId) {
  return commandCanRunInTicketBranch(commandPolicy, departmentId)
    || await memberCanBypassTicketCommandPolicy(message.guild.id, message.author.id);
}

async function memberCanUseClaimedTicketCommands(guildId, userId, ticket) {
  if (ticket.claimedByStaffUserId === userId) return true;
  return memberCanUsePolicyCommand(guildId, userId, 'overrideClaims');
}

function ticketChannelName(userId, username, departmentId) {
  const department = departmentFor(departmentId);
  const safeName = username
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 18) || 'user';

  return `${department?.channelPrefix || 'ticket'}-${safeName}-${userId.slice(-4)}`;
}

function ticketTitle(user, departmentId) {
  return ticketChannelName(user.id, user.username, departmentId);
}

function styledEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(STYLE_COLOR)
    .setTitle(`${TITLE_PREFIX} ${title}`)
    .setDescription(description)
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function previewCommand(command) {
  return `${SNIPPET_PREVIEW_PREFIX}${command.replace(/^\?/, '')}`;
}

const SNIPPETS = [
  PARTNERSHIP_AD_COMMAND,
  REPLY_PREFIX,
  SNIPPETS_COMMAND,
  `${TIMED_CLOSE_COMMAND} <time>`,
  REPORT_FINISHED_COMMAND,
  ...Object.values(SAVED_SNIPPETS).map((snippet) => snippet.command),
  ...CLAIM_COMMAND_ALIASES,
  UNCLAIM_COMMAND,
  CANCEL_CLOSE_COMMAND,
  TIMER_COMMAND,
  `${NOTE_COMMAND} <text>`,
  USER_INFO_COMMAND,
  `${TRANSFER_COMMAND} <wing>`,
  `${RENAME_COMMAND} <name>`,
  `${PRIORITY_COMMAND} <low|normal|high|urgent>`,
  TRANSCRIPT_COMMAND,
  CLAIM_INFO_COMMAND,
  CLOSE_INFO_COMMAND,
  ESCALATE_COMMAND,
  `${SNIPPETS_COMMAND} <command> perms`,
  `${HELP_COMMAND} <command>`
];

const TICKET_PREFIX_COMMANDS = [
  PARTNERSHIP_AD_COMMAND,
  REPLY_PREFIX,
  SNIPPETS_COMMAND,
  HELP_COMMAND,
  TIMED_CLOSE_COMMAND,
  REPORT_FINISHED_COMMAND,
  ...Object.values(SAVED_SNIPPETS).map((snippet) => snippet.command),
  ...CLAIM_COMMAND_ALIASES,
  UNCLAIM_COMMAND,
  CANCEL_CLOSE_COMMAND,
  TIMER_COMMAND,
  NOTE_COMMAND,
  USER_INFO_COMMAND,
  TRANSFER_COMMAND,
  RENAME_COMMAND,
  PRIORITY_COMMAND,
  TRANSCRIPT_COMMAND,
  CLAIM_INFO_COMMAND,
  CLOSE_INFO_COMMAND,
  ESCALATE_COMMAND
];

function matchesCommand(text, command) {
  return new RegExp(`^${escapeRegExp(command)}(?:\\s|$)`, 'i').test(text);
}

function matchesExactCommand(text, commands) {
  return commands.some((command) => new RegExp(`^${escapeRegExp(command)}$`, 'i').test(text));
}

function isTicketPrefixCommand(text) {
  return TICKET_PREFIX_COMMANDS.some((command) =>
    matchesCommand(text, command) || matchesCommand(text, previewCommand(command))
  );
}

const TIMER_PRESERVING_PREFIX_COMMANDS = [
  TIMED_CLOSE_COMMAND,
  SNIPPETS_COMMAND,
  HELP_COMMAND,
  TIMER_COMMAND,
  USER_INFO_COMMAND,
  TRANSCRIPT_COMMAND,
  CLAIM_INFO_COMMAND,
  CLOSE_INFO_COMMAND
];

function shouldCancelTimedCloseForPrefixCommand(text) {
  return isTicketPrefixCommand(text)
    && !TIMER_PRESERVING_PREFIX_COMMANDS.some((command) => matchesCommand(text, command))
    && !TICKET_PREFIX_COMMANDS.some((command) => matchesCommand(text, previewCommand(command)));
}

function snippetsEmbed() {
  return styledEmbed('Snippets', SNIPPETS.map((snippet) => `• ${snippet.replace(/^\?/, '')}`).join('\n'));
}

function normalizedPrefixCommandName(command) {
  return command.replace(/^\?/, '').toLowerCase();
}

function prefixCommandPermissionLookup(commandName) {
  const normalizedName = normalizedPrefixCommandName(commandName);
  for (const [commandKey, commandPolicy] of Object.entries(MODMAIL_COMMAND_POLICY.prefixCommands || {})) {
    const commandNames = [
      COMMANDS[commandKey],
      ...(commandPolicy.aliases || [])
    ].filter(Boolean);
    if (commandNames.some((command) => normalizedPrefixCommandName(command) === normalizedName)) {
      return { command: commandNames[0], commandPolicy };
    }
  }

  for (const [snippetKey, commandPolicy] of Object.entries(MODMAIL_COMMAND_POLICY.savedSnippetCommands || {})) {
    const command = SAVED_SNIPPETS[snippetKey]?.command;
    if (command && normalizedPrefixCommandName(command) === normalizedName) {
      return { command, commandPolicy };
    }
  }

  return null;
}

function formatRankNames(rankNames) {
  return rankNames.length
    ? rankNames.map((rankName) => {
      const roleId = roleIdForPolicyEntry(rankName);
      return roleId ? `<@&${roleId}>` : `**${rankName}**`;
    }).join(', ')
    : '*none configured*';
}

function snippetPermissionsEmbed(commandName) {
  const lookup = prefixCommandPermissionLookup(commandName);
  if (!lookup) {
    return styledEmbed('Permissions Not Found', `I could not find **${commandName}**. Use **${SNIPPETS_COMMAND}** to list available commands.`);
  }

  const { command, commandPolicy } = lookup;
  const lines = [];
  if (commandPolicy.rolePolicyCommand) {
    lines.push(`**Allowed Roles:** ${formatRankNames(ROLE_POLICY.commands?.[commandPolicy.rolePolicyCommand] || [])}`);
  } else {
    const departmentIds = commandPolicy.allowedBranches || Object.keys(DEPARTMENTS);
    for (const departmentId of departmentIds) {
      lines.push(`**${departmentFor(departmentId)?.label || departmentId}:** ${formatRankNames(ticketRankNamesForCommand(commandPolicy, departmentId))}`);
    }
  }

  if (commandPolicy.capabilityOverride) {
    lines.push('', `**Override Roles:** ${formatRankNames(ROLE_POLICY.commands?.[commandPolicy.capabilityOverride] || [])}`);
  }

  return styledEmbed(`Permissions: ${normalizedPrefixCommandName(command)}`, lines.join('\n'));
}

const COMMAND_HELP = {
  ad: `Use **${PARTNERSHIP_AD_COMMAND}** in a partnership or internals ticket to send the saved partnership introduction and advertisement to the user.`,
  r: `Use **${REPLY_PREFIX} <response>** to send a staff reply to the user who opened the ticket.`,
  s: `Use **${SNIPPETS_COMMAND}** to list the available snippets. Use **${SNIPPETS_COMMAND} <command> perms** to list the roles allowed to use a command.`,
  close: `Use **${TIMED_CLOSE_COMMAND} <time>** to send the saved closing warning and close the ticket automatically after that many minutes. A new message from the user or staff activity in the ticket cancels the timer.`,
  repfin: `Use **${REPORT_FINISHED_COMMAND}** in a moderation or internals ticket to send the saved investigation response to the user.`,
  c: `Use **${CLAIM_COMMAND}** or **?claim** to mark yourself as the staff member handling a ticket.`,
  claim: `Use **${CLAIM_COMMAND}** or **?claim** to mark yourself as the staff member handling a ticket.`,
  unclaim: `Use **${UNCLAIM_COMMAND}** to release a claimed ticket.`,
  cancelclose: `Use **${CANCEL_CLOSE_COMMAND}** to remove an active timed-close deadline.`,
  timer: `Use **${TIMER_COMMAND}** to view the remaining timed-close duration.`,
  note: `Use **${NOTE_COMMAND} <text>** to add an explicit internal transcript note.`,
  id: `Use **${USER_INFO_COMMAND}** to show details about the ticket opener.`,
  transfer: `Use **${TRANSFER_COMMAND} <wing>** to transfer a ticket. Wings: internals, hr, partnership, moderation, assistants.`,
  rename: `Use **${RENAME_COMMAND} <name>** to rename the staff ticket channel.`,
  priority: `Use **${PRIORITY_COMMAND} <low|normal|high|urgent>** to set ticket priority. Use **${PRIORITY_COMMAND}** to view the current level.`,
  transcript: `Use **${TRANSCRIPT_COMMAND}** to generate a transcript preview without closing the ticket.`,
  claiminfo: `Use **${CLAIM_INFO_COMMAND}** to view the ticket claimant and claim time.`,
  closeinfo: `Use **${CLOSE_INFO_COMMAND}** to view the scheduled close timestamp and remaining time.`,
  escalate: `Use **${ESCALATE_COMMAND}** to transfer the ticket to internals and ping its configured ping roles.`,
  h: `Use **${HELP_COMMAND} <command>** to view a command description.`
};

for (const [key, snippet] of Object.entries(SAVED_SNIPPETS)) {
  requiredCommandValue(snippet.command, `${key}.command`);
  if (typeof snippet.message !== 'string' || !snippet.message.trim()) {
    throw new Error(`Invalid saved snippet message for ${key} in ${SAVED_SNIPPETS_FILE}.`);
  }
  COMMAND_HELP[key] = snippet.description;
}

async function handleHelpCommand(message, commandName) {
  const canUseHelp = await memberCanUsePrefixWithRoles(message, commandRoleIds('help'));
  if (!canUseHelp) {
    await message.reply({
      embeds: [styledEmbed('Help Not Available', 'You need a staff hierarchy role to use this command.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const key = commandName.replace(/^[?!]+/, '').toLowerCase();
  if (!key) {
    await message.reply({
      embeds: [styledEmbed('Help: h', COMMAND_HELP.h)],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  if (key === 'h') {
    await message.reply({
      content: 'hhhhhhhhhhhhhh wtf are u doing bro',
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const description = COMMAND_HELP[key];
  if (!description) {
    await message.reply({
      embeds: [styledEmbed('Help Not Found', `Use **${HELP_COMMAND} <command>** with one of: **${Object.keys(COMMAND_HELP).join('**, **')}**.`)],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  await message.reply({
    embeds: [styledEmbed(`Help: ${key}`, description)],
    allowedMentions: { repliedUser: false, parse: [] }
  });
}

async function handleSnippetPermissionsCommand(message, commandName) {
  const canListSnippets = await memberCanUsePrefixWithRoles(message, commandRoleIds('snippets'));
  if (!canListSnippets) {
    await message.reply({
      embeds: [styledEmbed('Permissions Not Available', 'You need a staff hierarchy role to use this command.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  if (!commandName) {
    await message.reply({
      embeds: [styledEmbed('Permissions', `Use **${SNIPPETS_COMMAND} <command> perms**, such as **${SNIPPETS_COMMAND} r perms** or **${SNIPPETS_COMMAND} ad perms**.`)],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  await message.reply({
    embeds: [snippetPermissionsEmbed(commandName)],
    allowedMentions: { repliedUser: false, parse: [] }
  });
}

function departmentRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('modmail_department')
      .setPlaceholder('Select a wing...')
    .addOptions(
      WING_ORDER.map((value) => {
        const department = DEPARTMENTS[value];
        return new StringSelectMenuOptionBuilder()
          .setLabel(department.label)
          .setDescription(department.description)
          .setValue(value);
      })
    );

  return new ActionRowBuilder().addComponents(menu);
}

function supportPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SUPPORT_PANEL_BUTTON_ID)
      .setLabel('open a ticket!')
      .setStyle(ButtonStyle.Primary)
  );
}

function attachmentUrlsFromMessage(message) {
  return message.attachments.map((attachment) => attachment.url);
}

function attachmentDataFromMessage(message) {
  return message.attachments.map((attachment) => ({
    url: attachment.url,
    contentType: attachment.contentType || '',
    name: attachment.name || ''
  }));
}

function isImageAttachment(attachment) {
  if (attachment.contentType?.startsWith('image/')) return true;
  return /\.(?:png|jpe?g|gif|webp)$/i.test(attachment.url || attachment.name || '');
}

function normalizeAttachments(attachments = []) {
  return attachments.map((attachment) => (
    typeof attachment === 'string'
      ? { url: attachment, contentType: '', name: '' }
      : attachment
  )).filter((attachment) => attachment?.url);
}

function attachmentLines(attachments) {
  const linkAttachments = normalizeAttachments(attachments);
  if (!linkAttachments.length) return '';

  return [
    '',
    '**Attachments**',
    ...linkAttachments.map((attachment) => `• ${attachment.url}`)
  ].join('\n');
}

function messageBodyFromParts(content, attachments, fallback) {
  const body = trimTo(content?.trim(), 3400);
  const linkedAttachments = normalizeAttachments(attachments)
    .filter((attachment) => !isImageAttachment(attachment));
  const attachmentText = attachmentLines(linkedAttachments);
  return `${body || fallback}${attachmentText}`.slice(0, 3900);
}

function messageBody(message, fallback) {
  return messageBodyFromParts(message.content, attachmentDataFromMessage(message), fallback);
}

function firstImageAttachment(attachments) {
  return normalizeAttachments(attachments).find(isImageAttachment) || null;
}

function imageAttachments(attachments) {
  return normalizeAttachments(attachments).filter(isImageAttachment);
}

function modmailMessageEmbed({ title, content, attachments, fallback, author }) {
  const embed = styledEmbed(title, messageBodyFromParts(content, attachments, fallback));
  const imageAttachment = firstImageAttachment(attachments);

  if (author) {
    embed.setAuthor(author);
  }

  if (imageAttachment) {
    embed.setImage(imageAttachment.url);
  }

  return embed;
}

function modmailMessageEmbeds({ title, content, attachments, fallback, author }) {
  const images = imageAttachments(attachments);
  if (!images.length) {
    return [modmailMessageEmbed({ title, content, attachments, fallback, author })];
  }

  const nonImageAttachments = normalizeAttachments(attachments).filter((attachment) => !isImageAttachment(attachment));
  const embeds = [
    modmailMessageEmbed({ title, content, attachments: [images[0], ...nonImageAttachments], fallback, author })
  ];

  for (const attachment of images.slice(1)) {
    embeds.push(styledEmbed('Attachment', '\u200b').setImage(attachment.url));
  }

  return embeds;
}

async function sendEmbedsAsMessages(channel, embeds, options = {}) {
  const { firstMessageContent, ...messageOptions } = options;

  for (const [index, embed] of embeds.entries()) {
    await channel.send({
      ...messageOptions,
      content: index === 0 ? firstMessageContent : undefined,
      embeds: [embed]
    });
  }
}

function containsDiscordInvite(content) {
  return DISCORD_INVITE_PATTERN.test(content || '');
}

async function readPartnershipAd() {
  const ad = await fs.readFile(PARTNERSHIP_AD_FILE, 'utf8');
  return ad.trim();
}

function splitPlainTextMessage(text, maxLength = 1900) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const splitAt = remaining.lastIndexOf('\n', maxLength);
    const end = splitAt > 500 ? splitAt : maxLength;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

async function sendPlainTextMessages(channel, text, options = {}) {
  for (const chunk of splitPlainTextMessage(text)) {
    await channel.send({
      ...options,
      content: chunk
    });
  }
}

async function loadState() {
  if (!existsSync(STATE_FILE)) {
    await saveState();
    return;
  }

  const raw = await fs.readFile(STATE_FILE, 'utf8');
  state = {
    ticketsByUserId: {},
    pendingByUserId: {},
    strikesByUserId: {},
    pbanProposalsByMessageId: {},
    banProfilesByGuildUser: {},
    ...JSON.parse(raw)
  };
}

async function saveState() {
  await fs.mkdir('./data', { recursive: true });
  await fs.writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function banProfileKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function banProfileFor(guildId, userId) {
  return state.banProfilesByGuildUser?.[banProfileKey(guildId, userId)] || null;
}

function imageProofDataFromAttachment(attachment) {
  return {
    url: attachment.url,
    contentType: attachment.contentType || '',
    name: attachment.name || '',
    addedAt: Date.now()
  };
}

function upsertBanProfile(guildId, user, fields = {}) {
  state.banProfilesByGuildUser ||= {};
  const key = banProfileKey(guildId, user.id);
  const existing = state.banProfilesByGuildUser[key] || {
    guildId,
    userId: user.id,
    userTag: user.tag || user.username || 'Unknown User',
    proofUrls: [],
    createdAt: Date.now()
  };

  const proofUrls = [
    ...normalizeAttachments(existing.proofUrls || []),
    ...normalizeAttachments(fields.proofUrls || [])
  ];
  const seenProofUrls = new Set();

  state.banProfilesByGuildUser[key] = {
    ...existing,
    ...fields,
    guildId,
    userId: user.id,
    userTag: fields.userTag || existing.userTag || user.tag || user.username || 'Unknown User',
    proofUrls: proofUrls.filter((proof) => {
      if (seenProofUrls.has(proof.url)) return false;
      seenProofUrls.add(proof.url);
      return true;
    }),
    updatedAt: Date.now()
  };

  return state.banProfilesByGuildUser[key];
}

function auditEntryForBan(auditEntries, userId) {
  return auditEntries.find((entry) => entry.target?.id === userId || entry.targetId === userId) || null;
}

function banSourceLabel(source) {
  if (source === 'pban') return 'PBAN';
  if (source === 'anti_bot_automod') return 'Anti-bot automod';
  return 'Server ban list';
}

async function fetchRecentBanAuditEntries(guild) {
  const logs = await guild.fetchAuditLogs({
    type: AuditLogEvent.MemberBanAdd,
    limit: 100
  }).catch((error) => {
    console.error('Could not fetch ban audit logs:', error);
    return null;
  });

  return [...(logs?.entries?.values() || [])];
}

async function syncGuildBans(guild) {
  if (banSyncRunning) return;
  banSyncRunning = true;
  try {
    const bans = await guild.bans.fetch().catch((error) => {
      console.error('Could not fetch server ban list:', error);
      return null;
    });
    if (!bans) return;

    const auditEntries = await fetchRecentBanAuditEntries(guild);
    let changed = false;

    for (const ban of bans.values()) {
      const auditEntry = auditEntryForBan(auditEntries, ban.user.id);
      const profile = banProfileFor(guild.id, ban.user.id);
      const executor = auditEntry?.executor || null;
      const fields = {
        reason: ban.reason || auditEntry?.reason || profile?.reason || 'No reason provided',
        bannedAt: auditEntry?.createdTimestamp || profile?.bannedAt || null,
        banSource: profile?.banSource || 'server_ban_list',
        lastSeenBannedAt: Date.now()
      };

      if (executor) {
        fields.bannedByUserId = executor.id;
        fields.bannedByTag = executor.tag;
        fields.bannedByBot = executor.bot;
      }

      upsertBanProfile(guild.id, ban.user, fields);
      changed = true;
    }

    if (changed) await saveState();
  } finally {
    banSyncRunning = false;
  }
}

function banProfileEmbed(profile) {
  return styledEmbed(
    'Confirmed Ban',
    [
      `**Person:** <@${profile.userId}> (\`${profile.userId}\`)`,
      `**User Tag:** ${profile.userTag || 'Unknown'}`,
      `**Reason:** ${trimTo(profile.reason || 'No reason provided', 1000)}`,
      `**Banned By:** ${profile.bannedByUserId ? `<@${profile.bannedByUserId}> (${profile.bannedByTag || profile.bannedByUserId})` : 'Unknown'}`,
      `**Source:** ${banSourceLabel(profile.banSource)}`,
      `**Banned At:** ${profile.bannedAt ? `<t:${Math.floor(profile.bannedAt / 1000)}:F>` : 'Unknown'}`,
      `**Proof Screenshots:** ${profile.proofUrls?.length || 0}`
    ].join('\n')
  );
}

async function sendBanProofReplies(message, proofUrls) {
  const screenshots = normalizeAttachments(proofUrls);
  if (!screenshots.length) return;

  for (let index = 0; index < screenshots.length; index += 10) {
    const group = screenshots.slice(index, index + 10);
    await message.reply({
      files: group.map((proof, fileIndex) => ({
        attachment: proof.url,
        name: proof.name || `proof-${index + fileIndex + 1}.png`
      })),
      allowedMentions: { repliedUser: false, parse: [] }
    });
  }
}

function validDiscordUserId(userId) {
  return /^\d{17,20}$/.test(userId || '');
}

async function ensureBanProfileForUser(guild, userId) {
  const existing = banProfileFor(guild.id, userId);
  if (existing) return existing;

  const ban = await guild.bans.fetch(userId).catch(() => null);
  if (!ban) return null;

  const auditEntry = auditEntryForBan(await fetchRecentBanAuditEntries(guild), userId);
  const executor = auditEntry?.executor || null;
  return upsertBanProfile(guild.id, ban.user, {
    reason: ban.reason || auditEntry?.reason || 'No reason provided',
    bannedAt: auditEntry?.createdTimestamp || null,
    bannedByUserId: executor?.id || null,
    bannedByTag: executor?.tag || null,
    bannedByBot: executor?.bot || false,
    banSource: 'server_ban_list',
    lastSeenBannedAt: Date.now()
  });
}

async function addProofToBanProfile({ guild, userId, screenshots, addedBy }) {
  const profile = await ensureBanProfileForUser(guild, userId);
  if (!profile) {
    return { ok: false, message: 'I could not find that user in the server ban list.' };
  }

  upsertBanProfile(guild.id, {
    id: profile.userId,
    tag: profile.userTag
  }, {
    proofUrls: screenshots.map(imageProofDataFromAttachment),
    lastProofAddedByUserId: addedBy.id,
    lastProofAddedByTag: addedBy.tag,
    lastProofAddedAt: Date.now()
  });
  await saveState();

  const updated = banProfileFor(guild.id, userId);
  return {
    ok: true,
    message: `Added ${screenshots.length} proof screenshot${screenshots.length === 1 ? '' : 's'} for \`${userId}\`. This ban now has ${updated.proofUrls.length} proof screenshot${updated.proofUrls.length === 1 ? '' : 's'}.`
  };
}

function addProofUploadKey(guildId, channelId, userId) {
  return `${guildId}:${channelId}:${userId}`;
}

function clearPendingAddProofUpload(key) {
  const pending = pendingAddProofUploads.get(key);
  if (pending?.timeout) clearTimeout(pending.timeout);
  pendingAddProofUploads.delete(key);
}

function setPendingAddProofUpload({ guild, channel, user, targetUserId }) {
  const key = addProofUploadKey(guild.id, channel.id, user.id);
  clearPendingAddProofUpload(key);

  const timeout = setTimeout(() => {
    pendingAddProofUploads.delete(key);
  }, addProofUploadTimeoutMs);

  pendingAddProofUploads.set(key, {
    guildId: guild.id,
    channelId: channel.id,
    userId: user.id,
    targetUserId,
    timeout,
    createdAt: Date.now()
  });
}

async function handleAddProofUpload(message) {
  const key = addProofUploadKey(message.guild.id, message.channel.id, message.author.id);
  const pending = pendingAddProofUploads.get(key);
  if (!pending) return false;

  const imageUploads = attachmentDataFromMessage(message).filter(isImageAttachment);
  const screenshots = imageUploads.slice(0, 10);
  if (!screenshots.length) {
    await message.reply({
      content: 'Attach screenshot image files to this message. You can upload up to 10 at once.',
      allowedMentions: { repliedUser: false, parse: [] }
    }).catch(() => null);
    return true;
  }

  clearPendingAddProofUpload(key);
  const result = await addProofToBanProfile({
    guild: message.guild,
    userId: pending.targetUserId,
    screenshots,
    addedBy: message.author
  });

  const extraImageCount = imageUploads.length - screenshots.length;
  await message.reply({
    content: [
      result.message,
      result.ok && extraImageCount > 0 ? 'Only the first 10 image attachments were saved.' : ''
    ].filter(Boolean).join('\n'),
    allowedMentions: { repliedUser: false, parse: [] }
  }).catch(() => null);
  return true;
}

function clearPbanTimeout(messageId) {
  const timeout = pbanTimeouts.get(messageId);
  if (timeout) clearTimeout(timeout);
  pbanTimeouts.delete(messageId);
}

async function editPbanProposalMessage(proposal) {
  const channel = await client.channels.fetch(proposal.channelId).catch(() => null);
  if (!channel?.isTextBased()) return null;

  const message = await channel.messages.fetch(proposal.messageId).catch(() => null);
  if (!message) return null;

  return message.edit({
    embeds: [pbanProposalEmbed(proposal)],
    components: pbanComponents(proposal),
    allowedMentions: { users: [proposal.targetUserId, proposal.executorUserId] }
  }).catch(() => null);
}

async function expirePbanProposal(messageId) {
  const proposal = state.pbanProposalsByMessageId[messageId];
  if (!proposal || !['proof_pending', 'voting'].includes(proposal.status)) return;

  proposal.status = 'expired';
  proposal.expiredAt = Date.now();
  await saveState();
  clearPbanTimeout(messageId);
  await editPbanProposalMessage(proposal);
}

function schedulePbanExpiration(messageId) {
  clearPbanTimeout(messageId);
  const proposal = state.pbanProposalsByMessageId[messageId];
  if (!proposal || !['proof_pending', 'voting'].includes(proposal.status)) return;

  const expiresAt = Number(proposal.expiresAt);
  if (!Number.isFinite(expiresAt)) return;

  const delay = Math.max(0, Math.min(expiresAt - Date.now(), 2_147_483_647));
  const timeout = setTimeout(async () => {
    pbanTimeouts.delete(messageId);
    const current = state.pbanProposalsByMessageId[messageId];
    if (!current || Number(current.expiresAt) !== expiresAt) return;
    if (expiresAt > Date.now()) {
      schedulePbanExpiration(messageId);
      return;
    }
    await expirePbanProposal(messageId).catch((error) => {
      console.error(`Could not expire pban proposal ${messageId}:`, error);
    });
  }, delay);
  pbanTimeouts.set(messageId, timeout);
}

async function restorePbanProposals() {
  for (const [messageId, proposal] of Object.entries(state.pbanProposalsByMessageId || {})) {
    if (['proof_pending', 'voting'].includes(proposal.status) && Number(proposal.expiresAt) <= Date.now()) {
      await expirePbanProposal(messageId);
    } else {
      schedulePbanExpiration(messageId);
      await editPbanProposalMessage(proposal);
    }
  }
}

function clearTimedCloseTimeout(userId) {
  const timeout = timedCloseTimeouts.get(userId);
  if (timeout) clearTimeout(timeout);
  timedCloseTimeouts.delete(userId);
}

async function loadTimedCloseState() {
  if (!existsSync(TIMED_CLOSE_STATE_FILE)) {
    await saveTimedCloseState();
  } else {
    const raw = await fs.readFile(TIMED_CLOSE_STATE_FILE, 'utf8');
    timedCloseState = {
      ticketsByUserId: {},
      ...JSON.parse(raw)
    };
  }

  let migrated = false;
  for (const [userId, ticket] of Object.entries(state.ticketsByUserId)) {
    if (Number.isFinite(Number(ticket.autoCloseAt)) && !timedCloseState.ticketsByUserId[userId]) {
      timedCloseState.ticketsByUserId[userId] = {
        channelId: ticket.channelId,
        closeAt: Number(ticket.autoCloseAt)
      };
      migrated = true;
    }

    if ('autoCloseAt' in ticket) {
      delete ticket.autoCloseAt;
      migrated = true;
    }
  }

  if (migrated) {
    await saveState();
    await saveTimedCloseState();
  }
}

async function saveTimedCloseState() {
  await fs.mkdir('./data', { recursive: true });
  await fs.writeFile(TIMED_CLOSE_STATE_FILE, `${JSON.stringify(timedCloseState, null, 2)}\n`);
}

function parseBreakDuration(text) {
  const value = text.trim().toLowerCase();
  const match = value.match(/^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;

  const unitMs = {
    m: 60_000,
    min: 60_000,
    mins: 60_000,
    minute: 60_000,
    minutes: 60_000,
    h: 3_600_000,
    hr: 3_600_000,
    hrs: 3_600_000,
    hour: 3_600_000,
    hours: 3_600_000,
    d: 86_400_000,
    day: 86_400_000,
    days: 86_400_000,
    w: 604_800_000,
    week: 604_800_000,
    weeks: 604_800_000
  }[match[2]];
  const durationMs = amount * unitMs;
  return Number.isSafeInteger(durationMs) ? durationMs : null;
}

function formatBreakDuration(ms) {
  const units = [
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000]
  ];

  for (const [label, unitMs] of units) {
    if (ms % unitMs === 0) {
      const amount = ms / unitMs;
      return `${amount} ${label}${amount === 1 ? '' : 's'}`;
    }
  }

  return formatDuration(ms);
}

function breakDecisionRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`staff_break_approve:${userId}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`staff_break_deny:${userId}`)
      .setLabel('Deny')
      .setStyle(ButtonStyle.Secondary)
  );
}

function pbanStatusLabel(status) {
  return {
    proof_pending: 'Waiting for screenshot proof',
    voting: 'Voting',
    passed: 'Ban successful',
    cancelled: 'Cancelled',
    expired: 'Expired'
  }[status] || status;
}

function pbanVoteTotal(proposal) {
  return Object.values(proposal.votes || {})
    .reduce((total, vote) => total + pbanVoteWeight(vote.rank), 0);
}

function pbanVoteProgressBar(total) {
  const filled = Math.min(6, Math.max(0, total));
  return `${'█'.repeat(filled)}${'░'.repeat(6 - filled)}`;
}

function pbanVoteSummary(proposal) {
  const total = pbanVoteTotal(proposal);
  const abstains = Object.values(proposal.abstains || {});
  const lines = [
    `**Vote Progress:** ${pbanVoteProgressBar(total)} ${Math.min(total, 6)}/6`,
    `**Vote Weight:** ${total}`
  ];
  if (abstains.length) lines.push(`**Abstains:** ${abstains.map((vote) => `<@${vote.userId}>`).join(', ')}`);
  return lines.join('\n');
}

function pbanProposalEmbed(proposal) {
  const lines = [
    `**Person:** <@${proposal.targetUserId}> (\`${proposal.targetUserId}\`)`,
    `**Reason:** ${trimTo(proposal.reason, 1000)}`,
    `**Command Executor:** <@${proposal.executorUserId}> (\`${proposal.executorUserId}\`)`,
    `**Expires:** <t:${Math.floor(proposal.expiresAt / 1000)}:R>`,
    `**Status:** ${pbanStatusLabel(proposal.status)}`
  ];

  if (proposal.status === 'proof_pending') {
    lines.push('', 'Reply to this embed with a screenshot for proof. Without screenshot proof, nothing will happen.');
  } else if (proposal.proofUrls?.length) {
    lines.push('', `**Proof Screenshots:** ${proposal.proofUrls.length}`);
  }

  if (['voting', 'passed', 'cancelled'].includes(proposal.status)) {
    lines.push('', pbanVoteSummary(proposal));
  }

  return styledEmbed('Pending Ban', lines.join('\n'));
}

function pbanVoteRow(proposal) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pban_vote:${proposal.messageId}`)
      .setLabel('Vote')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`pban_abstain:${proposal.messageId}`)
      .setLabel('Abstain')
      .setStyle(ButtonStyle.Secondary)
  );
}

function pbanCleanupRow(proposal) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pban_cleanup:${proposal.messageId}`)
      .setLabel('Clean up messages')
      .setStyle(ButtonStyle.Primary)
  );
}

function pbanComponents(proposal) {
  if (proposal.status === 'voting') return [pbanVoteRow(proposal)];
  if (proposal.status === 'passed' && !proposal.messageCleanupCompletedAt) return [pbanCleanupRow(proposal)];
  return [];
}

function pbanPassed(proposal) {
  return pbanVoteTotal(proposal) >= 6;
}

function breakRequestEmbed(request, status = null) {
  const period = request.durationMs
    ? formatBreakDuration(request.durationMs)
    : `Needs clarification. Reply to this embed with a duration such as \`3d\` or \`2 weeks\`.`;
  const lines = [
    `**Staff Member:** <@${request.userId}> (\`${request.userId}\`)`,
    `**Requested Length:** ${trimTo(request.durationText, 200)}`,
    `**Time Period:** ${period}`,
    `**Reason:** ${trimTo(request.reason, 1000)}`
  ];

  if (status) lines.push('', `**Status:** ${status}`);
  return styledEmbed('Staff Break Request', lines.join('\n'));
}

function breakRequestModal() {
  return new ModalBuilder()
    .setCustomId('staff_break_request_modal')
    .setTitle('Request a Staff Break')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('duration')
          .setLabel('How long is the break?')
          .setPlaceholder('Example: 3d or 2 weeks')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Why are you requesting a break?')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true)
      )
    );
}

function clearBreakTimeout(userId) {
  const timeout = breakTimeouts.get(userId);
  if (timeout) clearTimeout(timeout);
  breakTimeouts.delete(userId);
}

async function loadBreakState() {
  if (!existsSync(BREAK_STATE_FILE)) {
    await saveBreakState();
    return;
  }

  const raw = await fs.readFile(BREAK_STATE_FILE, 'utf8');
  breakState = {
    requestsByUserId: {},
    activeByUserId: {},
    ...JSON.parse(raw)
  };
}

async function saveBreakState() {
  await fs.mkdir('./data', { recursive: true });
  await fs.writeFile(BREAK_STATE_FILE, `${JSON.stringify(breakState, null, 2)}\n`);
}

async function endStaffBreak(userId, reason) {
  const activeBreak = breakState.activeByUserId[userId];
  if (!activeBreak) return { ok: false, message: 'You do not have an active staff break.' };

  clearBreakTimeout(userId);
  const guild = await client.guilds.fetch(activeBreak.guildId).catch(() => null);
  const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
  if (member && activeBreak.removedRoleIds.length) {
    await member.roles.add(activeBreak.removedRoleIds, `Staff break ended: ${reason}`);
  }

  delete breakState.activeByUserId[userId];
  await saveBreakState();

  const user = await client.users.fetch(userId).catch(() => null);
  await user?.send({
    embeds: [styledEmbed('Staff Break Ended', reason)],
    allowedMentions: { parse: [] }
  }).catch(() => null);

  return { ok: true, message: 'Your break is ended, welcome back.' };
}

function scheduleStaffBreakEnd(userId) {
  clearBreakTimeout(userId);
  const activeBreak = breakState.activeByUserId[userId];
  const endsAt = Number(activeBreak?.endsAt);
  if (!Number.isFinite(endsAt)) return;

  const delay = Math.max(0, Math.min(endsAt - Date.now(), 2_147_483_647));
  const timeout = setTimeout(async () => {
    breakTimeouts.delete(userId);
    const currentBreak = breakState.activeByUserId[userId];
    if (!currentBreak || Number(currentBreak.endsAt) !== endsAt) return;
    if (endsAt > Date.now()) {
      scheduleStaffBreakEnd(userId);
      return;
    }

    await endStaffBreak(userId, 'your break is ended, welcome back.').catch((error) => {
      console.error(`Could not end expired staff break for ${userId}:`, error);
    });
  }, delay);
  breakTimeouts.set(userId, timeout);
}

async function restoreStaffBreaks() {
  for (const userId of Object.keys(breakState.activeByUserId)) {
    scheduleStaffBreakEnd(userId);
  }
}

async function removeTimedClose(userId) {
  clearTimedCloseTimeout(userId);
  if (!timedCloseState.ticketsByUserId[userId]) return;

  delete timedCloseState.ticketsByUserId[userId];
  await saveTimedCloseState();
}

function scheduleTimedClose(userId) {
  clearTimedCloseTimeout(userId);

  const timer = timedCloseState.ticketsByUserId[userId];
  const closeAt = Number(timer?.closeAt);
  if (!Number.isFinite(closeAt)) return;

  const delay = Math.max(0, Math.min(closeAt - Date.now(), 2_147_483_647));
  const timeout = setTimeout(async () => {
    timedCloseTimeouts.delete(userId);

    const currentTicket = state.ticketsByUserId[userId];
    const currentTimer = timedCloseState.ticketsByUserId[userId];
    if (!currentTicket || Number(currentTimer?.closeAt) !== closeAt) return;
    if (closeAt > Date.now()) {
      scheduleTimedClose(userId);
      return;
    }

    const channel = await client.channels.fetch(currentTicket.channelId).catch(() => null);
    if (!channel) return;

    await closeTicket(
      channel,
      { id: client.user.id, tag: client.user.tag },
      'Resolved',
      { skipPermissionCheck: true }
    ).catch((error) => {
      console.error('Timed ticket close failed:', error);
    });
  }, delay);

  timedCloseTimeouts.set(userId, timeout);
}

async function restoreTimedCloses() {
  let changed = false;
  for (const userId of Object.keys(timedCloseState.ticketsByUserId)) {
    if (!state.ticketsByUserId[userId]) {
      delete timedCloseState.ticketsByUserId[userId];
      changed = true;
      continue;
    }

    scheduleTimedClose(userId);
  }

  if (changed) await saveTimedCloseState();
}

async function loadReviewerState() {
  if (!existsSync(REVIEWER_STATE_FILE)) {
    reviewerState.lastSubmittedTime = null;
    await saveReviewerState();
    console.log(processExistingResponses
      ? 'Reviewer state initialized: existing responses will be processed.'
      : 'Reviewer state initialized: existing responses will be marked as seen.');
    return;
  }

  const raw = await fs.readFile(REVIEWER_STATE_FILE, 'utf8');
  reviewerState = { ...reviewerState, ...JSON.parse(raw) };
  console.log(`Loaded reviewer state with ${reviewerState.processedResponseIds.length} processed response(s).`);
}

async function saveReviewerState() {
  const nextState = {
    ...reviewerState,
    processedResponseIds: reviewerState.processedResponseIds.slice(-500)
  };
  await fs.mkdir('./data', { recursive: true });
  await fs.writeFile(REVIEWER_STATE_FILE, `${JSON.stringify(nextState, null, 2)}\n`);
}

async function findGuild(options = {}) {
  const { guildId = null, userId = null, departmentId = null } = options;

  if (guildId) {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      throw new Error('The selected server could not be found by this bot.');
    }
    return guild;
  }

  if (configuredGuildId) {
    const guild = await client.guilds.fetch(configuredGuildId);
    if (!guild) {
      throw new Error('The configured server could not be found by this bot.');
    }
    return guild;
  }

  const configuredCategoryIds = departmentId
    ? [categoryIdFor(departmentId)]
    : Object.keys(DEPARTMENTS).map((id) => categoryIdFor(id));
  const categoryGuildIds = new Set();
  for (const categoryId of configuredCategoryIds.filter(Boolean)) {
    const channel = await client.channels.fetch(categoryId).catch(() => null);
    if (channel?.type === ChannelType.GuildCategory && channel.guild?.id) {
      categoryGuildIds.add(channel.guild.id);
    }
  }
  if (categoryGuildIds.size === 1) {
    return client.guilds.fetch([...categoryGuildIds][0]);
  }

  const guilds = await client.guilds.fetch();
  if (userId) {
    const mutualGuilds = [];
    for (const partialGuild of guilds.values()) {
      const guild = await client.guilds.fetch(partialGuild.id).catch(() => null);
      if (guild && await guild.members.fetch(userId).then(() => true).catch(() => false)) {
        mutualGuilds.push(guild);
      }
    }

    if (mutualGuilds.length === 1) return mutualGuilds[0];
    if (mutualGuilds.length > 1) {
      throw new Error(`GUILD_ID is required because this user shares ${mutualGuilds.length} servers with the bot.`);
    }
  }

  if (guilds.size !== 1) {
    throw new Error(`GUILD_ID is required when the bot is in ${guilds.size} servers.`);
  }

  const guild = await client.guilds.fetch(guilds.first().id);
  if (!guild) {
    throw new Error('The configured server could not be found by this bot.');
  }

  return guild;
}

function logDiagnosticPass(feature) {
  console.log(`${feature} = yay`);
}

function logDiagnosticFail(feature, detail) {
  console.warn(`${feature} = no yay (${detail})`);
}

function hasClientIntent(intent) {
  return client.options.intents.has(intent);
}

async function checkStateStorage() {
  await saveState();
  await fs.access(STATE_FILE);
}

async function checkTextChannel(channelId) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  return channel?.isTextBased() ? channel : null;
}

async function checkCategory(guild, categoryId) {
  const channel = await guild.channels.fetch(categoryId).catch(() => null);
  return channel?.type === ChannelType.GuildCategory ? channel : null;
}

async function checkRoles(guild, roleIds) {
  const missing = [];

  for (const roleId of roleIds) {
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (!role) missing.push(roleId);
  }

  return missing;
}

function reviewerTruncate(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function extractQuestions(items = []) {
  const questions = [];

  for (const item of items) {
    if (item.questionItem?.question?.questionId) {
      questions.push({
        id: item.questionItem.question.questionId,
        title: item.title || item.questionItem.question.questionId
      });
    }

    if (item.questionGroupItem?.questions) {
      for (const question of item.questionGroupItem.questions) {
        if (!question.questionId) continue;
        const rowTitle = question.rowQuestion?.title || question.questionId;
        questions.push({
          id: question.questionId,
          title: item.title ? `${item.title} - ${rowTitle}` : rowTitle
        });
      }
    }
  }

  return questions;
}

function answerToText(answer) {
  if (!answer) return 'No answer provided.';

  if (answer.textAnswers?.answers?.length) {
    return answer.textAnswers.answers
      .map((entry) => entry.value)
      .filter(Boolean)
      .join(', ') || 'No answer provided.';
  }

  if (answer.fileUploadAnswers?.answers?.length) {
    return answer.fileUploadAnswers.answers
      .map((entry) => entry.fileName || entry.fileId || 'Uploaded file')
      .join(', ');
  }

  return reviewerTruncate(JSON.stringify(answer), 900);
}

function isDiscordIdQuestion(questionTitle) {
  return (
    /\b(user|discord|account|member)\s*id\b/i.test(questionTitle) ||
    /\bid\b/i.test(questionTitle) && /discord|user|account|member/i.test(questionTitle)
  );
}

function isDiscordUserId(answer) {
  return /^\d{15,25}$/.test(answer);
}

function analyzeAnswerQuality(questions, formResponse) {
  const notes = [];

  for (const question of questions) {
    const questionTitle = question.title.toLowerCase();
    const answer = answerToText(formResponse.answers?.[question.id]).trim();

    if (isDiscordIdQuestion(questionTitle)) {
      if (isDiscordUserId(answer)) continue;

      if (answer && answer !== 'No answer provided.') {
        notes.push(`Weakness: "${question.title}" appears to contain a username instead of a numeric Discord user ID. Answer given: "${reviewerTruncate(answer, 120)}".`);
      } else {
        notes.push(`Weakness: "${question.title}" is missing a numeric Discord user ID.`);
      }
    }
  }

  return notes;
}

function buildApplicationLines(questions, formResponse) {
  return questions.map((question, index) => {
    const answer = answerToText(formResponse.answers?.[question.id]);
    return `**${index + 1}. ${question.title}**\n"${answer}"`;
  });
}

function splitTextForEmbedDescription(text) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > APPLICATION_EMBED_DESCRIPTION_LIMIT) {
    const splitAt = remaining.lastIndexOf('\n', APPLICATION_EMBED_DESCRIPTION_LIMIT);
    const end = splitAt > 500 ? splitAt : APPLICATION_EMBED_DESCRIPTION_LIMIT;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function buildApplicationEmbeds(lines, formResponse) {
  const chunks = [];
  let chunk = '';

  for (const line of lines) {
    const lineChunks = splitTextForEmbedDescription(line);

    for (const lineChunk of lineChunks) {
      const next = chunk ? `${chunk}\n\n${lineChunk}` : lineChunk;
      if (next.length > APPLICATION_EMBED_DESCRIPTION_LIMIT) {
        if (chunk) chunks.push(chunk);
        chunk = lineChunk;
      } else {
        chunk = next;
      }
    }
  }

  if (chunk) chunks.push(chunk);

  return chunks.map((description, index) => {
    const title = chunks.length > 1
      ? `New Application (${index + 1}/${chunks.length})`
      : 'New Application';

    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(STYLE_COLOR)
      .setFooter({ text: `Response ID: ${formResponse.responseId}` })
      .setTimestamp(new Date(formResponse.lastSubmittedTime || formResponse.createTime));
  });
}

async function createAiOpinion(lines, qualityNotes = []) {
  if (!gemini) throw new Error('Gemini is not configured.');

  const applicationText = lines.join('\n\n');
  const qualityText = qualityNotes.length
    ? qualityNotes.map((note) => `- ${note}`).join('\n')
    : '- No automatic answer-quality notes were detected.';

  const response = await gemini.models.generateContent({
    model: geminiModel,
    contents: [
      'You are reviewing a Discord staff application.',
      'Write a useful review for human moderators, not a one-sentence answer.',
      'Use the automatic answer-quality notes as important context.',
      'If a note says an answer is a weakness, include that issue under "Weaknesses of this application".',
      'Use exactly these three section headings and no other headings:',
      'Strengths of this application',
      'Weaknesses of this application',
      'Recommended choice of action',
      'Under strengths, write exactly 3 short bullet points.',
      'Under weaknesses, write exactly 3 short bullet points. If there are no major weaknesses, mention what information is still missing.',
      'Under recommended choice of action, write exactly 2 complete sentences and include one clear final choice: Hire, Interview, or Deny.',
      'Keep the full response under 220 words.',
      'Keep every sentence complete.',
      'Be fair and specific. Do not claim certainty.',
      '',
      'Automatic answer-quality notes:',
      qualityText,
      '',
      'Review this application:',
      '',
      applicationText
    ].join('\n'),
    config: {
      maxOutputTokens: geminiMaxOutputTokens,
      temperature: 0.2
    }
  });

  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== 'STOP') {
    console.warn(`Gemini finished with reason: ${finishReason}`);
  }

  const text = response.text?.trim();
  if (!text) return 'AI review did not return any text.';

  if (finishReason === 'MAX_TOKENS') {
    return `${text}\n\nNote: Gemini hit the configured output limit. Increase GEMINI_MAX_OUTPUT_TOKENS if this happens repeatedly.`;
  }

  return text;
}

async function fetchFormAndResponses() {
  if (!forms) throw new Error('Google Forms is not configured.');

  const [formResult, responsesResult] = await Promise.all([
    forms.forms.get({ formId: process.env.GOOGLE_FORM_ID }),
    forms.forms.responses.list({
      formId: process.env.GOOGLE_FORM_ID,
      pageSize: 100
    })
  ]);

  const questions = extractQuestions(formResult.data.items);
  const responses = responsesResult.data.responses || [];
  responses.sort((a, b) => {
    const aTime = new Date(a.lastSubmittedTime || a.createTime).getTime();
    const bTime = new Date(b.lastSubmittedTime || b.createTime).getTime();
    return aTime - bTime;
  });

  return { questions, responses };
}

function findApplicantName(questions, formResponse) {
  const nameQuestion = questions.find((question) => /name|username|discord/i.test(question.title));
  if (!nameQuestion) return 'New Applicant';

  return reviewerTruncate(answerToText(formResponse.answers?.[nameQuestion.id]).replaceAll('\n', ' '), 70);
}

async function sendLongThreadMessage(thread, text) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > 1900) {
    const splitAt = remaining.lastIndexOf('\n', 1900);
    const end = splitAt > 500 ? splitAt : 1900;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }

  if (remaining) chunks.push(remaining);

  for (const chunk of chunks) {
    await thread.send(chunk);
  }
}

async function postApplication(channel, questions, formResponse) {
  const lines = buildApplicationLines(questions, formResponse);
  const qualityNotes = analyzeAnswerQuality(questions, formResponse);
  const embeds = buildApplicationEmbeds(lines, formResponse);
  let message = null;

  for (const embed of embeds) {
    const sentMessage = await channel.send({ embeds: [embed] });
    if (!message) message = sentMessage;
  }

  if (!message) {
    message = await channel.send('New application received, but no supported answers were found.');
  }

  const applicantName = findApplicantName(questions, formResponse);
  const thread = await message.startThread({
    name: reviewerTruncate(`Application - ${applicantName}`, 100),
    autoArchiveDuration: threadAutoArchiveMinutes,
    reason: 'New Google Form application received'
  });

  const opinion = await createAiOpinion(lines, qualityNotes);
  await sendLongThreadMessage(thread, `**AI opinion**\n${opinion}`);
}

async function checkForNewApplications({ markExistingOnFirstRun = false } = {}) {
  if (!reviewerEnabled) {
    throw new Error('Application reviewer is not configured.');
  }

  const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
  if (!channel?.isTextBased() || !channel.send) {
    throw new Error('DISCORD_CHANNEL_ID must point to a text channel where the bot can send messages.');
  }

  const { questions, responses } = await fetchFormAndResponses();
  const newResponses = responses.filter((response) => !reviewerState.processedResponseIds.includes(response.responseId));
  console.log(`Application poll complete: found ${responses.length} response(s), ${newResponses.length} new.`);

  if (
    markExistingOnFirstRun &&
    !processExistingResponses &&
    !reviewerState.lastSubmittedTime &&
    reviewerState.processedResponseIds.length === 0
  ) {
    reviewerState.processedResponseIds = responses.map((response) => response.responseId);
    reviewerState.lastSubmittedTime = responses.at(-1)?.lastSubmittedTime || responses.at(-1)?.createTime || new Date().toISOString();
    await saveReviewerState();
    console.log(`Marked ${responses.length} existing application response(s) as seen.`);
    return {
      found: responses.length,
      new: 0,
      posted: 0,
      markedExisting: responses.length
    };
  }

  let posted = 0;
  for (const response of newResponses) {
    if (posted > 0 && applicationPostDelayMs > 0) {
      console.log(`Waiting ${applicationPostDelayMs / 1000} second(s) before posting the next application.`);
      await sleep(applicationPostDelayMs);
    }

    console.log(`Posting application response ${response.responseId}.`);
    await postApplication(channel, questions, response);

    reviewerState.processedResponseIds.push(response.responseId);
    reviewerState.lastSubmittedTime = response.lastSubmittedTime || response.createTime || new Date().toISOString();
    await saveReviewerState();
    posted += 1;
  }

  return {
    found: responses.length,
    new: newResponses.length,
    posted,
    markedExisting: 0
  };
}

async function pollApplications() {
  if (!reviewerEnabled || isPolling) return;
  isPolling = true;

  try {
    await checkForNewApplications({ markExistingOnFirstRun: true });
  } catch (error) {
    if (isGoogleInvalidGrantError(error)) {
      if (!reviewerAuthInvalidLogged) {
        console.error(`Application polling failed: ${googleInvalidGrantMessage()}`);
        reviewerAuthInvalidLogged = true;
      }
    } else {
      console.error('Application polling failed:', error);
    }
  } finally {
    isPolling = false;
  }
}

async function runReviewerStartupDiagnostics() {
  for (const key of REVIEWER_REQUIRED_ENV) {
    if (process.env[key]) {
      logDiagnosticPass(`reviewer env ${key}`);
    } else {
      logDiagnosticFail(`reviewer env ${key}`, 'missing');
    }
  }

  if (!reviewerEnabled) {
    logDiagnosticFail('application reviewer', 'missing reviewer environment values');
    return;
  }

  try {
    await saveReviewerState();
    await fs.access(REVIEWER_STATE_FILE);
    logDiagnosticPass(`reviewer state storage ${REVIEWER_STATE_FILE}`);
  } catch (error) {
    logDiagnosticFail(`reviewer state storage ${REVIEWER_STATE_FILE}`, error.message);
  }

  try {
    const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    if (!channel?.isTextBased() || !channel.send) {
      throw new Error('DISCORD_CHANNEL_ID is not a sendable text channel');
    }

    const permissions = channel.guild ? channel.permissionsFor(client.user.id) : null;
    const missingPermissions = requiredReviewerChannelPermissions.filter((permission) => !permissions?.has(permission));
    if (missingPermissions.length) {
      throw new Error(`missing ${missingPermissions.length} required channel permission(s)`);
    }

    logDiagnosticPass(`reviewer Discord channel #${channel.name}`);
  } catch (error) {
    logDiagnosticFail('reviewer Discord channel', error.message);
  }

  try {
    const { questions } = await fetchFormAndResponses();
    if (!questions.length) {
      throw new Error('form was found, but no supported questions were detected');
    }
    logDiagnosticPass(`reviewer Google Form ${questions.length} questions`);
  } catch (error) {
    logDiagnosticFail('reviewer Google Form', isGoogleInvalidGrantError(error) ? googleInvalidGrantMessage() : error.message);
  }

  try {
    const aiCheck = await createAiOpinion([
      '1. name\n"Test Applicant"',
      '2. why do you want to be mod\n"I want to help the community."'
    ], []);

    if (!aiCheck) throw new Error('no AI review text returned');
    logDiagnosticPass(`reviewer Gemini ${geminiModel}`);
  } catch (error) {
    logDiagnosticFail('reviewer Gemini', error.message);
  }
}

async function runStartupDiagnostics({ guild, commandsRegistered }) {
  console.log('Running startup diagnostics...');

  for (const key of REQUIRED_ENV) {
    if (process.env[key]) {
      logDiagnosticPass(`env ${key}`);
    } else {
      logDiagnosticFail(`env ${key}`, 'missing');
    }
  }

  for (const [name, intent] of REQUIRED_CLIENT_INTENTS) {
    if (hasClientIntent(intent)) {
      logDiagnosticPass(`intent ${name}`);
    } else {
      logDiagnosticFail(`intent ${name}`, 'not enabled in client options');
    }
  }

  if (client.user) {
    logDiagnosticPass(`discord login as ${client.user.tag}`);
  } else {
    logDiagnosticFail('discord login', 'client user is unavailable');
  }

  if (guild) {
    logDiagnosticPass(`server ${guild.name} (${guild.id})`);
  } else {
    logDiagnosticFail('server', 'configured guild could not be fetched');
  }

  if (commandsRegistered) {
    logDiagnosticPass('slash commands /ping, /stafflist, /close, /fclose, /transfer, /refresh, /approve, /reject, /demote, /promote, /makelead, /strike, /strikes, /removestrike, /pban, /addproof, /cban, /break, and /endbreak');
  } else {
    logDiagnosticFail('slash commands /ping, /stafflist, /close, /fclose, /transfer, /refresh, /approve, /reject, /demote, /promote, /makelead, /strike, /strikes, /removestrike, /pban, /addproof, /cban, /break, and /endbreak', 'registration failed');
  }

  const policyRoleIds = allConfiguredRoleIdsForDiagnostics();
  if (!guild) {
    logDiagnosticFail(`role policy ${ROLE_POLICY_FILE}`, 'configured guild could not be fetched');
  } else if (policyRoleIds.length) {
    const missing = await checkRoles(guild, policyRoleIds);
    if (!missing.length) {
      logDiagnosticPass(`role policy ${ROLE_POLICY_FILE} (${policyRoleIds.length} configured roles)`);
    } else {
      logDiagnosticFail(`role policy ${ROLE_POLICY_FILE}`, `missing ${missing.join(', ')}`);
    }
  } else {
    logDiagnosticFail(`role policy ${ROLE_POLICY_FILE}`, 'no role IDs configured');
  }

  try {
    await checkStateStorage();
    logDiagnosticPass(`state storage ${STATE_FILE}`);
  } catch (error) {
    logDiagnosticFail(`state storage ${STATE_FILE}`, error.message);
  }

  try {
    departmentRow();
    logDiagnosticPass('wing select menu');
  } catch (error) {
    logDiagnosticFail('wing select menu', error.message);
  }

  if (process.env.TRANSCRIPT_CHANNEL_ID) {
    const channel = await checkTextChannel(process.env.TRANSCRIPT_CHANNEL_ID);
    if (channel) {
      logDiagnosticPass(`transcript channel #${channel.name}`);
    } else {
      logDiagnosticFail('transcript channel', `could not find text channel ${process.env.TRANSCRIPT_CHANNEL_ID}`);
    }
  } else {
    logDiagnosticPass('transcripts fallback to ticket channel');
  }

  if (!guild) return;

  for (const id of WING_ORDER) {
    const department = DEPARTMENTS[id];
    const categoryId = categoryIdFor(id);
    if (!categoryId) {
      logDiagnosticFail(`${department.label} category`, `${categoryEnvLabel(department)} is not set`);
    } else {
      const category = await checkCategory(guild, categoryId);
      if (category) {
        logDiagnosticPass(`${department.label} category ${category.name}`);
      } else {
        logDiagnosticFail(`${department.label} category`, `could not find category ${categoryId}`);
      }
    }

    for (const roleType of ['ping', 'reply', 'close']) {
      const roleIds = roleIdsFor(id, roleType);
      if (!roleIds.length) {
        logDiagnosticFail(`${department.label} ${roleType} roles`, 'no role IDs configured');
        continue;
      }

      const missing = await checkRoles(guild, roleIds);
      if (!missing.length) {
        logDiagnosticPass(`${department.label} ${roleType} roles`);
      } else {
        logDiagnosticFail(`${department.label} ${roleType} roles`, `missing ${missing.join(', ')}`);
      }
    }
  }

  await runReviewerStartupDiagnostics();
}

async function activeChannelFor(userId, guildId = null) {
  const ticket = state.ticketsByUserId[userId];
  if (!ticket?.channelId) return null;

  try {
    const channel = await client.channels.fetch(ticket.channelId);
    if (guildId && channel?.guildId !== guildId) return null;
    if (channel?.type === ChannelType.GuildText) return channel;
  } catch {
    await removeTimedClose(userId);
    delete state.ticketsByUserId[userId];
    await saveState();
  }

  return null;
}

function userIdForChannel(channelId) {
  return Object.entries(state.ticketsByUserId)
    .find(([, ticket]) => ticket.channelId === channelId)?.[0] || null;
}

function recordHistory(userId, entry) {
  const ticket = state.ticketsByUserId[userId];
  if (!ticket) return;

  ticket.history ||= [];
  ticket.history.push({
    timestamp: Date.now(),
    ...entry
  });
  ticket.history = ticket.history.slice(-500);
  ticket.lastActivityAt = new Date().toISOString();
}

async function openTicket(user, departmentId, guildId = null) {
  const existing = await activeChannelFor(user.id, guildId);
  if (existing) return existing;

  const department = departmentFor(departmentId);
  if (!department) return null;

  const guild = await findGuild({ guildId, userId: user.id, departmentId: department.id });
  const member = await guild.members.fetch(user.id).catch(() => null);

  const categoryId = categoryIdFor(department.id);
  const category = categoryId ? await checkCategory(guild, categoryId) : null;
  if (categoryId && !category) {
    await user.send({
      embeds: [
        styledEmbed(
          'Ticket Not Opened',
          `The ${department.label} category is not configured for this server. Please ask staff to update ${categoryEnvLabel(department)}.`
        )
      ],
      allowedMentions: { parse: [] }
    }).catch(() => null);
    return null;
  }

  const channel = await guild.channels.create({
    name: ticketTitle(user, department.id),
    type: ChannelType.GuildText,
    parent: category?.id,
    topic: `ModMail ${department.label} ticket with ${user.tag} (${user.id})`
  });

  if (category) {
    await channel.lockPermissions().catch(() => null);
  }

  state.ticketsByUserId[user.id] = {
    channelId: channel.id,
    guildId: guild.id,
    departmentId: department.id,
    userTag: user.tag,
    userName: user.username,
    openedAt: Date.now(),
    lastActivityAt: new Date().toISOString(),
    priority: 'normal',
    history: []
  };
  await saveState();

  const intro = [
    `**Wing:** ${department.label}`,
    `**User:** ${user.tag}`,
    `**Username:** ${user.username}`,
    `**User ID:** ${user.id}`,
    `**Server Name:** ${member?.displayName || 'Not in main server'}`,
    '',
    'Discuss freely in this channel. Messages are not sent to the user unless they start with **?r**.',
    'Use **?r <response>** to reply to the user.',
    'Use **/close** when the conversation is finished.'
  ].join('\n');
  const pingRoleIds = roleIdsFor(department.id, 'ping');
  const pingContent = pingRoleIds.map((roleId) => `<@&${roleId}>`).join(' ');

  await channel.send({
    content: pingContent || undefined,
    embeds: [
      styledEmbed('New ModMail Thread', intro)
        .setAuthor({
          name: user.tag,
          iconURL: user.displayAvatarURL()
        })
        .setThumbnail(user.displayAvatarURL())
    ],
    allowedMentions: { roles: pingRoleIds }
  });

  return channel;
}

async function sendDepartmentPrompt(message) {
  const existing = await activeChannelFor(message.author.id);
  if (existing || state.pendingByUserId[message.author.id]) {
    await message.author.send({
      embeds: [styledEmbed('Ticket Already Open', 'You already have an open or pending ticket. Please continue with that ticket instead of opening another one.')],
      allowedMentions: { parse: [] }
    }).catch(() => null);
    return;
  }

  const guild = await findGuild({ userId: message.author.id }).catch((error) => {
    console.warn(`Could not resolve modmail guild for DM from ${message.author.id}:`, error.message);
    return null;
  });
  if (!guild) {
    await message.author.send({
      embeds: [
        styledEmbed(
          'Server Not Selected',
          'I share more than one server and could not tell which one this ticket is for. Please use the support button in the server instead.'
        )
      ],
      allowedMentions: { parse: [] }
    }).catch(() => null);
    return;
  }

  state.pendingByUserId[message.author.id] = {
    content: message.content || '',
    attachments: attachmentDataFromMessage(message),
    messageId: message.id,
    channelId: message.channel.id,
    guildId: guild.id,
    createdAt: Date.now()
  };
  await saveState();

  await message.author.send({
    embeds: [
      styledEmbed(
        'Choose a Wing',
        [
          'Please select where this message should go.',
          '',
          'Your message will be sent to staff after you choose a wing.'
        ].join('\n')
      )
    ],
    components: [departmentRow()],
    allowedMentions: { parse: [] }
  });
}

async function sendButtonDepartmentPrompt(user, guildId = null) {
  const existing = await activeChannelFor(user.id, guildId);
  if (existing || state.pendingByUserId[user.id]) {
    await user.send({
      embeds: [styledEmbed('Ticket Already Open', 'You already have an open or pending ticket. Please continue with that ticket instead of opening another one.')],
      allowedMentions: { parse: [] }
    });
    return;
  }

  state.pendingByUserId[user.id] = {
    content: '',
    attachments: [],
    source: 'support_button',
    guildId,
    createdAt: Date.now()
  };
  await saveState();

  await user.send({
    embeds: [
      styledEmbed(
        'Choose a Wing',
        [
          'Please select where this ticket should go.',
          '',
          'Your ticket will be opened after you choose a wing.'
        ].join('\n')
      )
    ],
    components: [departmentRow()],
    allowedMentions: { parse: [] }
  });
}

async function ensureSupportPanel() {
  if (!SUPPORT_PANEL_CHANNEL_ID) {
    logDiagnosticPass('support panel message skipped');
    return;
  }

  const channel = await client.channels.fetch(SUPPORT_PANEL_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased() || !channel.messages || !channel.send) {
    logDiagnosticFail('support panel message', `could not access channel ${SUPPORT_PANEL_CHANNEL_ID}`);
    return;
  }

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const existing = messages?.some((message) =>
    message.author.id === client.user.id &&
    message.components.some((row) =>
      row.components.some((component) => component.customId === SUPPORT_PANEL_BUTTON_ID)
    )
  );

  if (existing) {
    logDiagnosticPass(`support panel message in #${channel.name}`);
    return;
  }

  await channel.send({
    content: SUPPORT_PANEL_CONTENT,
    components: [supportPanelRow()],
    allowedMentions: { parse: [] }
  });
  logDiagnosticPass(`support panel message sent in #${channel.name}`);
}

async function acknowledgeUser(user, originalMessage = null) {
  if (originalMessage) {
    await originalMessage.react('✅').catch(() => null);
  }
}

async function relayUserParts(user, content, attachmentUrls, channel, originalMessage = null) {
  const ticket = state.ticketsByUserId[user.id];
  await removeTimedClose(user.id);

  const attachments = normalizeAttachments(attachmentUrls);
  const embeds = modmailMessageEmbeds({
    title: 'User Message',
    content,
    attachments,
    fallback: '*No text content provided.*',
    author: {
      name: user.tag,
      iconURL: user.displayAvatarURL()
    }
  });

  await sendEmbedsAsMessages(channel, embeds, {
    firstMessageContent: ticket.claimedByStaffUserId ? `<@${ticket.claimedByStaffUserId}>` : undefined,
    allowedMentions: { users: ticket.claimedByStaffUserId ? [ticket.claimedByStaffUserId] : [] }
  });

  if (normalizeDepartmentId(ticket.departmentId) === 'partnership' && containsDiscordInvite(content)) {
    await channel.send({
      content: trimTo(content.trim(), 1900),
      allowedMentions: { parse: [] }
    });
  }

  recordHistory(user.id, {
    kind: 'USER',
    authorId: user.id,
    authorTag: user.tag,
    content: content || '',
    attachmentUrls: attachments.map((attachment) => attachment.url)
  });
  ticket.lastActivityAt = new Date().toISOString();
  await saveState();
  await acknowledgeUser(user, originalMessage);
}

async function relayUserDm(message) {
  const existing = await activeChannelFor(message.author.id);
  if (!existing) {
    await sendDepartmentPrompt(message);
    return;
  }

  await relayUserParts(
    message.author,
    message.content,
    attachmentDataFromMessage(message),
    existing,
    message
  );
}

async function relayStaffReply(message, userId, replyText) {
  const ticket = state.ticketsByUserId[userId];
  if (!ticket) {
    await message.reply({
      embeds: [styledEmbed('Reply Not Sent', 'This channel is not linked to an open modmail ticket.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const department = departmentFor(ticket.departmentId);
  const replyRoleIds = roleIdsFor(ticket.departmentId, 'reply');
  if (!replyRoleIds.length) {
    await message.reply({
      embeds: [
        styledEmbed(
          'Reply Not Sent',
          `No reply roles are configured for **${department?.label || ticket.departmentId}** in \`${TICKET_BRANCH_POLICY_FILE}\`.`
        )
      ],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const canReply = await memberCanUsePrefixWithRoles(message, replyRoleIds);
  if (!canReply) {
    await message.reply({
      embeds: [styledEmbed('Reply Not Sent', `You need a **${department?.label || 'wing'}** reply role to use **${REPLY_PREFIX}** in this ticket.`)],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) {
    await message.reply({
      embeds: [styledEmbed('Reply Not Sent', 'I could not find the user for this ticket.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const attachments = attachmentDataFromMessage(message);
  const dmEmbeds = modmailMessageEmbeds({
    title: 'Staff Reply',
    content: replyText,
    attachments,
    fallback: '*No text content provided.*'
  });

  const delivered = await sendEmbedsAsMessages(user, dmEmbeds, {
    allowedMentions: { parse: [] }
  }).then(() => true).catch(() => false);

  if (!delivered) {
    await message.reply({
      embeds: [styledEmbed('Reply Not Sent', 'I could not DM this user. They may have DMs disabled or may have blocked the bot.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  recordHistory(userId, {
    kind: 'STAFF REPLY',
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: replyText || '',
    attachmentUrls: attachments.map((attachment) => attachment.url)
  });
  ticket.lastReplyStaffUserId = message.author.id;
  ticket.lastActivityAt = new Date().toISOString();
  await saveState();

  if (!message.attachments.size) {
    await message.delete().catch(() => null);
  } else {
    await message.react('✅').catch(() => null);
  }
  await sendEmbedsAsMessages(message.channel, modmailMessageEmbeds({
    title: 'Staff Reply',
    content: replyText,
    attachments,
    fallback: '*No text content provided.*',
    author: {
      name: message.author.username,
      iconURL: message.author.displayAvatarURL()
    }
  }), {
    allowedMentions: { parse: [] }
  });
}

async function handlePartnershipAdCommand(message, userId) {
  const ticket = state.ticketsByUserId[userId];
  if (!ticket) {
    await message.reply({
      embeds: [styledEmbed('Ad Not Sent', 'This channel is not linked to an open modmail ticket.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const commandPolicy = modmailPrefixCommandPolicy('partnershipAd');
  if (!await commandCanRunInTicketBranchForMember(message, commandPolicy, ticket.departmentId)) {
    await message.reply({
      embeds: [styledEmbed('Ad Not Sent', restrictedTicketBranchMessage(commandPolicy, PARTNERSHIP_AD_COMMAND))],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const allowedRoleIds = ticketRoleIdsForCommand(commandPolicy, ticket.departmentId);
  if (!allowedRoleIds.length) {
    await message.reply({
      embeds: [styledEmbed('Ad Not Sent', 'No partnership reply or close roles are configured.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const canSendAd = await memberCanUsePrefixWithRoles(message, allowedRoleIds);
  if (!canSendAd) {
    await message.reply({
      embeds: [styledEmbed('Ad Not Sent', `You need a partnership reply or close role to use **${PARTNERSHIP_AD_COMMAND}**.`)],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) {
    await message.reply({
      embeds: [styledEmbed('Ad Not Sent', 'I could not find the user for this ticket.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  let adText = '';
  try {
    adText = await readPartnershipAd();
  } catch (error) {
    await message.reply({
      embeds: [styledEmbed('Ad Not Sent', `I could not read ${PARTNERSHIP_AD_FILE}.`)],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  if (!adText) {
    await message.reply({
      embeds: [styledEmbed('Ad Not Sent', `${PARTNERSHIP_AD_FILE} is empty.`)],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const introEmbed = styledEmbed('Staff Reply', PARTNERSHIP_AD_INTRO_MESSAGE);
  const delivered = await user.send({
    embeds: [introEmbed],
    allowedMentions: { parse: [] }
  }).then(async () => {
    await sendPlainTextMessages(user, adText, { allowedMentions: { parse: [] } });
    return true;
  }).catch(() => false);

  if (!delivered) {
    await message.reply({
      embeds: [styledEmbed('Ad Not Sent', 'I could not DM this user. They may have DMs disabled or may have blocked the bot.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  recordHistory(userId, {
    kind: 'STAFF REPLY',
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: `${PARTNERSHIP_AD_INTRO_MESSAGE}\n\n${adText}`,
    attachmentUrls: []
  });
  ticket.lastReplyStaffUserId = message.author.id;
  ticket.lastActivityAt = new Date().toISOString();
  await saveState();

  await message.delete().catch(() => null);
  await message.channel.send({
    embeds: [
      styledEmbed('Staff Reply', PARTNERSHIP_AD_INTRO_MESSAGE)
        .setAuthor({
          name: message.author.username,
          iconURL: message.author.displayAvatarURL()
        })
    ],
    allowedMentions: { parse: [] }
  });
  await sendPlainTextMessages(message.channel, adText, { allowedMentions: { parse: [] } });
}

async function handleSnippetPreview(message, snippetCommand, replyText = '', userId = null) {
  const canPreview = await memberCanUsePrefixWithRoles(message, commandRoleIds('preview'));
  if (!canPreview) {
    await message.reply({
      embeds: [styledEmbed('Preview Not Available', 'You need a staff hierarchy role to preview snippets.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  if (snippetCommand === REPLY_PREFIX) {
    const attachments = attachmentDataFromMessage(message);
    if (!replyText && !attachments.length) {
      await message.reply({
        embeds: [styledEmbed('Preview Not Available', `Use **${previewCommand(REPLY_PREFIX)} <response>** or attach a file to preview a reply.`)],
        allowedMentions: { repliedUser: false, parse: [] }
      });
      return;
    }

    await sendEmbedsAsMessages(message.channel, modmailMessageEmbeds({
      title: 'Preview: Staff Reply',
      content: replyText,
      attachments,
      fallback: '*No text content provided.*',
      author: {
        name: message.author.username,
        iconURL: message.author.displayAvatarURL()
      }
    }), {
      allowedMentions: { parse: [] }
    });
    return;
  }

  if (snippetCommand === PARTNERSHIP_AD_COMMAND) {
    let adText = '';
    try {
      adText = await readPartnershipAd();
    } catch (error) {
      await message.reply({
        embeds: [styledEmbed('Preview Not Available', `I could not read ${PARTNERSHIP_AD_FILE}.`)],
        allowedMentions: { repliedUser: false, parse: [] }
      });
      return;
    }

    if (!adText) {
      await message.reply({
        embeds: [styledEmbed('Preview Not Available', `${PARTNERSHIP_AD_FILE} is empty.`)],
        allowedMentions: { repliedUser: false, parse: [] }
      });
      return;
    }

    await message.channel.send({
      embeds: [
        styledEmbed('Preview: Staff Reply', PARTNERSHIP_AD_INTRO_MESSAGE)
          .setAuthor({
            name: message.author.username,
            iconURL: message.author.displayAvatarURL()
          })
      ],
      allowedMentions: { parse: [] }
    });
    await sendPlainTextMessages(message.channel, adText, { allowedMentions: { parse: [] } });
    return;
  }

  if (snippetCommand === TIMED_CLOSE_COMMAND) {
    await message.channel.send({
      embeds: [
        styledEmbed('Preview: Staff Reply', TIMED_CLOSE_MESSAGE)
          .setAuthor({
            name: message.author.username,
            iconURL: message.author.displayAvatarURL()
          })
      ],
      allowedMentions: { parse: [] }
    });
    return;
  }

  if (snippetCommand === REPORT_FINISHED_COMMAND) {
    await message.channel.send({
      embeds: [
        styledEmbed('Preview: Staff Reply', REPORT_FINISHED_MESSAGE)
          .setAuthor({
            name: message.author.username,
            iconURL: message.author.displayAvatarURL()
          })
      ],
      allowedMentions: { parse: [] }
    });
    return;
  }

  const savedSnippet = Object.values(SAVED_SNIPPETS).find((snippet) => snippet.command === snippetCommand);
  if (savedSnippet) {
    await message.channel.send({
      embeds: [
        styledEmbed('Preview: Staff Reply', savedSnippet.message)
          .setAuthor({
            name: message.author.username,
            iconURL: message.author.displayAvatarURL()
          })
      ],
      allowedMentions: { parse: [] }
    });
    return;
  }

  const ticket = userId ? state.ticketsByUserId[userId] : null;
  const closeAt = Number(userId ? timedCloseState.ticketsByUserId[userId]?.closeAt : null);
  const previewText = replyText || 'example';
  const previews = new Map([
    [SNIPPETS_COMMAND, snippetsEmbed()],
    [HELP_COMMAND, styledEmbed('Help: h', COMMAND_HELP.h)],
    [CLAIM_COMMAND, styledEmbed('Preview: Ticket Claimed', `Claimed by **${message.author.tag}**.`)],
    [UNCLAIM_COMMAND, styledEmbed('Preview: Ticket Unclaimed', 'This ticket is no longer claimed.')],
    [CANCEL_CLOSE_COMMAND, styledEmbed('Preview: Close Timer', 'The timed close was cancelled.')],
    [TIMER_COMMAND, styledEmbed('Preview: Close Timer', Number.isFinite(closeAt) ? `This ticket closes in **${formatDuration(closeAt - Date.now())}**.` : 'This ticket does not have an active close timer.')],
    [NOTE_COMMAND, styledEmbed('Preview: Internal Note Added', previewText)],
    [USER_INFO_COMMAND, styledEmbed('Preview: Ticket User Info', `**User ID:** \`${userId || 'example-user-id'}\`\n**Wing:** ${departmentFor(ticket?.departmentId)?.label || 'Example Wing'}\n**Priority:** ${ticket?.priority || 'normal'}\n**Claimed By:** ${ticket?.claimedByStaffTag || 'nobody'}`)],
    [TRANSFER_COMMAND, styledEmbed('Preview: Ticket Transferred', `Transferred this ticket to **${replyText || 'assistants'}**.`)],
    [RENAME_COMMAND, styledEmbed('Preview: Ticket Renamed', `Renamed this ticket to **${safeChannelLabel(previewText) || 'example'}**.`)],
    [PRIORITY_COMMAND, styledEmbed('Preview: Ticket Priority', `Priority set to **${replyText || 'high'}**.`)],
    [TRANSCRIPT_COMMAND, styledEmbed('Preview: Transcript Preview', 'This command attaches a transcript preview without closing the ticket.')],
    [CLAIM_INFO_COMMAND, styledEmbed('Preview: Claim Info', ticket?.claimedByStaffTag ? `**Claimed By:** ${ticket.claimedByStaffTag}\n**Priority:** ${ticket.priority || 'normal'}` : 'This ticket is not claimed.')],
    [CLOSE_INFO_COMMAND, styledEmbed('Preview: Close Info', Number.isFinite(closeAt) ? `**Closes At:** ${formatTimestamp(closeAt)}\n**Remaining:** ${formatDuration(closeAt - Date.now())}` : 'This ticket does not have an active close timer.')],
    [ESCALATE_COMMAND, styledEmbed('Preview: Ticket Escalated', 'Your ticket is being escalated to Internals.')]
  ]);
  const preview = previews.get(CLAIM_COMMAND_ALIASES.includes(snippetCommand) ? CLAIM_COMMAND : snippetCommand);
  if (preview) {
    await message.channel.send({
      embeds: [preview],
      allowedMentions: { parse: [] }
    });
  }
}

async function memberCanReplyToTicket(message, ticket) {
  return memberCanUsePrefixWithRoles(message, roleIdsFor(ticket.departmentId, 'reply'));
}

async function handleSavedSnippetCommand(message, userId, snippet) {
  const ticket = state.ticketsByUserId[userId];
  const commandPolicy = savedSnippetCommandPolicy(snippet);
  if (!await commandCanRunInTicketBranchForMember(message, commandPolicy, ticket?.departmentId)) {
    await message.reply({
      embeds: [styledEmbed('Reply Not Sent', restrictedTicketBranchMessage(commandPolicy, snippet.command))],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  await relayStaffReply(message, userId, snippet.message);
}

async function handleClaimCommand(message, userId) {
  const ticket = state.ticketsByUserId[userId];
  const canClaim = await memberCanReplyToTicket(message, ticket) || await memberHasTicketClaimAuthority(message, ticket);
  if (!canClaim) {
    await message.reply({ embeds: [styledEmbed('Claim Failed', 'You need a reply role for this ticket.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  if (!await memberCanTakeOverClaim(message, ticket)) {
    await message.reply({ embeds: [styledEmbed('Claim Failed', claimTakeoverDeniedMessage(message, ticket))], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const previousClaimantTag = ticket.claimedByStaffUserId && ticket.claimedByStaffUserId !== message.author.id
    ? ticket.claimedByStaffTag || 'another staff member'
    : null;
  ticket.claimedByStaffUserId = message.author.id;
  ticket.claimedByStaffTag = message.author.tag;
  ticket.claimedAt = Date.now();
  ticket.lastReplyStaffUserId = message.author.id;
  recordHistory(userId, {
    kind: 'TICKET CLAIMED',
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: previousClaimantTag ? `Ticket claim taken over from ${previousClaimantTag}` : 'Ticket claimed',
    attachmentUrls: []
  });
  await saveState();
  await message.reply({
    embeds: [styledEmbed('Ticket Claimed', previousClaimantTag
      ? `Claim taken over by **${message.author.tag}** from **${previousClaimantTag}**.`
      : `Claimed by **${message.author.tag}**.`)],
    allowedMentions: { repliedUser: false, parse: [] }
  });
}

async function handleUnclaimCommand(message, userId) {
  const ticket = state.ticketsByUserId[userId];
  if (!await memberCanReplyToTicket(message, ticket)) {
    await message.reply({ embeds: [styledEmbed('Unclaim Failed', 'You need a reply role for this ticket.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  delete ticket.claimedByStaffUserId;
  delete ticket.claimedByStaffTag;
  delete ticket.claimedAt;
  delete ticket.lastReplyStaffUserId;
  recordHistory(userId, { kind: 'TICKET UNCLAIMED', authorId: message.author.id, authorTag: message.author.tag, content: 'Ticket unclaimed', attachmentUrls: [] });
  await saveState();
  await message.reply({ embeds: [styledEmbed('Ticket Unclaimed', 'This ticket is no longer claimed.')], allowedMentions: { repliedUser: false, parse: [] } });
}

async function handleCancelCloseCommand(message, userId) {
  const ticket = state.ticketsByUserId[userId];
  if (!await memberCanUsePrefixWithRoles(message, roleIdsFor(ticket.departmentId, 'close'))) {
    await message.reply({ embeds: [styledEmbed('Timer Not Cancelled', 'You need a close role for this ticket.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const hadTimer = Boolean(timedCloseState.ticketsByUserId[userId]);
  await removeTimedClose(userId);
  await message.reply({ embeds: [styledEmbed('Close Timer', hadTimer ? 'The timed close was cancelled.' : 'This ticket does not have an active close timer.')], allowedMentions: { repliedUser: false, parse: [] } });
}

async function handleTimerCommand(message, userId) {
  const canInspect = await memberCanUsePrefixWithRoles(message, commandRoleIds('timer'));
  if (!canInspect) {
    await message.reply({ embeds: [styledEmbed('Timer Not Available', 'You need a staff hierarchy role to use this command.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  const closeAt = Number(timedCloseState.ticketsByUserId[userId]?.closeAt);
  const description = Number.isFinite(closeAt)
    ? `This ticket closes in **${formatDuration(closeAt - Date.now())}**.`
    : 'This ticket does not have an active close timer.';
  await message.reply({ embeds: [styledEmbed('Close Timer', description)], allowedMentions: { repliedUser: false, parse: [] } });
}

async function handleNoteCommand(message, userId, text) {
  const ticket = state.ticketsByUserId[userId];
  if (!text) {
    await message.reply({ embeds: [styledEmbed('Note Not Added', `Use **${NOTE_COMMAND} <text>**.`)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  if (!await memberCanReplyToTicket(message, ticket)) {
    await message.reply({ embeds: [styledEmbed('Note Not Added', 'You need a reply role for this ticket.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  recordHistory(userId, { kind: 'STAFF NOTE', authorId: message.author.id, authorTag: message.author.tag, content: text, attachmentUrls: [] });
  await saveState();
  await message.reply({ embeds: [styledEmbed('Internal Note Added', text)], allowedMentions: { repliedUser: false, parse: [] } });
}

async function handleUserInfoCommand(message, userId) {
  if (!await memberCanUsePrefixWithRoles(message, commandRoleIds('userInfo'))) {
    await message.reply({ embeds: [styledEmbed('User Info Not Available', 'You need a staff hierarchy role to use this command.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  const ticket = state.ticketsByUserId[userId];
  const user = await client.users.fetch(userId).catch(() => null);
  await message.reply({
    embeds: [styledEmbed('Ticket User Info', [
      `**User:** ${user?.tag || ticket.userTag || 'unknown'}`,
      `**User ID:** \`${userId}\``,
      `**Wing:** ${departmentFor(ticket.departmentId)?.label || ticket.departmentId}`,
      `**Priority:** ${ticket.priority || 'normal'}`,
      `**Ticket Opened:** ${formatTimestamp(ticket.openedAt || Date.now())}`,
      `**Account Created:** ${user?.createdAt ? formatTimestamp(user.createdAt.getTime()) : 'unknown'}`,
      `**Account Age:** ${user?.createdAt ? formatDuration(Date.now() - user.createdAt.getTime()) : 'unknown'}`,
      `**Claimed By:** ${ticket.claimedByStaffTag || 'nobody'}`
    ].join('\n'))],
    allowedMentions: { repliedUser: false, parse: [] }
  });
}

function safeChannelLabel(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function priorityChannelName(ticket, fallbackName) {
  const baseName = stripPriorityPrefix(ticket.customChannelName || fallbackName);
  return ticket.priority && ticket.priority !== 'normal'
    ? `${ticket.priority}-${baseName}`.slice(0, 100)
    : baseName.slice(0, 100);
}

function stripPriorityPrefix(name) {
  return String(name || '').replace(/^(?:low|normal|high|urgent)-/i, '');
}

async function renameTicketChannel(channel, name) {
  if (channel.name === name) return true;

  return channel.setName(name)
    .then(() => {
      ticketChannelLastRenamedAt.set(channel.id, Date.now());
      return true;
    })
    .catch((error) => {
      console.error(`Ticket channel rename failed for ${channel.id}:`, error);
      return false;
    });
}

function ticketChannelRenameCooldownRemaining(channelId) {
  const lastRenamedAt = ticketChannelLastRenamedAt.get(channelId);
  if (!lastRenamedAt) return 0;

  return Math.max(0, ticketChannelRenameCooldownMs - (Date.now() - lastRenamedAt));
}

function queueTicketChannelRename(channel, name, delayMs = 500) {
  const existingJob = ticketChannelRenameJobs.get(channel.id);
  const job = existingJob || { channel, name, timer: null, running: false, warned: false };
  job.channel = channel;
  job.name = name;
  ticketChannelRenameJobs.set(channel.id, job);

  if (job.timer) clearTimeout(job.timer);
  job.timer = setTimeout(() => {
    job.timer = null;
    void runQueuedTicketChannelRename(channel.id);
  }, delayMs);
}

async function syncTicketChannelName(channel, name) {
  const existingJob = ticketChannelRenameJobs.get(channel.id);
  if (existingJob?.timer) clearTimeout(existingJob.timer);
  ticketChannelRenameJobs.delete(channel.id);

  const cooldownRemaining = ticketChannelRenameCooldownRemaining(channel.id);
  if (channel.name !== name && cooldownRemaining > 0) {
    queueTicketChannelRename(channel, name, cooldownRemaining + 1_000);
    return false;
  }

  const renamed = await renameTicketChannel(channel, name);
  if (!renamed) {
    queueTicketChannelRename(channel, name, 10 * 60_000);
  }
  return renamed;
}

async function runQueuedTicketChannelRename(channelId) {
  const job = ticketChannelRenameJobs.get(channelId);
  if (!job || job.running) return;

  job.running = true;
  const attemptedName = job.name;
  const cooldownRemaining = ticketChannelRenameCooldownRemaining(channelId);
  if (job.channel.name !== attemptedName && cooldownRemaining > 0) {
    job.running = false;
    queueTicketChannelRename(job.channel, attemptedName, cooldownRemaining + 1_000);
    return;
  }

  const renamed = await renameTicketChannel(job.channel, attemptedName);
  job.running = false;

  if (job.name !== attemptedName) {
    queueTicketChannelRename(job.channel, job.name);
    return;
  }

  if (!renamed) {
    if (!job.warned) {
      job.warned = true;
      await job.channel.send({
        embeds: [styledEmbed('Channel Rename Delayed', 'The ticket priority was saved, but Discord did not rename this channel. I will retry automatically. Check my **Manage Channels** permission if the name stays unchanged.')],
        allowedMentions: { parse: [] }
      }).catch(() => null);
    }
    queueTicketChannelRename(job.channel, job.name, 10 * 60_000);
    return;
  }

  if (!job.timer) ticketChannelRenameJobs.delete(channelId);
}

async function restoreTicketChannelNames() {
  for (const [userId, ticket] of Object.entries(state.ticketsByUserId)) {
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (channel?.type !== ChannelType.GuildText) continue;

    const fallbackName = ticketChannelName(userId, ticket.userName || 'user', ticket.departmentId);
    queueTicketChannelRename(channel, priorityChannelName(ticket, fallbackName));
  }
}

async function handleRenameCommand(message, userId, name) {
  const ticket = state.ticketsByUserId[userId];
  if (!name || !await memberCanReplyToTicket(message, ticket)) {
    await message.reply({ embeds: [styledEmbed('Rename Failed', `Use **${RENAME_COMMAND} <name>** with a ticket reply role.`)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const safeName = safeChannelLabel(name);
  if (!safeName) {
    await message.reply({ embeds: [styledEmbed('Rename Failed', 'Choose a name containing letters or numbers.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  ticket.customChannelName = safeName;
  await saveState();
  const renamed = await syncTicketChannelName(message.channel, priorityChannelName(ticket, safeName));
  await message.reply({
    embeds: [styledEmbed(
      renamed ? 'Ticket Renamed' : 'Ticket Rename Delayed',
      renamed
        ? `Renamed this ticket to **${safeName}**.`
        : `Saved **${safeName}**. The visible channel rename is queued and will retry automatically.`
    )],
    allowedMentions: { repliedUser: false, parse: [] }
  });
}

async function handlePriorityCommand(message, userId, level) {
  const ticket = state.ticketsByUserId[userId];
  const commandPolicy = modmailPrefixCommandPolicy('priority');
  if (!await commandCanRunInTicketBranchForMember(message, commandPolicy, ticket?.departmentId)) {
    await message.reply({
      embeds: [styledEmbed('Priority Not Changed', restrictedTicketBranchMessage(commandPolicy, PRIORITY_COMMAND))],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  if (!await memberCanReplyToTicket(message, ticket)) {
    await message.reply({ embeds: [styledEmbed('Priority Not Changed', 'You need a reply role for this ticket.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const validLevels = ['low', 'normal', 'high', 'urgent'];
  if (!level) {
    await message.reply({ embeds: [styledEmbed('Ticket Priority', `Current priority: **${ticket.priority || 'normal'}**.\n\nValid levels: **${validLevels.join('**, **')}**.`)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  if (!validLevels.includes(level)) {
    await message.reply({ embeds: [styledEmbed('Priority Not Changed', `Valid levels: **${validLevels.join('**, **')}**.`)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  ticket.priority = level;
  await saveState();
  const fallbackName = ticketChannelName(userId, ticket.userName || 'user', ticket.departmentId);
  const renamed = await syncTicketChannelName(message.channel, priorityChannelName(ticket, fallbackName));
  recordHistory(userId, { kind: 'PRIORITY CHANGED', authorId: message.author.id, authorTag: message.author.tag, content: level, attachmentUrls: [] });
  await saveState();
  await message.reply({
    embeds: [styledEmbed(
      'Ticket Priority',
      renamed
        ? `Priority set to **${level}**.`
        : `Priority set to **${level}**. The visible channel rename is queued and will retry automatically.`
    )],
    allowedMentions: { repliedUser: false, parse: [] }
  });
}

async function handleTranscriptCommand(message, userId) {
  const ticket = state.ticketsByUserId[userId];
  if (!await memberCanReplyToTicket(message, ticket)) {
    await message.reply({ embeds: [styledEmbed('Transcript Not Available', 'You need a reply role for this ticket.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  const filename = `modmail-preview-${userId}-${Date.now()}.txt`;
  const file = new AttachmentBuilder(generateTranscriptBuffer({ userId, ticket, closedByTag: message.author.tag, reason: 'Transcript preview' }), { name: filename });
  await message.reply({ embeds: [styledEmbed('Transcript Preview', 'This preview does not close the ticket.')], files: [file], allowedMentions: { repliedUser: false, parse: [] } });
}

async function handleClaimInfoCommand(message, userId) {
  if (!await memberCanUsePrefixWithRoles(message, commandRoleIds('claimInfo'))) {
    await message.reply({ embeds: [styledEmbed('Claim Info Not Available', 'You need a staff hierarchy role to use this command.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  const ticket = state.ticketsByUserId[userId];
  const description = ticket.claimedByStaffTag
    ? `**Claimed By:** ${ticket.claimedByStaffTag}\n**Claimed At:** ${formatTimestamp(ticket.claimedAt || Date.now())}\n**Priority:** ${ticket.priority || 'normal'}`
    : `This ticket is not claimed.\n\n**Priority:** ${ticket.priority || 'normal'}`;
  await message.reply({ embeds: [styledEmbed('Claim Info', description)], allowedMentions: { repliedUser: false, parse: [] } });
}

async function handleCloseInfoCommand(message, userId) {
  if (!await memberCanUsePrefixWithRoles(message, commandRoleIds('closeInfo'))) {
    await message.reply({ embeds: [styledEmbed('Close Info Not Available', 'You need a staff hierarchy role to use this command.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  const closeAt = Number(timedCloseState.ticketsByUserId[userId]?.closeAt);
  const description = Number.isFinite(closeAt)
    ? `**Closes At:** ${formatTimestamp(closeAt)}\n**Remaining:** ${formatDuration(closeAt - Date.now())}`
    : 'This ticket does not have an active close timer.';
  await message.reply({ embeds: [styledEmbed('Close Info', description)], allowedMentions: { repliedUser: false, parse: [] } });
}

async function handleHiddenDeleteBotMessageCommand(message, messageUrl) {
  const parsedUrl = parseDiscordMessageUrl(messageUrl);
  if (!parsedUrl) return;

  const permissionGuildId = message.guild?.id || configuredGuildId || parsedUrl.guildId;
  if (parsedUrl.guildId !== '@me' && parsedUrl.guildId !== permissionGuildId) return;
  if (!await memberCanUsePolicyCommand(permissionGuildId, message.author.id, 'hiddenDeleteBotMessage')) return;

  const targetChannel = await client.channels.fetch(parsedUrl.channelId).catch(() => null);
  if (!targetChannel?.isTextBased?.() || !targetChannel.messages?.fetch) return;

  const targetMessage = await targetChannel.messages.fetch(parsedUrl.messageId).catch(() => null);
  if (!targetMessage) return;

  if (targetMessage.author?.id !== client.user.id) return;

  await targetMessage.delete(`Hidden delete command used by ${message.author.tag}`)
    .catch((error) => {
      console.error(`Hidden delete command could not delete message ${parsedUrl.messageId}:`, error);
    });
}

async function handleReportFinishedCommand(message, userId) {
  const ticket = state.ticketsByUserId[userId];
  if (!ticket) {
    await message.reply({
      embeds: [styledEmbed('Reply Not Sent', 'This channel is not linked to an open modmail ticket.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const commandPolicy = modmailPrefixCommandPolicy('reportFinished');
  if (!await commandCanRunInTicketBranchForMember(message, commandPolicy, ticket.departmentId)) {
    await message.reply({
      embeds: [styledEmbed('Reply Not Sent', restrictedTicketBranchMessage(commandPolicy, REPORT_FINISHED_COMMAND))],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const replyRoleIds = ticketRoleIdsForCommand(commandPolicy, ticket.departmentId);
  if (!replyRoleIds.length) {
    await message.reply({
      embeds: [styledEmbed('Reply Not Sent', 'No moderation reply roles are configured.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const canReply = await memberCanUsePrefixWithRoles(message, replyRoleIds);
  if (!canReply) {
    await message.reply({
      embeds: [styledEmbed('Reply Not Sent', `You need a moderation reply role to use **${REPORT_FINISHED_COMMAND}**.`)],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  await relayStaffReply(message, userId, REPORT_FINISHED_MESSAGE);
}

async function handleTimedCloseCommand(message, userId, minutesText) {
  const ticket = state.ticketsByUserId[userId];
  if (!ticket) {
    await message.reply({
      embeds: [styledEmbed('Timed Close Not Started', 'This channel is not linked to an open modmail ticket.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const minutes = Number(minutesText);
  const autoCloseAt = Date.now() + (minutes * 60_000);
  if (!Number.isSafeInteger(minutes) || minutes <= 0 || !Number.isSafeInteger(autoCloseAt)) {
    await message.reply({
      embeds: [styledEmbed('Timed Close Not Started', `Use **${TIMED_CLOSE_COMMAND} <time>** with a positive whole number of minutes, such as **${TIMED_CLOSE_COMMAND} 60**.`)],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const department = departmentFor(ticket.departmentId);
  const closeRoleIds = roleIdsFor(ticket.departmentId, 'close');
  if (!closeRoleIds.length) {
    await message.reply({
      embeds: [styledEmbed('Timed Close Not Started', `No close roles are configured for **${department?.label || ticket.departmentId}**.`)],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const canClose = await memberCanUsePrefixWithRoles(message, closeRoleIds);
  if (!canClose) {
    await message.reply({
      embeds: [styledEmbed('Timed Close Not Started', `You need a **${department?.label || 'wing'}** close role to use **${TIMED_CLOSE_COMMAND}** in this ticket.`)],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) {
    await message.reply({
      embeds: [styledEmbed('Timed Close Not Started', 'I could not find the user for this ticket.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const delivered = await user.send({
    embeds: [styledEmbed('Staff Reply', TIMED_CLOSE_MESSAGE)],
    allowedMentions: { parse: [] }
  }).then(() => true).catch(() => false);

  if (!delivered) {
    await message.reply({
      embeds: [styledEmbed('Timed Close Not Started', 'I could not DM this user. They may have DMs disabled or may have blocked the bot.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  recordHistory(userId, {
    kind: 'STAFF REPLY',
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: TIMED_CLOSE_MESSAGE,
    attachmentUrls: []
  });
  ticket.lastReplyStaffUserId = message.author.id;
  timedCloseState.ticketsByUserId[userId] = {
    channelId: ticket.channelId,
    closeAt: autoCloseAt
  };
  await saveState();
  await saveTimedCloseState();
  scheduleTimedClose(userId);

  await message.delete().catch(() => null);
  await message.channel.send({
    embeds: [
      styledEmbed('Staff Reply', TIMED_CLOSE_MESSAGE)
        .setAuthor({
          name: message.author.username,
          iconURL: message.author.displayAvatarURL()
        })
    ],
    allowedMentions: { parse: [] }
  });
}

async function recordStaffNote(message, userId) {
  if (!message.content && !message.attachments.size) return;

  recordHistory(userId, {
    kind: 'STAFF NOTE',
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: message.content || '',
    attachmentUrls: attachmentUrlsFromMessage(message)
  });
  await saveState();
}

function generateTranscriptBuffer({ userId, ticket, closedByTag, reason }) {
  const department = departmentFor(ticket.departmentId);
  const openedAt = ticket.openedAt || Date.now();
  const closedAt = Date.now();
  const history = ticket.history || [];
  const lines = [
    '═══════════════════════════════════════════════════════',
    '                    MODMAIL TICKET LOG                 ',
    '═══════════════════════════════════════════════════════',
    '',
    `Ticket Closed : ${formatTimestamp(closedAt)}`,
    `Ticket Opened : ${formatTimestamp(openedAt)}`,
    `Duration      : ${formatDuration(closedAt - openedAt)}`,
    `Wing          : ${department?.label || ticket.departmentId || 'unknown'}`,
    `Priority      : ${ticket.priority || 'normal'}`,
    `Total Entries : ${history.length}`,
    `Closed By     : ${closedByTag}`,
    `Close Reason  : ${reason}`,
    '',
    '───────────────────────────────────────────────────────',
    '  USER DETAILS',
    '───────────────────────────────────────────────────────',
    '',
    `  Discord Tag : ${ticket.userTag || 'unknown'}`,
    `  Discord ID  : ${userId}`,
    '',
    '───────────────────────────────────────────────────────',
    '  FULL TICKET LOG',
    '───────────────────────────────────────────────────────',
    ''
  ];

  if (!history.length) {
    lines.push('  [No messages were recorded]');
  } else {
    for (const entry of history) {
      lines.push(`[${formatTimestamp(entry.timestamp)}] ${entry.kind} (${entry.authorTag || entry.authorId})`);
      if (entry.content) {
        lines.push(`  ${entry.content}`);
      }
      for (const url of entry.attachmentUrls || []) {
        lines.push(`  [Attachment] ${url}`);
      }
      lines.push('');
    }
  }

  lines.push('═══════════════════════════════════════════════════════');
  lines.push('                     END OF LOG                        ');
  lines.push('═══════════════════════════════════════════════════════');

  return Buffer.from(lines.join('\n'), 'utf-8');
}

function transcriptEmbed({ userId, ticket, filename, reason, closedByTag }) {
  const department = departmentFor(ticket.departmentId);
  const openedAt = ticket.openedAt || Date.now();
  const duration = formatDuration(Date.now() - openedAt);
  const history = ticket.history || [];

  return new EmbedBuilder()
    .setColor(STYLE_COLOR)
    .setTitle('ModMail Transcript')
    .setDescription('A modmail ticket has been closed. The full ticket log is attached below as a text file.')
    .addFields(
      {
        name: 'User',
        value: `ID: \`${userId}\`\nTag: **${ticket.userTag || 'unknown'}**`,
        inline: true
      },
      {
        name: 'Ticket',
        value: `Wing: **${department?.label || ticket.departmentId || 'unknown'}**\nEntries: **${history.length.toLocaleString()}**`,
        inline: true
      },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: 'Duration', value: duration, inline: true },
      { name: 'Closed By', value: closedByTag, inline: true },
      { name: 'Log File', value: filename, inline: true },
      { name: 'Reason', value: trimTo(reason, 1000), inline: false }
    )
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();
}

async function sendTranscript(channel, userId, ticket, closedBy, reason) {
  const logChannelId = process.env.TRANSCRIPT_CHANNEL_ID || channel.id;
  const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
  if (!logChannel?.isTextBased()) return;

  const filename = `modmail-${userId}-${Date.now()}.txt`;
  const file = new AttachmentBuilder(
    generateTranscriptBuffer({
      userId,
      ticket,
      closedByTag: closedBy.tag,
      reason
    }),
    { name: filename }
  );

  await logChannel.send({
    embeds: [transcriptEmbed({ userId, ticket, filename, reason, closedByTag: closedBy.tag })],
    files: [file],
    allowedMentions: { parse: [] }
  }).catch(() => null);
}

async function sendApplicationDecisionLog({ action, targetUser, moderator }) {
  if (!process.env.TRANSCRIPT_CHANNEL_ID) return;

  const logChannel = await client.channels.fetch(process.env.TRANSCRIPT_CHANNEL_ID).catch(() => null);
  if (!logChannel?.isTextBased() || !logChannel.send) return;

  await logChannel.send({
    embeds: [
      styledEmbed(
        `Application ${action}`,
        [
          `**Applicant:** ${targetUser.tag} (\`${targetUser.id}\`)`,
          `**Handled By:** ${moderator.tag} (\`${moderator.id}\`)`
        ].join('\n')
      )
    ],
    allowedMentions: { parse: [] }
  }).catch(() => null);
}

async function closeTicket(channel, closedBy, reason = 'Resolved', options = {}) {
  if (!channel?.id) {
    return { ok: false, message: 'This command can only be used inside a modmail channel.' };
  }

  const userId = userIdForChannel(channel.id);
  if (!userId) {
    return { ok: false, message: 'This channel is not an open modmail thread.' };
  }

  const ticket = state.ticketsByUserId[userId];
  if (!options.skipPermissionCheck) {
    if (!await memberCanUseClaimedTicketCommands(channel.guild.id, closedBy.id, ticket)) {
      return { ok: false, message: `Claim this ticket with ${CLAIM_COMMAND} before using ticket commands.` };
    }

    const department = departmentFor(ticket.departmentId);
    const closeRoleIds = roleIdsFor(ticket.departmentId, 'close');
    if (!closeRoleIds.length) {
      return {
        ok: false,
        message: `No close roles are configured for ${department?.label || ticket.departmentId} in ${TICKET_BRANCH_POLICY_FILE}.`
      };
    }

    const canClose = await memberCanUsePrefixRoles(channel.guild.id, closedBy.id, closeRoleIds);
    if (!canClose) {
      return { ok: false, message: `You need a ${department?.label || 'wing'} close role to close this ticket.` };
    }
  }

  const user = await client.users.fetch(userId).catch(() => null);
  await removeTimedClose(userId);

  recordHistory(userId, {
    kind: 'TICKET CLOSED',
    authorId: closedBy.id,
    authorTag: closedBy.tag,
    content: reason,
    attachmentUrls: []
  });
  await saveState();

  await sendTranscript(channel, userId, ticket, closedBy, reason);

  delete state.ticketsByUserId[userId];
  await saveState();

  if (user) {
    await user.send({
      embeds: [
        styledEmbed(
          'Ticket Closed',
          [
            'Thank you for opening a ticket.',
            'Your ticket has now been closed.',
            '',
            `**Reason:** ${trimTo(reason, 800)}`
          ].join('\n')
        )
      ],
      allowedMentions: { parse: [] }
    }).catch(() => null);
  }

  await channel.send({
    embeds: [styledEmbed('Thread Closed', `Closed by **${closedBy.tag}**.\n\n**Reason:** ${trimTo(reason, 800)}`)],
    allowedMentions: { parse: [] }
  }).catch(() => null);

  if (process.env.TRANSCRIPT_CHANNEL_ID) {
    setTimeout(() => {
      channel.delete(`ModMail closed by ${closedBy.tag}: ${reason}`).catch(() => null);
    }, 5000);
  }

  return { ok: true, message: 'Closed this modmail thread.' };
}

async function forceCloseTicketByUserId(userId, closedBy, reason = 'Force closed') {
  const ticket = state.ticketsByUserId[userId];
  const pending = state.pendingByUserId[userId];
  if (!ticket) {
    if (pending) {
      delete state.pendingByUserId[userId];
      await removeTimedClose(userId);
      await saveState();
      return { ok: true, message: `Removed pending ticket state for <@${userId}>.` };
    }

    return { ok: false, message: `No open ticket is tracked for <@${userId}>.` };
  }

  const channel = ticket.channelId ? await client.channels.fetch(ticket.channelId).catch(() => null) : null;
  if (channel?.type === ChannelType.GuildText) {
    const result = await closeTicket(channel, closedBy, reason, { skipPermissionCheck: true });
    if (result.ok && pending) {
      delete state.pendingByUserId[userId];
      await saveState();
    }
    return result;
  }

  await removeTimedClose(userId);
  recordHistory(userId, {
    kind: 'TICKET FORCE CLOSED',
    authorId: closedBy.id,
    authorTag: closedBy.tag,
    content: `${reason}; staff channel was missing or inaccessible`,
    attachmentUrls: []
  });
  delete state.ticketsByUserId[userId];
  delete state.pendingByUserId[userId];
  await saveState();
  return { ok: true, message: `Removed stale ticket state for <@${userId}>.` };
}

async function handleForceCloseCommand(interaction) {
  const allowed = await canUseInteractionPolicyCommand(interaction, 'fclose');
  if (!allowed) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      ephemeral: true
    });
    return;
  }

  const closeAll = interaction.options.getBoolean('all') || false;
  const targetUser = interaction.options.getUser('user');

  if (closeAll) {
    await interaction.deferReply({ ephemeral: true });
    const userIds = [...new Set([
      ...Object.keys(state.ticketsByUserId),
      ...Object.keys(state.pendingByUserId)
    ])];
    let closed = 0;
    let failed = 0;
    const details = [];

    for (const userId of userIds) {
      const result = await forceCloseTicketByUserId(userId, interaction.user, 'Force closed by /fclose all');
      if (result.ok) {
        closed += 1;
      } else {
        failed += 1;
      }
      details.push(`${result.ok ? 'Closed' : 'Failed'} ${userId}: ${result.message}`);
    }

    await interaction.editReply([
      `Force close complete. Closed **${closed}** ticket(s). Failed **${failed}**.`,
      details.length ? trimTo(details.join('\n'), 1800) : 'No open tickets were tracked.'
    ].join('\n\n'));
    return;
  }

  const channelUserId = interaction.channel?.id ? userIdForChannel(interaction.channel.id) : null;
  const userId = targetUser?.id || channelUserId;
  if (!userId) {
    await interaction.reply({
      content: 'Use `/fclose user:<user>` outside a ticket channel, or use `/fclose all:true` to force close every tracked ticket.',
      ephemeral: true
    });
    return;
  }

  const result = await forceCloseTicketByUserId(userId, interaction.user, 'Force closed by /fclose');
  await interaction.reply({
    content: result.message,
    ephemeral: !result.ok
  });
}

async function canUseInteractionPolicyCommand(interaction, commandName) {
  if (!interaction.guildId) return false;

  return memberCanUsePolicyCommand(interaction.guildId, interaction.user.id, commandName);
}

async function handleApproveCommand(interaction) {
  const allowed = await canUseInteractionPolicyCommand(interaction, 'approve');
  if (!allowed) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      ephemeral: true
    });
    return;
  }

  const approvedRoleId = process.env.APPROVED_APPLICANT_ROLE_ID;
  const ghostPingChannelId = process.env.APPROVE_GHOST_PING_CHANNEL_ID;
  if (!ghostPingChannelId) {
    await interaction.reply({
      content: 'The approve command is missing APPROVE_GHOST_PING_CHANNEL_ID in the environment.',
      ephemeral: true
    });
    return;
  }

  const assistantRankOnePart = numberedHierarchyPartsForWing('assistants')
    .find((entry) => entry.level === 1);
  if (!assistantRankOnePart) {
    await interaction.reply({
      content: `The approve command is missing Assistant rank 1 in staffHierarchy.assistants in ${ROLE_POLICY_FILE}.`,
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user', true);
  const guild = await findGuild();
  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.editReply('I could not find that user in this server.');
    return;
  }

  const assistantRole = await guild.roles.fetch(assistantRankOnePart.roleId).catch(() => null);
  if (!assistantRole) {
    await interaction.editReply(`I could not find the Assistant rank 1 role \`${assistantRankOnePart.roleId}\`.`);
    return;
  }

  const approvedRole = approvedRoleId && approvedRoleId !== assistantRankOnePart.roleId
    ? await guild.roles.fetch(approvedRoleId).catch(() => null)
    : null;
  if (approvedRoleId && approvedRoleId !== assistantRankOnePart.roleId && !approvedRole) {
    await interaction.editReply(`I could not find the optional approved applicant role \`${approvedRoleId}\`.`);
    return;
  }

  const ghostPingChannel = await client.channels.fetch(ghostPingChannelId).catch(() => null);
  if (!ghostPingChannel?.isTextBased() || !ghostPingChannel.send) {
    await interaction.editReply(`I could not access the ghost ping channel \`${ghostPingChannelId}\`.`);
    return;
  }

  await targetUser.send({
    content: APPROVE_DM_MESSAGE.replace('<user>', `<@${targetUser.id}>`),
    allowedMentions: { users: [targetUser.id] }
  }).catch(() => null);

  const rolesToAdd = [assistantRole, approvedRole].filter(Boolean);
  await targetMember.roles.add(rolesToAdd, `Application approved by ${interaction.user.tag}`).catch(() => null);

  const ghostPing = await ghostPingChannel.send({
    content: `<@${targetUser.id}>`,
    allowedMentions: { users: [targetUser.id] }
  }).catch(() => null);
  if (ghostPing) {
    await sleep(500);
    await ghostPing.delete().catch(() => null);
  }

  await interaction.editReply(`Approved ${targetUser.tag}.`);
  await sendApplicationDecisionLog({
    action: 'Approved',
    targetUser,
    moderator: interaction.user
  });
}

async function handleRejectCommand(interaction) {
  const allowed = await canUseInteractionPolicyCommand(interaction, 'reject');
  if (!allowed) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user', true);
  await targetUser.send({
    content: REJECT_DM_MESSAGE,
    allowedMentions: { parse: [] }
  }).catch(() => null);

  await interaction.editReply(`Rejected ${targetUser.tag}.`);
  await sendApplicationDecisionLog({
    action: 'Rejected',
    targetUser,
    moderator: interaction.user
  });
}

async function handleDemoteCommand(interaction) {
  const allowed = await memberCanRunDemote(interaction);
  if (!allowed) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      ephemeral: true
    });
    return;
  }

  const wing = interaction.options.getString('wing', true);
  const wingId = normalizeStaffWingId(wing);
  const wingName = staffWingNameFor(wing);
  const numberedParts = numberedHierarchyPartsForWing(wingId);
  const leadPart = leadHierarchyPartForWing(wingId);
  if (!numberedParts.length) {
    await interaction.reply({
      content: `The demote command is missing numbered staffHierarchy roles for ${wingName} in ${ROLE_POLICY_FILE}.`,
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);
  const guild = await findGuild();
  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.editReply({
      content: 'I could not find that user in this server.'
    });
    return;
  }

  if (demoteExemptRoleIds().some((roleId) => targetMember.roles.cache.has(roleId))) {
    await interaction.editReply({
      content: `${targetUser.username} has a demotion-exempt role.`
    });
    return;
  }

  const currentLeadPart = memberLeadHierarchyPartForWing(targetMember, wingId);
  const currentNumberedPart = memberNumberedHierarchyPartForWing(targetMember, wingId);
  const currentPart = currentLeadPart || currentNumberedPart;

  if (!currentPart) {
    await interaction.editReply({
      content: `${targetUser.username} does not have a configured staff role in the ${wingName} wing.`
    });
    return;
  }

  const currentRoleId = currentPart.roleId;
  const currentRole = await guild.roles.fetch(currentRoleId).catch(() => null);
  if (!currentRole) {
    await interaction.editReply({
      content: `I could not find the current staff role \`${currentRoleId}\`.`
    });
    return;
  }

  const targetPart = currentLeadPart
    ? numberedParts[numberedParts.length - 1]
    : [...numberedParts].reverse().find((entry) => (entry.level || 0) < (currentNumberedPart.level || 0));

  if (!targetPart) {
    const auditReason = `Removed from ${wingName} by ${interaction.user.tag}: ${reason}`;
    await targetMember.roles.remove(currentRole, auditReason);
    await removeCategoryRoleForWing(targetMember, wingId, auditReason);
    await syncLeadCategoryRole(targetMember, auditReason);
    await targetUser.send({
      content: [
        `You have been removed from the ${wingName} wing.`,
        '',
        `**Reason:** ${reason}`,
        '',
        'To review more specific details, please open a ticket in modmail under the "Internals" section.'
      ].join('\n'),
      allowedMentions: { parse: [] }
    }).catch(() => null);

    await interaction.editReply(`${targetUser.username} has been removed from the ${wingName} wing.`);
    return;
  }

  const nextRoleId = targetPart.roleId;
  const nextRole = await guild.roles.fetch(nextRoleId).catch(() => null);
  if (!nextRole) {
    await interaction.editReply({
      content: `I could not find the demotion target role \`${nextRoleId}\`.`
    });
    return;
  }

  await targetMember.roles.add(nextRole, `Demoted in ${wingName} by ${interaction.user.tag}: ${reason}`);
  await targetMember.roles.remove(currentRole, `Demoted in ${wingName} by ${interaction.user.tag}: ${reason}`);
  await syncCategoryRoleForWing(targetMember, wingId, `Demoted in ${wingName} by ${interaction.user.tag}: ${reason}`);
  await syncLeadCategoryRole(targetMember, `Demoted in ${wingName} by ${interaction.user.tag}: ${reason}`);
  await targetUser.send({
    content: [
      `You have been demoted to ${nextRole.name} in the ${wingName} wing.`,
      '',
      `**Reason:** ${reason}`,
      '',
      'To review more specific details, please open a ticket in modmail under the "Internals" section.'
    ].join('\n'),
    allowedMentions: { parse: [] }
  }).catch(() => null);

  await interaction.editReply(`${targetUser.username} has been demoted in the ${wingName} wing.`);
}

async function handlePromoteCommand(interaction) {
  const allowed = await memberCanRunDemote(interaction);
  if (!allowed) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      ephemeral: true
    });
    return;
  }

  const wing = interaction.options.getString('wing', true);
  const wingId = normalizeStaffWingId(wing);
  const wingName = staffWingNameFor(wing);
  const numberedParts = numberedHierarchyPartsForWing(wingId);
  if (!numberedParts.length) {
    await interaction.reply({
      content: `The promote command is missing numbered staffHierarchy roles for ${wingName} in ${ROLE_POLICY_FILE}.`,
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user', true);
  const guild = await findGuild();
  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.editReply('I could not find that user in this server.');
    return;
  }

  const nonAssistantWings = nonAssistantStaffWingIds(targetMember);
  if (nonAssistantWings.length && !nonAssistantWings.includes(wingId)) {
    await interaction.editReply(`${targetUser.username} is already in the ${staffWingNameFor(nonAssistantWings[0])} wing. Cross-wing promotions must start from Assistants.`);
    return;
  }

  const currentLeadPart = memberLeadHierarchyPartForWing(targetMember, wingId);
  if (currentLeadPart) {
    await interaction.editReply(`${targetUser.username} is already a ${wingName} lead. Use /demote to move them back into the numbered hierarchy.`);
    return;
  }

  const currentNumberedPart = memberNumberedHierarchyPartForWing(targetMember, wingId);
  const assistantPartsToRemove = wingId === 'assistants'
    ? []
    : memberHierarchyPartsForWing(targetMember, 'assistants').map((entry) => entry.roleId);
  const targetPart = currentNumberedPart
    ? numberedParts.find((entry) => (entry.level || 0) > (currentNumberedPart.level || 0))
    : numberedParts[0];

  if (!currentNumberedPart && !assistantPartsToRemove.length && wingId !== 'assistants') {
    await interaction.editReply(`${targetUser.username} must be in Assistants before being promoted into ${wingName}.`);
    return;
  }

  if (!targetPart) {
    await interaction.editReply(`${targetUser.username} is already at the highest numbered ${wingName} role. Use /makelead to assign the lead role.`);
    return;
  }

  const removeRoleIds = [
    currentNumberedPart?.roleId,
    ...assistantPartsToRemove
  ].filter(Boolean);
  const targetRole = await guild.roles.fetch(targetPart.roleId).catch(() => null);
  if (!targetRole) {
    await interaction.editReply(`I could not find the promotion target role \`${targetPart.roleId}\`.`);
    return;
  }

  const auditReason = `Promoted in ${wingName} by ${interaction.user.tag}`;
  await targetMember.roles.add(targetRole, auditReason);
  if (removeRoleIds.length) {
    await targetMember.roles.remove([...new Set(removeRoleIds)], auditReason);
  }
  await syncCategoryRoleForWing(targetMember, wingId, auditReason);
  await syncLeadCategoryRole(targetMember, auditReason);

  await interaction.editReply(`${targetUser.username} has been promoted to ${targetRole.name} in the ${wingName} wing.`);
}

async function handleMakeLeadCommand(interaction) {
  const allowed = await memberCanRunDemote(interaction);
  if (!allowed) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      ephemeral: true
    });
    return;
  }

  const wing = interaction.options.getString('wing', true);
  const wingId = normalizeStaffWingId(wing);
  const wingName = staffWingNameFor(wing);
  const leadPart = leadHierarchyPartForWing(wingId);
  if (!leadPart) {
    await interaction.reply({
      content: `The makelead command is missing an M staffHierarchy role for ${wingName} in ${ROLE_POLICY_FILE}.`,
      ephemeral: true
    });
    return;
  }
  const sharedLeadRoleId = leadCategoryRoleId();
  if (!sharedLeadRoleId) {
    await interaction.reply({
      content: `The makelead command is missing leadCategoryRole in ${ROLE_POLICY_FILE}. Set it to the shared head-of-wing role ID.`,
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user', true);
  const guild = await findGuild();
  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.editReply('I could not find that user in this server.');
    return;
  }

  const nonAssistantWings = nonAssistantStaffWingIds(targetMember);
  if (nonAssistantWings.length && !nonAssistantWings.includes(wingId)) {
    await interaction.editReply(`${targetUser.username} is already in the ${staffWingNameFor(nonAssistantWings[0])} wing. Cross-wing lead assignments must start from Assistants.`);
    return;
  }

  const leadRole = await guild.roles.fetch(leadPart.roleId).catch(() => null);
  if (!leadRole) {
    await interaction.editReply(`I could not find the ${wingName} lead role \`${leadPart.roleId}\`.`);
    return;
  }
  const sharedLeadRole = await guild.roles.fetch(sharedLeadRoleId).catch(() => null);
  if (!sharedLeadRole) {
    await interaction.editReply(`I could not find the shared head-of-wing role \`${sharedLeadRoleId}\`.`);
    return;
  }

  const targetWingRoleIds = memberHierarchyPartsForWing(targetMember, wingId).map((entry) => entry.roleId);
  const assistantRoleIds = memberHierarchyPartsForWing(targetMember, 'assistants').map((entry) => entry.roleId);
  if (!targetWingRoleIds.length && !assistantRoleIds.length) {
    await interaction.editReply(`${targetUser.username} must already be in ${wingName}${wingId === 'assistants' ? '' : ' or Assistants'} before becoming a lead.`);
    return;
  }

  const removeRoleIds = memberHierarchyPartsForWing(targetMember, wingId)
    .map((entry) => entry.roleId)
    .filter((roleId) => roleId !== leadPart.roleId);
  if (wingId !== 'assistants') {
    removeRoleIds.push(...memberHierarchyPartsForWing(targetMember, 'assistants').map((entry) => entry.roleId));
  }

  const auditReason = `Made ${wingName} lead by ${interaction.user.tag}`;
  const addRoles = [leadRole, sharedLeadRole].filter((role) => !targetMember.roles.cache.has(role.id));
  if (addRoles.length) {
    await targetMember.roles.add(addRoles, auditReason);
  }
  const uniqueRemoveRoleIds = [...new Set(removeRoleIds)].filter((roleId) => targetMember.roles.cache.has(roleId));
  if (uniqueRemoveRoleIds.length) {
    await targetMember.roles.remove(uniqueRemoveRoleIds, auditReason);
  }
  await syncCategoryRoleForWing(targetMember, wingId, auditReason);
  await syncLeadCategoryRole(targetMember, auditReason);

  const categoryRoleId = categoryRoleIdsByWing()[wingId];
  const assignedRoleIds = [
    leadRole.id,
    sharedLeadRole.id,
    categoryRoleId
  ].filter(Boolean);
  await interaction.editReply(`${targetUser.username} has been made ${wingName} lead with ${assignedRoleIds.map((roleId) => `<@&${roleId}>`).join(', ')}.`);
}

async function handleStrikeCommand(interaction) {
  const allowed = await canUseInteractionPolicyCommand(interaction, 'strike');
  if (!allowed) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      ephemeral: true
    });
    return;
  }

  const hierarchyRoleIds = staffRoleHierarchyIds();
  if (!hierarchyRoleIds.length) {
    await interaction.reply({
      content: `The strike command is missing staffHierarchy roles in ${ROLE_POLICY_FILE}.`,
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);
  const guild = await findGuild();
  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.editReply('I could not find that user in this server.');
    return;
  }

  const isStaffMember = hierarchyRoleIds.some((roleId) => targetMember.roles.cache.has(roleId));
  if (!isStaffMember) {
    await interaction.editReply(`${targetUser.username} does not have a configured staff role.`);
    return;
  }

  const strikes = strikeRecordsFor(targetUser.id);
  strikes.push({ reason });
  state.strikesByUserId[targetUser.id] = strikes;
  await saveState();

  await targetUser.send({
    content: [
      'You have been given a strike.',
      '',
      `**Reason:** ${reason}`,
      '',
      'If you think this is a mistake, please open a ticket under the "Internals" section.'
    ].join('\n'),
    allowedMentions: { parse: [] }
  }).catch(() => null);

  const strikeCount = strikes.length;
  await interaction.editReply(
    `Gave ${targetUser.tag} a strike. They now have ${strikeCount} strike${strikeCount === 1 ? '' : 's'}.`
  );
}

function strikeRecordsFor(userId) {
  const strikes = state.strikesByUserId[userId];
  if (Array.isArray(strikes)) {
    return strikes.map((strike) => ({
      reason: strike?.reason || 'Reason unavailable.'
    }));
  }

  const legacyStrikeCount = Number(strikes) || 0;
  return Array.from({ length: legacyStrikeCount }, () => ({
    reason: 'Reason unavailable. This strike was recorded before reasons were stored.'
  }));
}

async function handleStrikesCommand(interaction) {
  const hierarchyRoleIds = staffRoleHierarchyIds();
  if (!hierarchyRoleIds.length) {
    await interaction.reply({
      content: `The strikes command is missing staffHierarchy roles in ${ROLE_POLICY_FILE}.`,
      ephemeral: true
    });
    return;
  }

  const requestedUser = interaction.options.getUser('user');
  const checkingAnotherUser = requestedUser && requestedUser.id !== interaction.user.id;
  const canCheckOthers = await canUseInteractionPolicyCommand(interaction, 'strikesOthers');
  if (checkingAnotherUser && !canCheckOthers) {
    await interaction.reply({
      content: "You do not have permission to check another user's strikes.",
      ephemeral: true
    });
    return;
  }

  const canCheckOwnStrikes = await memberHasAnyRole(interaction.guildId, interaction.user.id, hierarchyRoleIds);
  if (!checkingAnotherUser && !canCheckOwnStrikes && !canCheckOthers) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      ephemeral: true
    });
    return;
  }

  const targetUser = requestedUser || interaction.user;
  const strikes = strikeRecordsFor(targetUser.id);
  const description = strikes.length
    ? trimTo(strikes.map((strike, index) => [
      `**Strike ${index + 1}**`,
      `**Reason:** ${strike.reason}`
    ].join('\n')).join('\n\n'), 3900)
    : 'This user does not have any strikes.';

  await interaction.reply({
    embeds: [styledEmbed(`${targetUser.username}'s Strikes`, description)],
    ephemeral: true
  });
}

async function handleRemoveStrikeCommand(interaction) {
  const allowed = await canUseInteractionPolicyCommand(interaction, 'removeStrike');
  if (!allowed) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user', true);
  const strikes = strikeRecordsFor(targetUser.id);
  if (!strikes.length) {
    await interaction.editReply(`${targetUser.username} does not have any strikes.`);
    return;
  }

  strikes.pop();
  if (strikes.length) {
    state.strikesByUserId[targetUser.id] = strikes;
  } else {
    delete state.strikesByUserId[targetUser.id];
  }
  await saveState();

  await targetUser.send({
    content: 'A strike has been removed from your profile.',
    allowedMentions: { parse: [] }
  }).catch(() => null);

  await interaction.editReply(
    `Removed a strike from ${targetUser.tag}. They now have ${strikes.length} strike${strikes.length === 1 ? '' : 's'}.`
  );
}

async function pbanLogChannel() {
  const channel = await client.channels.fetch(PBAN_LOG_CHANNEL_ID).catch(() => null);
  return channel?.isTextBased() && channel.send ? channel : null;
}

async function sendPbanLog(proposal, title, details, files = []) {
  const channel = await pbanLogChannel();
  if (!channel) return;

  await channel.send({
    embeds: [
      styledEmbed(
        title,
        [
          `**Person:** <@${proposal.targetUserId}> (\`${proposal.targetUserId}\`)`,
          `**Reason:** ${trimTo(proposal.reason, 1000)}`,
          `**Command Executor:** <@${proposal.executorUserId}>`,
          `**Proposal:** https://discord.com/channels/${proposal.guildId}/${proposal.channelId}/${proposal.messageId}`,
          '',
          details
        ].filter(Boolean).join('\n')
      )
    ],
    files,
    allowedMentions: { parse: [] }
  }).catch(() => null);
}

async function sendAntiBotAutomodLog(message, status, details = '') {
  const channel = await pbanLogChannel();
  if (!channel) return;

  await channel.send({
    embeds: [
      styledEmbed(
        'Anti-Bot Automod Ban',
        [
          `**Person:** <@${message.author.id}> (\`${message.author.id}\`)`,
          `**User Tag:** ${message.author.tag}`,
          `**Channel:** <#${message.channel.id}>`,
          `**Reason:** ${ANTI_BOT_AUTOMOD_REASON}`,
          `**Message ID:** \`${message.id}\``,
          `**Status:** ${status}`,
          message.content ? `**Message:** ${trimTo(message.content, 1000)}` : '',
          details
        ].filter(Boolean).join('\n')
      )
    ],
    allowedMentions: { parse: [] }
  }).catch(() => null);
}

async function handleAntiBotAutomodMessage(message) {
  if (message.channel.id !== ANTI_BOT_AUTOMOD_CHANNEL_ID || !message.guild) return false;

  const deleted = await message.delete().then(() => true).catch((error) => {
    console.error(`Anti-bot automod could not delete message ${message.id}:`, error);
    return false;
  });

  const banned = await message.guild.members.ban(message.author.id, {
    deleteMessageSeconds: 60 * 60 * 24,
    reason: ANTI_BOT_AUTOMOD_REASON
  }).then(() => true).catch((error) => {
    console.error(`Anti-bot automod ban failed for ${message.author.id}:`, error);
    return false;
  });

  if (!banned) {
    return true;
  }

  await message.author.send({
    embeds: [
      styledEmbed(
        'You Have Been Banned',
        [
          'You have been banned from the server.',
          '',
          `**Reason:** ${ANTI_BOT_AUTOMOD_REASON}`,
          '',
          `You can appeal this ban here: ${PBAN_APPEALS_INVITE}`
        ].join('\n')
      )
    ],
    allowedMentions: { parse: [] }
  }).catch(() => null);

  upsertBanProfile(message.guild.id, message.author, {
    reason: ANTI_BOT_AUTOMOD_REASON,
    bannedAt: Date.now(),
    bannedByUserId: client.user.id,
    bannedByTag: client.user.tag,
    bannedByBot: true,
    banSource: 'anti_bot_automod',
    proofUrls: []
  });
  await saveState();

  await sendAntiBotAutomodLog(
    message,
    'Banned',
    `**Trap Message Deleted:** ${deleted ? 'Yes' : 'No'}`
  );

  return true;
}

function canCleanupMessagesInChannel(channel, member) {
  if (!channel?.isTextBased?.() || !channel.messages?.fetch || !member) return false;

  const permissions = channel.permissionsFor(member);
  return Boolean(permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.ManageMessages
  ]));
}

async function cleanupUserMessagesInGuild(guild, userId, limitPerChannel = 10) {
  const botMember = await guild.members.fetchMe().catch(() => null);
  const channels = await guild.channels.fetch().catch((error) => {
    console.error(`PBAN cleanup could not fetch channels for guild ${guild.id}:`, error);
    return null;
  });
  if (!channels || !botMember) {
    return { channelsScanned: 0, messagesDeleted: 0, channelErrors: 0 };
  }

  let channelsScanned = 0;
  let messagesDeleted = 0;
  let channelErrors = 0;

  for (const channel of channels.values()) {
    if (!canCleanupMessagesInChannel(channel, botMember)) continue;
    channelsScanned += 1;

    try {
      const messages = await channel.messages.fetch({ limit: 100 });
      const userMessages = messages
        .filter((message) => message.author?.id === userId && message.deletable)
        .first(limitPerChannel);

      for (const message of userMessages) {
        const deleted = await message.delete().then(() => true).catch((error) => {
          console.error(`PBAN cleanup could not delete message ${message.id} in ${channel.id}:`, error);
          return false;
        });
        if (deleted) messagesDeleted += 1;
      }
    } catch (error) {
      channelErrors += 1;
      console.error(`PBAN cleanup could not scan channel ${channel.id}:`, error);
    }
  }

  return { channelsScanned, messagesDeleted, channelErrors };
}

async function handlePbanCleanupButton(interaction, messageId) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.deferUpdate().catch(() => null);
    console.error('PBAN cleanup failed: interaction has no guild context.');
    return;
  }

  const proposal = state.pbanProposalsByMessageId[messageId];
  if (!proposal || proposal.messageId !== interaction.message.id || proposal.status !== 'passed') {
    await interaction.deferUpdate().catch(() => null);
    console.error(`PBAN cleanup ignored for inactive proposal ${messageId}.`);
    return;
  }

  if (proposal.messageCleanupCompletedAt) {
    await interaction.update({
      embeds: [pbanProposalEmbed(proposal)],
      components: pbanComponents(proposal),
      allowedMentions: { users: [proposal.targetUserId, proposal.executorUserId] }
    }).catch(() => null);
    return;
  }

  await interaction.deferUpdate();
  const result = await cleanupUserMessagesInGuild(interaction.guild, proposal.targetUserId, 10);
  proposal.messageCleanupCompletedAt = Date.now();
  proposal.messageCleanupCompletedByUserId = interaction.user.id;
  proposal.messageCleanupResult = result;
  await saveState();

  await editPbanProposalMessage(proposal);
  console.log(
    `PBAN cleanup completed for ${proposal.targetUserId} from proposal ${proposal.messageId}: `
    + `${result.messagesDeleted} messages deleted across ${result.channelsScanned} scanned channel(s); `
    + `${result.channelErrors} channel error(s).`
  );
}

async function completePbanProposal(proposal, passedByUser) {
  if (proposal.status !== 'voting') return { ok: false, message: 'This proposal is not in voting.' };

  const guild = await client.guilds.fetch(proposal.guildId).catch(() => null);
  if (!guild) {
    proposal.status = 'cancelled';
    proposal.cancelledReason = 'The configured server could not be fetched.';
    await saveState();
    await editPbanProposalMessage(proposal);
    return { ok: false, message: 'The configured server could not be fetched.' };
  }

  const targetUser = await client.users.fetch(proposal.targetUserId).catch(() => null);
  if (targetUser) {
    await targetUser.send({
      embeds: [
        styledEmbed(
          'You Have Been Banned',
          [
            'You have been banned from the server.',
            '',
            `**Reason:** ${trimTo(proposal.reason, 1800)}`,
            '',
            `You can appeal this ban here: ${PBAN_APPEALS_INVITE}`
          ].join('\n')
        )
      ],
      allowedMentions: { parse: [] }
    }).catch(() => null);
  }

  const banned = await guild.members.ban(proposal.targetUserId, {
    reason: `PBAN approved by ${passedByUser.tag}: ${trimTo(proposal.reason, 400)}`
  }).then(() => true).catch((error) => {
    console.error(`PBAN ban failed for ${proposal.targetUserId}:`, error);
    return false;
  });
  if (!banned) {
    await editPbanProposalMessage(proposal);
    return { ok: false, message: 'The vote passed, but I could not ban that user. Check my Ban Members permission and role position.' };
  }

  proposal.status = 'passed';
  proposal.passedAt = Date.now();
  proposal.passedByUserId = passedByUser.id;
  upsertBanProfile(proposal.guildId, {
    id: proposal.targetUserId,
    tag: proposal.targetUserTag
  }, {
    reason: proposal.reason,
    bannedAt: proposal.passedAt,
    bannedByUserId: client.user.id,
    bannedByTag: client.user.tag,
    bannedByBot: true,
    pbanMessageId: proposal.messageId,
    pbanChannelId: proposal.channelId,
    pbanPassedByUserId: passedByUser.id,
    banSource: 'pban',
    proofUrls: proposal.proofUrls || []
  });
  clearPbanTimeout(proposal.messageId);
  await saveState();
  await editPbanProposalMessage(proposal);

  await sendPbanLog(
    proposal,
    'Ban Logged',
    [
      `**Passed By:** <@${passedByUser.id}>`,
      `**Proof Screenshots:** ${proposal.proofUrls?.length || 0}`
    ].join('\n')
  );
  return { ok: true, message: 'Ban successful.' };
}

async function handlePbanCommand(interaction) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member || !memberCanStartPban(member)) {
    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const targetUser = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true).trim();
  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (targetMember && memberHasAnyCachedRole(targetMember, pbanProtectedTargetRoleIds())) {
    await interaction.editReply('You cannot open a pban proposal for staff or protected users.');
    return;
  }

  const proposalChannel = await client.channels.fetch(PBAN_PROPOSAL_CHANNEL_ID).catch(() => null);
  if (!proposalChannel?.isTextBased() || !proposalChannel.send) {
    await interaction.editReply(`I could not access the pban proposal channel \`${PBAN_PROPOSAL_CHANNEL_ID}\`.`);
    return;
  }

  const proposal = {
    guildId: interaction.guildId,
    channelId: proposalChannel.id,
    messageId: null,
    targetUserId: targetUser.id,
    targetUserTag: targetUser.tag,
    executorUserId: interaction.user.id,
    executorTag: interaction.user.tag,
    reason,
    status: 'proof_pending',
    proofUrls: [],
    votes: {},
    abstains: {},
    createdAt: Date.now(),
    expiresAt: Date.now() + PBAN_EXPIRES_AFTER_MS
  };

  const pingRoleIds = [...new Set([
    ...staffRoleHierarchyIds('assistants'),
    ...staffRoleHierarchyIds('moderation')
  ])];
  const proposalMessage = await proposalChannel.send({
    content: pingRoleIds.map((roleId) => `<@&${roleId}>`).join(' '),
    embeds: [pbanProposalEmbed(proposal)],
    allowedMentions: { roles: pingRoleIds }
  });
  proposal.messageId = proposalMessage.id;
  state.pbanProposalsByMessageId[proposal.messageId] = proposal;
  await saveState();
  schedulePbanExpiration(proposal.messageId);

  await proposalMessage.edit({
    embeds: [pbanProposalEmbed(proposal)],
    components: [],
    allowedMentions: { users: [targetUser.id, interaction.user.id] }
  }).catch(() => null);

  await interaction.editReply(`Permanent ban proposal opened in <#${proposalChannel.id}>.`);
}

async function handlePbanProofReply(message) {
  if (
    message.channel.id !== PBAN_PROPOSAL_CHANNEL_ID
    || !message.reference?.messageId
  ) {
    return false;
  }

  const proposal = state.pbanProposalsByMessageId[message.reference.messageId];
  if (!proposal || !['proof_pending', 'voting', 'passed'].includes(proposal.status)) return false;

  const screenshots = attachmentDataFromMessage(message).filter(isImageAttachment);
  if (!screenshots.length) return false;

  const member = await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member || !memberCanVotePban(member)) {
    await message.reply({
      content: 'You do not have permission to add proof to this pban.',
      allowedMentions: { repliedUser: false, parse: [] }
    }).catch(() => null);
    return true;
  }

  if (proposal.status === 'proof_pending') {
    proposal.status = 'voting';
    proposal.proofMessageId = message.id;
    proposal.proofSubmittedByUserId = message.author.id;
  }
  proposal.proofUrls = [
    ...normalizeAttachments(proposal.proofUrls || []),
    ...screenshots.map(imageProofDataFromAttachment)
  ];
  if (proposal.status === 'passed') {
    upsertBanProfile(proposal.guildId, {
      id: proposal.targetUserId,
      tag: proposal.targetUserTag
    }, {
      reason: proposal.reason,
      bannedAt: proposal.passedAt || Date.now(),
      bannedByUserId: client.user.id,
      bannedByTag: client.user.tag,
      bannedByBot: true,
      pbanMessageId: proposal.messageId,
      pbanChannelId: proposal.channelId,
      pbanPassedByUserId: proposal.passedByUserId || null,
      banSource: 'pban',
      proofUrls: proposal.proofUrls
    });
  }
  await saveState();
  await editPbanProposalMessage(proposal);
  await message.react('✅').catch(() => null);
  return true;
}

async function handlePbanVoteButton(interaction, action, messageId) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  const proposal = state.pbanProposalsByMessageId[messageId];
  if (!proposal || proposal.messageId !== interaction.message.id || !['voting', 'passed'].includes(proposal.status)) {
    await interaction.reply({ content: 'This pban proposal is no longer active.', ephemeral: true });
    return;
  }

  if (proposal.status === 'passed') {
    await interaction.reply({ content: 'This pban proposal has already passed.', ephemeral: true });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member || !memberCanVotePban(member)) {
    await interaction.reply({ content: 'You do not have permission to vote on this pban proposal.', ephemeral: true });
    return;
  }

  if (Number(proposal.expiresAt) <= Date.now()) {
    await expirePbanProposal(messageId);
    await interaction.reply({ content: 'This pban proposal has expired.', ephemeral: true });
    return;
  }

  const pbanVote = highestPbanVote(member);
  if (!pbanVote) {
    await interaction.reply({ content: 'You do not have permission to vote on this pban proposal.', ephemeral: true });
    return;
  }
  if (action === 'abstain') {
    proposal.abstains[interaction.user.id] = {
      userId: interaction.user.id,
      tag: interaction.user.tag,
      rank: pbanVote.rank,
      votedAt: Date.now()
    };
    delete proposal.votes[interaction.user.id];
    proposal.status = 'cancelled';
    proposal.cancelledByUserId = interaction.user.id;
    proposal.cancelledAt = Date.now();
    proposal.cancelledReason = 'A staff member abstained.';
    clearPbanTimeout(messageId);
    await saveState();
    await interaction.update({
      embeds: [pbanProposalEmbed(proposal)],
      components: [],
      allowedMentions: { users: [proposal.targetUserId, proposal.executorUserId] }
    });
    return;
  }

  proposal.votes[interaction.user.id] = {
    userId: interaction.user.id,
    tag: interaction.user.tag,
    rank: pbanVote.rank,
    votedAt: Date.now()
  };
  delete proposal.abstains[interaction.user.id];
  await saveState();

  if (pbanPassed(proposal)) {
    await interaction.deferUpdate();
    const result = await completePbanProposal(proposal, interaction.user);
    await interaction.followUp({
      content: result.message,
      ephemeral: !result.ok,
      allowedMentions: { parse: [] }
    }).catch(() => null);
    return;
  }

  await interaction.update({
    embeds: [pbanProposalEmbed(proposal)],
    components: pbanComponents(proposal),
    allowedMentions: { users: [proposal.targetUserId, proposal.executorUserId] }
  });
}

async function handleAddProofCommand(interaction) {
  const allowed = await canUseInteractionPolicyCommand(interaction, 'addproof');
  if (!allowed) {
    await interaction.reply({ content: 'You do not have permission to use this command.' });
    return;
  }

  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({ content: 'Command failed.' });
    return;
  }

  const userId = interaction.options.getString('userid', true).trim();
  if (!validDiscordUserId(userId)) {
    await interaction.reply({ content: 'Use a valid Discord user ID.' });
    return;
  }

  const uploads = [];
  for (let index = 1; index <= 10; index += 1) {
    const optionName = index === 1 ? 'image' : `image${index}`;
    const attachment = interaction.options.getAttachment(optionName, index === 1);
    if (attachment) uploads.push(attachment);
  }

  const screenshots = uploads.filter(isImageAttachment);
  if (!screenshots.length) {
    await interaction.reply({ content: 'Attach at least one screenshot image file with this command.' });
    return;
  }

  if (screenshots.length !== uploads.length) {
    await interaction.reply({ content: 'Only image attachments can be added as proof screenshots.' });
    return;
  }

  await interaction.deferReply();
  const result = await addProofToBanProfile({
    guild: interaction.guild,
    userId,
    screenshots,
    addedBy: interaction.user
  });

  await interaction.editReply(result.message);
}

async function handleCbanCommand(interaction) {
  const allowed = await canUseInteractionPolicyCommand(interaction, 'cban');
  if (!allowed) {
    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  const userId = interaction.options.getString('userid', true).trim();
  if (!validDiscordUserId(userId)) {
    await interaction.reply({ content: 'Use a valid Discord user ID.', ephemeral: true });
    return;
  }

  await interaction.deferReply();
  const profile = await ensureBanProfileForUser(interaction.guild, userId);
  if (!profile) {
    await interaction.editReply(`I could not find \`${userId}\` in the server ban list.`);
    return;
  }

  const banMessage = await interaction.editReply({
    embeds: [banProfileEmbed(profile)],
    allowedMentions: { parse: [] }
  });
  if (normalizeAttachments(profile.proofUrls || []).length) {
    await sendBanProofReplies(banMessage, profile.proofUrls || []);
  }
}

async function handleBreakCommand(interaction) {
  const allowed = interaction.guildId
    && await memberCanUsePolicyCommand(interaction.guildId, interaction.user.id, 'break');
  if (!allowed) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  if (breakState.activeByUserId[interaction.user.id]) {
    await interaction.reply({ content: 'You already have an active staff break.', ephemeral: true });
    return;
  }

  if (breakState.requestsByUserId[interaction.user.id]) {
    await interaction.reply({ content: 'You already have a pending staff break request.', ephemeral: true });
    return;
  }

  await interaction.showModal(breakRequestModal());
}

async function handleBreakRequestModal(interaction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  const allowed = await memberCanUsePolicyCommand(interaction.guildId, interaction.user.id, 'break');
  if (!allowed || breakState.activeByUserId[interaction.user.id] || breakState.requestsByUserId[interaction.user.id]) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  const channel = await client.channels.fetch(BREAK_REQUEST_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased() || !channel.send) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  const durationText = interaction.fields.getTextInputValue('duration').trim();
  const request = {
    userId: interaction.user.id,
    guildId: interaction.guildId,
    durationText,
    durationMs: parseBreakDuration(durationText),
    reason: interaction.fields.getTextInputValue('reason').trim(),
    createdAt: Date.now()
  };
  const requestMessage = await channel.send({
    embeds: [breakRequestEmbed(request)],
    components: request.durationMs ? [breakDecisionRow(request.userId)] : [],
    allowedMentions: { users: [request.userId] }
  });

  request.channelId = channel.id;
  request.messageId = requestMessage.id;
  breakState.requestsByUserId[request.userId] = request;
  await saveBreakState();

  await interaction.reply({
    content: request.durationMs
      ? 'Your staff break request has been submitted.'
      : 'Your staff break request has been submitted and needs a manager to clarify its length.',
    ephemeral: true
  });
}

async function handleBreakClarification(message) {
  if (
    message.channel.id !== BREAK_REQUEST_CHANNEL_ID
    || !message.reference?.messageId
    || !await memberCanUsePolicyCommand(message.guild.id, message.author.id, 'manageBreaks')
  ) {
    return false;
  }

  const request = Object.values(breakState.requestsByUserId)
    .find((entry) => entry.messageId === message.reference.messageId && !entry.durationMs);
  if (!request) return false;

  const durationMs = parseBreakDuration(message.content);
  if (!durationMs) return false;

  request.durationText = message.content.trim();
  request.durationMs = durationMs;
  request.clarifiedByUserId = message.author.id;
  request.clarifiedAt = Date.now();
  await saveBreakState();

  const requestMessage = await message.channel.messages.fetch(request.messageId).catch(() => null);
  await requestMessage?.edit({
    embeds: [breakRequestEmbed(request)],
    components: [breakDecisionRow(request.userId)],
    allowedMentions: { users: [request.userId] }
  });
  await message.react('✅').catch(() => null);
  return true;
}

async function handleBreakDecision(interaction, action, userId) {
  if (!interaction.guildId || !await memberCanUsePolicyCommand(interaction.guildId, interaction.user.id, 'manageBreaks')) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  const request = breakState.requestsByUserId[userId];
  if (!request || request.messageId !== interaction.message.id || !request.durationMs) {
    await interaction.reply({ content: 'This break request is no longer pending.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const requester = await client.users.fetch(userId).catch(() => null);
  if (action === 'deny') {
    delete breakState.requestsByUserId[userId];
    await saveBreakState();
    await interaction.message.edit({
      embeds: [breakRequestEmbed(request, `Denied by <@${interaction.user.id}>`)],
      components: []
    });
    await requester?.send({
      embeds: [styledEmbed('Staff Break Denied', 'Your staff break request has been denied.')],
      allowedMentions: { parse: [] }
    }).catch(() => null);
    await interaction.editReply('Denied this staff break request.');
    return;
  }

  const guild = await client.guilds.fetch(request.guildId).catch(() => null);
  const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
  if (!member) {
    await interaction.editReply('I could not find that staff member in the server.');
    return;
  }

  const removedRoleIds = allBreakRemovableStaffRoleIds().filter((roleId) => member.roles.cache.has(roleId));
  if (!removedRoleIds.length) {
    await interaction.editReply('That member no longer has a configured staff hierarchy role.');
    return;
  }

  await member.roles.remove(removedRoleIds, `Staff break approved by ${interaction.user.tag}`);
  const endsAt = Date.now() + request.durationMs;
  breakState.activeByUserId[userId] = {
    guildId: request.guildId,
    approvedByUserId: interaction.user.id,
    reason: request.reason,
    durationMs: request.durationMs,
    startedAt: Date.now(),
    endsAt,
    removedRoleIds,
    messageCount: 0
  };
  delete breakState.requestsByUserId[userId];
  await saveBreakState();
  scheduleStaffBreakEnd(userId);

  await interaction.message.edit({
    embeds: [breakRequestEmbed(request, `Approved by <@${interaction.user.id}> until <t:${Math.floor(endsAt / 1000)}:F>`)],
    components: []
  });
  await requester?.send({
    embeds: [
      styledEmbed(
        'Staff Break Approved',
        [
          'Your staff break has been approved.',
          `**Length:** ${formatBreakDuration(request.durationMs)}`,
          `**Ends:** <t:${Math.floor(endsAt / 1000)}:F>`
        ].join('\n')
      )
    ],
    allowedMentions: { parse: [] }
  }).catch(() => null);
  await interaction.editReply('Approved this staff break request.');
}

async function handleBreakEndCommand(interaction) {
  if (!interaction.guildId || !breakState.activeByUserId[interaction.user.id]) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const result = await endStaffBreak(interaction.user.id, 'your break is ended, welcome back.');
  await interaction.editReply(result.message);
}

async function countBreakMessage(message) {
  const activeBreak = breakState.activeByUserId[message.author.id];
  if (!message.guild || !activeBreak || activeBreak.guildId !== message.guild.id) return;

  activeBreak.messageCount = Number(activeBreak.messageCount || 0) + 1;
  await saveBreakState();
  if (activeBreak.messageCount > 25) {
    await endStaffBreak(message.author.id, 'your activity in the server has ended your break, welcome back.');
  }
}

async function handleStaffListCommand(interaction) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  const allowed = await memberCanUsePolicyCommand(interaction.guildId, interaction.user.id, 'stafflist');
  if (!allowed) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  await interaction.deferReply();
  const members = await interaction.guild.members.fetch();
  const embed = new EmbedBuilder()
    .setColor(STYLE_COLOR)
    .setTitle(`${TITLE_PREFIX} Staff List`)
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();

  for (const group of STAFF_LIST_DEPARTMENTS) {
    const departmentRoleIds = staffListRoleIdsForGroup(group);
    const breakUserIds = new Set(userIdsOnBreakForDepartment(interaction.guildId, departmentRoleIds));

    const activeEntries = sortStaffListEntries(
      members
        .filter((member) =>
          !member.user.bot
          && !breakUserIds.has(member.id)
          && memberHasAnyCachedRole(member, departmentRoleIds)
        )
        .map((member) => ({
          id: member.id,
          displayName: memberDisplayName(member),
          rankLabel: staffListRankLabel(staffListPartsForRoleIds(
            group.staffWingId,
            departmentRoleIds.filter((roleId) => member.roles.cache.has(roleId))
          )),
          rankSortValue: staffListSortValue(staffListPartsForRoleIds(
            group.staffWingId,
            departmentRoleIds.filter((roleId) => member.roles.cache.has(roleId))
          ))
        }))
    );

    const breakEntries = sortStaffListEntries(
      [...breakUserIds]
        .map((userId) => {
          const member = members.get(userId);
          const activeBreak = breakState.activeByUserId[userId];
          if (!member || member.user.bot) return null;
          const breakRoleIds = (activeBreak?.removedRoleIds || []).filter((roleId) => departmentRoleIds.includes(roleId));
          const breakParts = staffListPartsForRoleIds(group.staffWingId, breakRoleIds);
          return {
            id: member.id,
            displayName: memberDisplayName(member),
            rankLabel: staffListRankLabel(breakParts),
            rankSortValue: staffListSortValue(breakParts)
          };
        })
        .filter(Boolean)
    );

    const lines = [];
    for (const entry of activeEntries) {
      lines.push(`- <@${entry.id}>${entry.rankLabel}`);
    }
    for (const entry of breakEntries) {
      lines.push(`- <@${entry.id}>${entry.rankLabel} (on break)`);
    }

    const chunks = chunkStaffListValue(lines.length ? lines : ['- No staff listed']);
    chunks.forEach((value, index) => {
      embed.addFields({
        name: index === 0 ? group.heading : `${group.heading} (continued)`,
        value,
        inline: false
      });
    });
  }

  await interaction.editReply({
    embeds: [embed],
    allowedMentions: { parse: [] }
  });
}

async function handlePingCommand(interaction) {
  const allowed = await canUseInteractionPolicyCommand(interaction, 'ping');
  if (!allowed) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      ephemeral: true
    });
    return;
  }

  const roundtripMs = Math.max(0, Date.now() - interaction.createdTimestamp);
  const websocketMs = Math.round(client.ws.ping);

  await interaction.reply({
    embeds: [
      styledEmbed(
        'Latency',
        [
          `**Latency:** ${websocketMs}ms`,
          `**Roundtrip:** ${roundtripMs}ms`
        ].join('\n')
      )
    ],
    ephemeral: true
  });
}

async function handleRefreshCommand(interaction) {
  const allowed = await canUseInteractionPolicyCommand(interaction, 'refresh');
  if (!allowed) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      ephemeral: true
    });
    return;
  }

  if (!reviewerEnabled) {
    await interaction.reply({
      content: 'The application reviewer is not configured.',
      ephemeral: true
    });
    return;
  }

  if (isPolling) {
    await interaction.reply({
      content: 'A refresh is already running. Try again in a moment.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  isPolling = true;

  try {
    const result = await checkForNewApplications();
    await interaction.editReply(
      `Refresh complete. Found ${result.found} response(s), ${result.new} new, posted ${result.posted}.`
    );
  } catch (error) {
    if (isGoogleInvalidGrantError(error)) {
      console.error(`Manual application refresh failed: ${googleInvalidGrantMessage()}`);
      await interaction.editReply(`Refresh failed: ${googleInvalidGrantMessage()}`);
    } else {
      console.error('Manual application refresh failed:', error);
      await interaction.editReply(`Refresh failed: ${error.message}`);
    }
  } finally {
    isPolling = false;
  }
}

async function transferTicket(channel, transferredBy, targetDepartmentId, options = {}) {
  if (!channel?.id || channel.type !== ChannelType.GuildText) {
    return { ok: false, message: 'This command can only be used inside a modmail channel.' };
  }

  const userId = userIdForChannel(channel.id);
  if (!userId) {
    return { ok: false, message: 'This channel is not an open modmail thread.' };
  }

  const ticket = state.ticketsByUserId[userId];
  const targetDepartment = departmentFor(targetDepartmentId);
  if (!targetDepartment) {
    return { ok: false, message: 'That transfer wing is not configured.' };
  }

  if (!await memberCanUseClaimedTicketCommands(channel.guild.id, transferredBy.id, ticket)) {
    return { ok: false, message: `Claim this ticket with ${CLAIM_COMMAND} before using ticket commands.` };
  }

  const currentDepartment = departmentFor(ticket.departmentId);
  const replyRoleIds = roleIdsFor(ticket.departmentId, 'reply');
  if (!replyRoleIds.length) {
    return {
      ok: false,
      message: `No reply roles are configured for ${currentDepartment?.label || ticket.departmentId} in ${TICKET_BRANCH_POLICY_FILE}.`
    };
  }

  const canTransfer = await memberCanUsePrefixRoles(channel.guild.id, transferredBy.id, replyRoleIds);
  if (!canTransfer) {
    return { ok: false, message: `You need a ${currentDepartment?.label || 'wing'} reply role to transfer this ticket.` };
  }

  const sameDepartment = normalizeDepartmentId(ticket.departmentId) === targetDepartment.id;
  if (sameDepartment && !options.allowSameDepartment) {
    return { ok: false, message: `This ticket is already with the ${teamNameForDepartment(targetDepartment.id)}.` };
  }

  const categoryId = categoryIdFor(targetDepartment.id);
  if (!categoryId) {
    return {
      ok: false,
      message: `No category is configured for ${targetDepartment.label}. Add ${categoryEnvLabel(targetDepartment)} to the environment.`
    };
  }

  const category = await checkCategory(channel.guild, categoryId);
  if (!category) {
    return { ok: false, message: `I could not find the configured category for ${targetDepartment.label}.` };
  }

  await removeTimedClose(userId);

  const user = await client.users.fetch(userId).catch(() => null);
  const username = user?.username || ticket.userName || 'user';
  let movedChannel = channel;
  const warnings = [];
  const movedToDifferentCategory = channel.parentId !== category.id;

  if (movedToDifferentCategory) {
    movedChannel = await channel.setParent(category.id, { lockPermissions: false })
      .catch((error) => {
        console.error(`Ticket channel transfer failed for ${channel.id}:`, error);
        return null;
      });
    if (!movedChannel) {
      return { ok: false, message: `I could not move this ticket to ${targetDepartment.label}. Check my **Manage Channels** permission.` };
    }
  }

  ticket.departmentId = targetDepartment.id;
  ticket.userName = username;
  ticket.userTag = user?.tag || ticket.userTag;
  delete ticket.claimedByStaffUserId;
  delete ticket.claimedByStaffTag;
  delete ticket.claimedAt;
  queueTicketChannelRename(movedChannel, priorityChannelName(ticket, ticketChannelName(userId, username, targetDepartment.id)));
  recordHistory(userId, {
    kind: options.historyKind || 'TICKET TRANSFERRED',
    authorId: transferredBy.id,
    authorTag: transferredBy.tag,
    content: options.historyContent || `Transferred to ${targetDepartment.label}`,
    attachmentUrls: []
  });
  await saveState();

  if (user) {
    await user.send({
      embeds: [
        styledEmbed(
          options.userEmbedTitle || 'Ticket Transferred',
          options.userMessage || `Your ticket is being transferred to the **${teamNameForDepartment(targetDepartment.id)}**, please wait!`
        )
      ],
      allowedMentions: { parse: [] }
    }).catch(() => null);
  }

  const pingRoleIds = roleIdsFor(targetDepartment.id, 'ping');
  const pingContent = pingRoleIds.map((roleId) => `<@&${roleId}>`).join(' ');

  const staffNoticeSent = await movedChannel.send({
    content: pingContent || undefined,
    embeds: [
      styledEmbed(
        options.staffEmbedTitle || 'Ticket Transferred',
        options.staffMessage || `Transferred by **${transferredBy.tag}** to the **${teamNameForDepartment(targetDepartment.id)}**.`
      )
    ],
    allowedMentions: { roles: pingRoleIds }
  }).then(() => true).catch((error) => {
    console.error(`Ticket transfer notice failed for ${channel.id}:`, error);
    return false;
  });
  if (!staffNoticeSent) {
    warnings.push('I moved the ticket, but could not post the transfer notice in the destination category. Check the bot channel permissions.');
  }

  if (movedToDifferentCategory) {
    const permissionsSynced = await movedChannel.lockPermissions()
      .then(() => true)
      .catch((error) => {
        console.error(`Ticket permission sync failed for ${channel.id}:`, error);
        return false;
      });
    if (!permissionsSynced) {
      warnings.push('I moved the ticket, but could not sync its category permissions. Check my **Manage Channels** permission.');
    }
  }

  const warningText = warnings.length ? `\n\n${warnings.join('\n')}` : '';
  return { ok: true, message: `Transferred this ticket to the ${teamNameForDepartment(targetDepartment.id)}.${warningText}` };
}

async function handleTransferCommand(interaction) {
  const transferValue = interaction.options.getString('wing') || interaction.options.getString('department');
  const targetDepartment = transferDepartmentFor(transferValue);
  const result = await transferTicket(interaction.channel, interaction.user, targetDepartment?.id);

  await interaction.reply({
    content: result.message,
    ephemeral: !result.ok
  });
}

async function handleSupportPanelButton(interaction) {
  const existing = await activeChannelFor(interaction.user.id, interaction.guildId);
  if (existing || state.pendingByUserId[interaction.user.id]) {
    await interaction.reply({
      content: 'You already have an open or pending ticket. Please continue in your DMs.',
      ephemeral: true
    });
    return;
  }

  const sent = await sendButtonDepartmentPrompt(interaction.user, interaction.guildId)
    .then(() => true)
    .catch(() => false);

  if (!sent) {
    await interaction.reply({
      content: 'I could not DM you. Please enable DMs from this server, then try again.',
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: 'I sent you a DM to choose your ticket wing.',
    ephemeral: true
  });
}

async function handleDepartmentSelect(interaction) {
  await interaction.deferUpdate();

  const departmentId = interaction.values[0];
  const department = departmentFor(departmentId);
  const pending = state.pendingByUserId[interaction.user.id];

  if (!department) {
    await interaction.message.edit({
      embeds: [styledEmbed('Unknown Wing', 'Please send your message again, then select a wing.')],
      components: []
    });
    return;
  }

  if (!pending) {
    await interaction.message.edit({
      embeds: [styledEmbed('No Pending Message', 'Please send your message again, then select a wing.')],
      components: []
    });
    return;
  }

  const channel = await openTicket(interaction.user, department.id, pending.guildId || null);
  if (!channel) {
    await interaction.message.edit({
      embeds: [styledEmbed('Ticket Not Opened', 'I could not open a ticket for this server.')],
      components: []
    });
    return;
  }

  if (pending.source !== 'support_button') {
    let originalMessage = null;
    const dmChannel = await client.channels.fetch(pending.channelId).catch(() => null);
    if (dmChannel?.isTextBased()) {
      originalMessage = await dmChannel.messages.fetch(pending.messageId).catch(() => null);
    }

    await relayUserParts(
      interaction.user,
      pending.content,
      pending.attachments || pending.attachmentUrls || [],
      channel,
      originalMessage
    );
  }

  delete state.pendingByUserId[interaction.user.id];
  await saveState();

  await interaction.message.edit({
    embeds: [
      styledEmbed(
        'Wing Selected',
        [
          `Your ticket has been transferred to the **${teamNameForDepartment(department.id)}**.`,
          '',
          'Please wait patiently for a reply. In the meantime, if you would like to tell us in advance what help you need, we appreciate that as it helps ticket handling go by much faster!'
        ].join('\n')
      )
    ],
    components: []
  });
}

async function registerCommands(guild) {
  await guild.commands.set([
    new SlashCommandBuilder()
      .setName('ping')
      .setDescription('Check whether the modmail bot is online.')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('stafflist')
      .setDescription('List current staff by ticket wing.')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('refresh')
      .setDescription('Manually check Google Forms for new staff applications.')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('approve')
      .setDescription('Approve a staff application and notify the applicant.')
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('The applicant to approve.')
          .setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('reject')
      .setDescription('Reject a staff application and notify the applicant.')
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('The applicant to reject.')
          .setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('demote')
      .setDescription('Demote or remove a staff member.')
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('The staff member to demote.')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('wing')
          .setDescription('The wing this demotion applies to.')
          .setRequired(true)
          .addChoices(...WING_COMMAND_CHOICES)
      )
      .addStringOption((option) =>
        option
          .setName('reason')
          .setDescription('Why this staff member is being demoted or removed.')
          .setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('promote')
      .setDescription('Promote a staff member within a wing.')
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('The staff member to promote.')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('wing')
          .setDescription('The wing this promotion applies to.')
          .setRequired(true)
          .addChoices(...WING_COMMAND_CHOICES)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('makelead')
      .setDescription('Assign a staff member to the lead role for a wing.')
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('The staff member to make lead.')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('wing')
          .setDescription('The wing this lead role applies to.')
          .setRequired(true)
          .addChoices(...WING_COMMAND_CHOICES)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('strike')
      .setDescription('Give a staff member a strike.')
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('The staff member to strike.')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('reason')
          .setDescription('Why this staff member is being given a strike.')
          .setMaxLength(1800)
          .setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('strikes')
      .setDescription('Check your strike count.')
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('The staff member to check. Restricted to approval-command roles.')
          .setRequired(false)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('removestrike')
      .setDescription('Remove one strike from a user.')
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('The user to remove a strike from.')
          .setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('pban')
      .setDescription('Open a ban proposal.')
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('The user to propose for a ban.')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('reason')
          .setDescription('Why this user should be banned.')
          .setMaxLength(1800)
          .setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('addproof')
      .setDescription('Attach screenshot proof to a logged server ban.')
      .addStringOption((option) =>
        option
          .setName('userid')
          .setDescription('The banned user ID.')
          .setRequired(true)
      )
      .addAttachmentOption((option) =>
        option
          .setName('image')
          .setDescription('Screenshot proof image.')
          .setRequired(true)
      )
      .addAttachmentOption((option) =>
        option
          .setName('image2')
          .setDescription('Optional screenshot proof image.')
          .setRequired(false)
      )
      .addAttachmentOption((option) =>
        option
          .setName('image3')
          .setDescription('Optional screenshot proof image.')
          .setRequired(false)
      )
      .addAttachmentOption((option) =>
        option
          .setName('image4')
          .setDescription('Optional screenshot proof image.')
          .setRequired(false)
      )
      .addAttachmentOption((option) =>
        option
          .setName('image5')
          .setDescription('Optional screenshot proof image.')
          .setRequired(false)
      )
      .addAttachmentOption((option) =>
        option
          .setName('image6')
          .setDescription('Optional screenshot proof image.')
          .setRequired(false)
      )
      .addAttachmentOption((option) =>
        option
          .setName('image7')
          .setDescription('Optional screenshot proof image.')
          .setRequired(false)
      )
      .addAttachmentOption((option) =>
        option
          .setName('image8')
          .setDescription('Optional screenshot proof image.')
          .setRequired(false)
      )
      .addAttachmentOption((option) =>
        option
          .setName('image9')
          .setDescription('Optional screenshot proof image.')
          .setRequired(false)
      )
      .addAttachmentOption((option) =>
        option
          .setName('image10')
          .setDescription('Optional screenshot proof image.')
          .setRequired(false)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('cban')
      .setDescription('Show a confirmed ban and its screenshot proof.')
      .addStringOption((option) =>
        option
          .setName('userid')
          .setDescription('The banned user ID.')
          .setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('break')
      .setDescription('Request a temporary break from staff duties.')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('endbreak')
      .setDescription('End your active staff break early.')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('close')
      .setDescription('Close the current modmail thread.')
      .addStringOption((option) =>
        option
          .setName('reason')
          .setDescription('Why this thread is being closed.')
          .setRequired(false)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('fclose')
      .setDescription('Force close a tracked modmail ticket.')
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('The ticket opener to force close.')
          .setRequired(false)
      )
      .addBooleanOption((option) =>
        option
          .setName('all')
          .setDescription('Force close every tracked ticket.')
          .setRequired(false)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('transfer')
      .setDescription('Transfer the current modmail thread to another wing.')
      .addStringOption((option) =>
        option
          .setName('wing')
          .setDescription('The wing to transfer this ticket to.')
          .setRequired(true)
          .addChoices(...WING_COMMAND_CHOICES)
      )
      .toJSON()
  ]);
}

client.once('ready', async () => {
  await loadState();
  await restoreTicketChannelNames();
  await loadTimedCloseState();
  await restoreTimedCloses();
  await loadBreakState();
  await restoreStaffBreaks();
  await restorePbanProposals();
  if (reviewerEnabled) {
    await loadReviewerState();
  }

  let guild = null;
  let commandsRegistered = false;

  try {
    guild = await findGuild();
  } catch (error) {
    console.error('Guild lookup failed:', error);
  }

  try {
    if (!guild) {
      throw new Error('Cannot register commands without a configured server.');
    }

    await registerCommands(guild);
    commandsRegistered = true;
  } catch (error) {
    console.error('Slash command registration failed:', error);
  }

  console.log(`ModMail is online as ${client.user.tag}.`);
  await runStartupDiagnostics({ guild, commandsRegistered });
  if (guild) {
    await syncGuildLeadCategoryRoles(guild).catch((error) => {
      console.error('Lead category startup sync failed:', error);
    });
    await syncGuildBans(guild);
    setInterval(() => {
      syncGuildBans(guild).catch((error) => {
        console.error('Ban list sync failed:', error);
      });
    }, BAN_SYNC_INTERVAL_MS);
  }
  await ensureSupportPanel();
  await pollApplications();
  if (reviewerEnabled) {
    setInterval(pollApplications, pollIntervalMs);
  }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (oldMember.roles.cache.size === newMember.roles.cache.size) {
    const roleChanged = newMember.roles.cache.some((role, roleId) => !oldMember.roles.cache.has(roleId));
    if (!roleChanged) return;
  }

  try {
    await syncLeadCategoryRole(newMember, 'Lead category role sync');
  } catch (error) {
    console.error(`Lead category role sync failed for ${newMember.user?.tag || newMember.id}:`, error);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  try {
    const trimmed = message.content.trim();
    const hiddenDeleteMatch = trimmed.match(new RegExp(`^${escapeRegExp(HIDDEN_DELETE_BOT_MESSAGE_COMMAND)}(?:\\s+(\\S+))?$`, 'i'));
    if (hiddenDeleteMatch) {
      await handleHiddenDeleteBotMessageCommand(message, hiddenDeleteMatch[1] || '');
      return;
    }

    if (message.channel.type === ChannelType.DM) {
      await relayUserDm(message);
      return;
    }

    if (message.channel.type !== ChannelType.GuildText) return;

    if (await handleAntiBotAutomodMessage(message)) return;

    await countBreakMessage(message);
    if (await handlePbanProofReply(message)) return;
    if (await handleAddProofUpload(message)) return;
    if (await handleBreakClarification(message)) return;

    const userId = userIdForChannel(message.channel.id);
    const ticket = userId ? state.ticketsByUserId[userId] : null;
    const isClaimCommand = matchesExactCommand(trimmed, CLAIM_COMMAND_ALIASES);
    if (
      ticket
      && isTicketPrefixCommand(trimmed)
      && !isClaimCommand
      && !await memberCanUseClaimedTicketCommands(message.guild.id, message.author.id, ticket)
    ) {
      await message.reply({
        embeds: [styledEmbed('Command Not Available', `Claim this ticket with **${CLAIM_COMMAND}** before using ticket commands.`)],
        allowedMentions: { repliedUser: false, parse: [] }
      });
      return;
    }

    if (
      userId
      && shouldCancelTimedCloseForPrefixCommand(trimmed)
      && await memberHasAnyRole(message.guild.id, message.author.id, allConfiguredStaffRoleIds())
    ) {
      await removeTimedClose(userId);
    }

    const helpMatch = trimmed.match(new RegExp(`^${escapeRegExp(HELP_COMMAND)}(?:\\s+(\\S+))?$`, 'i'));
    if (helpMatch) {
      await handleHelpCommand(message, helpMatch[1] || '');
      return;
    }

    const snippetPermissionsMatch = trimmed.match(new RegExp(`^${escapeRegExp(SNIPPETS_COMMAND)}\\s+(\\S+)\\s+perms$`, 'i'));
    if (snippetPermissionsMatch) {
      await handleSnippetPermissionsCommand(message, snippetPermissionsMatch[1]);
      return;
    }

    if (new RegExp(`^${escapeRegExp(SNIPPETS_COMMAND)}\\s+perms$`, 'i').test(trimmed)) {
      await handleSnippetPermissionsCommand(message, '');
      return;
    }

    if (new RegExp(`^${escapeRegExp(SNIPPETS_COMMAND)}$`, 'i').test(trimmed)) {
      const canListSnippets = await memberCanUsePrefixWithRoles(message, commandRoleIds('snippets'));
      if (!canListSnippets) {
        await message.reply({
          embeds: [styledEmbed('Snippets Not Available', 'You need a staff hierarchy role to use this command.')],
          allowedMentions: { repliedUser: false, parse: [] }
        });
        return;
      }

      await message.reply({
        embeds: [snippetsEmbed()],
        allowedMentions: { repliedUser: false, parse: [] }
      });
      return;
    }

    if (!userId) return;

    const previewReplyMatch = trimmed.match(new RegExp(`^${escapeRegExp(previewCommand(REPLY_PREFIX))}(?:\\s+([\\s\\S]*))?$`, 'i'));
    if (previewReplyMatch) {
      await handleSnippetPreview(message, REPLY_PREFIX, (previewReplyMatch[1] || '').trim());
      return;
    }

    if (new RegExp(`^${escapeRegExp(previewCommand(TIMED_CLOSE_COMMAND))}$`, 'i').test(trimmed)) {
      await handleSnippetPreview(message, TIMED_CLOSE_COMMAND);
      return;
    }

    if (new RegExp(`^${escapeRegExp(previewCommand(PARTNERSHIP_AD_COMMAND))}$`, 'i').test(trimmed)) {
      await handleSnippetPreview(message, PARTNERSHIP_AD_COMMAND);
      return;
    }

    if (new RegExp(`^${escapeRegExp(previewCommand(REPORT_FINISHED_COMMAND))}$`, 'i').test(trimmed)) {
      await handleSnippetPreview(message, REPORT_FINISHED_COMMAND);
      return;
    }

    const savedPreview = Object.values(SAVED_SNIPPETS).find((snippet) =>
      new RegExp(`^${escapeRegExp(previewCommand(snippet.command))}$`, 'i').test(trimmed)
    );
    if (savedPreview) {
      await handleSnippetPreview(message, savedPreview.command);
      return;
    }

    const controlPreviewCommands = [
      SNIPPETS_COMMAND,
      HELP_COMMAND,
      ...CLAIM_COMMAND_ALIASES,
      UNCLAIM_COMMAND,
      CANCEL_CLOSE_COMMAND,
      TIMER_COMMAND,
      NOTE_COMMAND,
      USER_INFO_COMMAND,
      TRANSFER_COMMAND,
      RENAME_COMMAND,
      PRIORITY_COMMAND,
      TRANSCRIPT_COMMAND,
      CLAIM_INFO_COMMAND,
      CLOSE_INFO_COMMAND,
      ESCALATE_COMMAND
    ];
    const controlPreview = controlPreviewCommands
      .map((command) => ({
        command,
        match: trimmed.match(new RegExp(`^${escapeRegExp(previewCommand(command))}(?:\\s+([\\s\\S]*))?$`, 'i'))
      }))
      .find(({ match }) => match);
    if (controlPreview) {
      await handleSnippetPreview(message, controlPreview.command, (controlPreview.match[1] || '').trim(), userId);
      return;
    }

    const timedCloseMatch = trimmed.match(new RegExp(`^${escapeRegExp(TIMED_CLOSE_COMMAND)}(?:\\s+(\\S+))?$`, 'i'));
    if (timedCloseMatch) {
      await handleTimedCloseCommand(message, userId, timedCloseMatch[1] || '');
      return;
    }

    if (new RegExp(`^${escapeRegExp(PARTNERSHIP_AD_COMMAND)}$`, 'i').test(trimmed)) {
      await handlePartnershipAdCommand(message, userId);
      return;
    }

    if (new RegExp(`^${escapeRegExp(REPORT_FINISHED_COMMAND)}$`, 'i').test(trimmed)) {
      await handleReportFinishedCommand(message, userId);
      return;
    }

    const savedSnippet = Object.values(SAVED_SNIPPETS).find((snippet) =>
      new RegExp(`^${escapeRegExp(snippet.command)}$`, 'i').test(trimmed)
    );
    if (savedSnippet) {
      await handleSavedSnippetCommand(message, userId, savedSnippet);
      return;
    }

    if (matchesExactCommand(trimmed, CLAIM_COMMAND_ALIASES)) {
      await handleClaimCommand(message, userId);
      return;
    }

    if (new RegExp(`^${escapeRegExp(UNCLAIM_COMMAND)}$`, 'i').test(trimmed)) {
      await handleUnclaimCommand(message, userId);
      return;
    }

    if (new RegExp(`^${escapeRegExp(CANCEL_CLOSE_COMMAND)}$`, 'i').test(trimmed)) {
      await handleCancelCloseCommand(message, userId);
      return;
    }

    if (new RegExp(`^${escapeRegExp(TIMER_COMMAND)}$`, 'i').test(trimmed)) {
      await handleTimerCommand(message, userId);
      return;
    }

    const noteMatch = trimmed.match(new RegExp(`^${escapeRegExp(NOTE_COMMAND)}(?:\\s+([\\s\\S]*))?$`, 'i'));
    if (noteMatch) {
      await handleNoteCommand(message, userId, (noteMatch[1] || '').trim());
      return;
    }

    if (new RegExp(`^${escapeRegExp(USER_INFO_COMMAND)}$`, 'i').test(trimmed)) {
      await handleUserInfoCommand(message, userId);
      return;
    }

    const transferMatch = trimmed.match(new RegExp(`^${escapeRegExp(TRANSFER_COMMAND)}(?:\\s+(\\S+))?$`, 'i'));
    if (transferMatch) {
      const targetDepartment = transferDepartmentFor((transferMatch[1] || '').toLowerCase());
      const result = await transferTicket(message.channel, message.author, targetDepartment?.id);
      if (!result.ok) {
        await message.reply({ embeds: [styledEmbed('Transfer Failed', result.message)], allowedMentions: { repliedUser: false, parse: [] } });
      }
      return;
    }

    const renameMatch = trimmed.match(new RegExp(`^${escapeRegExp(RENAME_COMMAND)}(?:\\s+([\\s\\S]*))?$`, 'i'));
    if (renameMatch) {
      await handleRenameCommand(message, userId, (renameMatch[1] || '').trim());
      return;
    }

    const priorityMatch = trimmed.match(new RegExp(`^${escapeRegExp(PRIORITY_COMMAND)}(?:\\s+(\\S+))?$`, 'i'));
    if (priorityMatch) {
      await handlePriorityCommand(message, userId, (priorityMatch[1] || '').toLowerCase());
      return;
    }

    if (new RegExp(`^${escapeRegExp(TRANSCRIPT_COMMAND)}$`, 'i').test(trimmed)) {
      await handleTranscriptCommand(message, userId);
      return;
    }

    if (new RegExp(`^${escapeRegExp(CLAIM_INFO_COMMAND)}$`, 'i').test(trimmed)) {
      await handleClaimInfoCommand(message, userId);
      return;
    }

    if (new RegExp(`^${escapeRegExp(CLOSE_INFO_COMMAND)}$`, 'i').test(trimmed)) {
      await handleCloseInfoCommand(message, userId);
      return;
    }

    if (new RegExp(`^${escapeRegExp(ESCALATE_COMMAND)}$`, 'i').test(trimmed)) {
      const result = await transferTicket(message.channel, message.author, 'internals', {
        allowSameDepartment: true,
        historyKind: 'TICKET ESCALATED',
        historyContent: 'Escalated to Internals',
        userEmbedTitle: 'Ticket Escalated',
        userMessage: 'Your ticket is being escalated to Internals.',
        staffEmbedTitle: 'Ticket Escalated',
        staffMessage: `Escalated by **${message.author.tag}** to **Internals**.`
      });
      if (!result.ok) {
        await message.reply({ embeds: [styledEmbed('Escalation Failed', result.message)], allowedMentions: { repliedUser: false, parse: [] } });
      }
      return;
    }

    const replyMatch = trimmed.match(new RegExp(`^${escapeRegExp(REPLY_PREFIX)}(?:\\s+([\\s\\S]*))?$`, 'i'));
    if (replyMatch) {
      const replyText = (replyMatch[1] || '').trim();
      if (!replyText && !message.attachments.size) {
        await message.reply({
          embeds: [styledEmbed('Reply Not Sent', `Use **${REPLY_PREFIX} <response>** or attach a file with **${REPLY_PREFIX}**.`)],
          allowedMentions: { repliedUser: false, parse: [] }
        });
        return;
      }

      await relayStaffReply(message, userId, replyText);
      return;
    }

    await recordStaffNote(message, userId);
  } catch (error) {
    console.error('Message handling failed:', error);
    if (message.channel?.isTextBased()) {
      await message.channel.send({
        embeds: [styledEmbed('Delivery Failed', 'I could not deliver that message. Check the bot logs for details.')],
        allowedMentions: { parse: [] }
      }).catch(() => null);
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton() && interaction.customId === SUPPORT_PANEL_BUTTON_ID) {
      await handleSupportPanelButton(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'modmail_department') {
      await handleDepartmentSelect(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('staff_break_')) {
      const [actionName, userId] = interaction.customId.split(':');
      await handleBreakDecision(interaction, actionName === 'staff_break_approve' ? 'approve' : 'deny', userId);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('pban_')) {
      const [actionName, messageId] = interaction.customId.split(':');
      if (actionName === 'pban_cleanup') {
        await handlePbanCleanupButton(interaction, messageId);
        return;
      }
      await handlePbanVoteButton(interaction, actionName === 'pban_abstain' ? 'abstain' : 'vote', messageId);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'staff_break_request_modal') {
      await handleBreakRequestModal(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'ping') {
      await handlePingCommand(interaction);
      return;
    }

    if (interaction.commandName === 'stafflist') {
      await handleStaffListCommand(interaction);
      return;
    }

    if (interaction.commandName === 'refresh') {
      await handleRefreshCommand(interaction);
      return;
    }

    if (interaction.commandName === 'approve') {
      await handleApproveCommand(interaction);
      return;
    }

    if (interaction.commandName === 'reject') {
      await handleRejectCommand(interaction);
      return;
    }

    if (interaction.commandName === 'demote') {
      await handleDemoteCommand(interaction);
      return;
    }

    if (interaction.commandName === 'promote') {
      await handlePromoteCommand(interaction);
      return;
    }

    if (interaction.commandName === 'makelead') {
      await handleMakeLeadCommand(interaction);
      return;
    }

    if (interaction.commandName === 'strike') {
      await handleStrikeCommand(interaction);
      return;
    }

    if (interaction.commandName === 'strikes') {
      await handleStrikesCommand(interaction);
      return;
    }

    if (interaction.commandName === 'removestrike') {
      await handleRemoveStrikeCommand(interaction);
      return;
    }

    if (interaction.commandName === 'pban') {
      await handlePbanCommand(interaction);
      return;
    }

    if (interaction.commandName === 'addproof') {
      await handleAddProofCommand(interaction);
      return;
    }

    if (interaction.commandName === 'cban') {
      await handleCbanCommand(interaction);
      return;
    }

    if (interaction.commandName === 'break') {
      await handleBreakCommand(interaction);
      return;
    }

    if (interaction.commandName === 'endbreak') {
      await handleBreakEndCommand(interaction);
      return;
    }

    if (interaction.commandName === 'close') {
      const reason = interaction.options.getString('reason') || 'Resolved';
      const result = await closeTicket(interaction.channel, interaction.user, reason);

      await interaction.reply({
        content: result.message,
        ephemeral: !result.ok
      });
      return;
    }

    if (interaction.commandName === 'fclose') {
      await handleForceCloseCommand(interaction);
      return;
    }

    if (interaction.commandName === 'transfer') {
      await handleTransferCommand(interaction);
    }
  } catch (error) {
    console.error('Interaction handling failed:', error);
    const payload = {
      content: 'That command failed. Check the bot logs for details.'
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
