import { EmbedBuilder } from 'discord.js';
import stateManager from '../../core/state.js';
import client from '../../core/client.js';
import config from '../../core/config.js';
import logger from '../../core/logger.js';
import { HALLOWS_ORANGE } from '../../core/embeds.js';

const ACTION_LABELS = {
  ban: 'Ban',
  tempban: 'Tempban',
  softban: 'Softban',
  hardban: 'Hardban',
  kick: 'Kick',
  warn: 'Warn',
  mute: 'Mute',
  unmute: 'Unmute',
  timeout: 'Timeout',
  purge: 'Purge',
  slowmode: 'Slowmode',
  lockdown: 'Lockdown',
  unlock: 'Unlock',
  jail: 'Jail',
  unjail: 'Unjail',
  stripstaff: 'Strip Staff'
};

const ACTION_COLORS = {
  ban: 0xed4245,
  tempban: 0xed4245,
  softban: 0xfee75c,
  hardban: 0xed4245,
  kick: 0xfee75c,
  warn: 0xfee75c,
  mute: 0x5865f2,
  unmute: 0x57f287,
  timeout: 0x5865f2,
  purge: 0x9b59b6,
  slowmode: 0x3498db,
  lockdown: 0xe67e22,
  unlock: 0x2ecc71,
  jail: 0x9b59b6,
  unjail: 0x57f287,
  stripstaff: 0xe67e22
};

function checkHierarchy(member, targetMember) {
  if (!member || !targetMember) return { allowed: true };
  if (member.id === targetMember.id) return { allowed: false, message: 'You cannot moderate yourself.' };
  if (member.guild.ownerId === member.id) return { allowed: true };
  if (targetMember.guild.ownerId === targetMember.id) return { allowed: false, message: 'You cannot moderate the server owner.' };
  if (member.roles.highest.position <= targetMember.roles.highest.position) {
    return { allowed: false, message: 'You cannot moderate someone with a higher or equal role.' };
  }
  return { allowed: true };
}

function caseEmbed(caseRecord) {
  const color = ACTION_COLORS[caseRecord.action] || 0x95a5a6;
  const label = ACTION_LABELS[caseRecord.action] || caseRecord.action;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`Mod Case #${caseRecord.id} — ${label}`)
    .addFields(
      { name: 'User', value: `<@${caseRecord.user_id}> (\`${caseRecord.user_id}\`)`, inline: true },
      { name: 'Moderator', value: `<@${caseRecord.moderator_id}>`, inline: true }
    )
    .setTimestamp(new Date(caseRecord.created_at));

  if (caseRecord.reason) embed.addFields({ name: 'Reason', value: caseRecord.reason });
  if (caseRecord.duration) embed.addFields({ name: 'Duration', value: caseRecord.duration, inline: true });
  if (caseRecord.channel_id) embed.addFields({ name: 'Channel', value: `<#${caseRecord.channel_id}>`, inline: true });
  if (caseRecord.message_count) embed.addFields({ name: 'Messages', value: String(caseRecord.message_count), inline: true });

  return embed;
}

function moderationDMEmbed(action, reason, guildName, appealInvite) {
  const label = ACTION_LABELS[action] || action;
  const color = ACTION_COLORS[action] || HALLOWS_ORANGE;
  const desc = [`You have been **${label.toLowerCase()}ed** from **${guildName}**.`];
  if (reason) desc.push('', `**Reason:**\n${reason}`);
  if (action === 'ban' && appealInvite) desc.push('', `**Appeal Server:**\n${appealInvite}`);

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${label}`)
    .setDescription(desc.join('\n'))
    .setTimestamp();
}

async function sendModerationDM(userId, action, reason, guildId) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return false;
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return false;

  try {
    const appealInvite = action === 'ban' ? (config.pban?.appealsInvite || stateManager.getGuildSetting(guildId, 'PBAN_APPEALS_INVITE', null) || null) : null;
    const embed = moderationDMEmbed(action, reason, guild.name, appealInvite);
    await user.send({ embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}

async function postModlog(guildId, caseRecord) {
  const channelId = stateManager.getModlogChannel(guildId);
  if (!channelId) return null;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;

  try {
    const embed = caseEmbed(caseRecord);
    const msg = await channel.send({ embeds: [embed] });
    return msg;
  } catch (error) {
    logger.error({ guildId, caseId: caseRecord.id, error: error.message }, 'Failed to post modlog');
    return null;
  }
}

async function postDocumentsChannel(guildId, caseRecord, moderatorId) {
  const channelId = config.documents?.channelId || stateManager.getDocumentsChannel(guildId);
  if (!channelId) return null;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;

  try {
    const embed = caseEmbed(caseRecord);
    const content = `<@${moderatorId}> — please upload screenshot evidence for **Case #${caseRecord.id}**`;
    await channel.send({ content, embeds: [embed] });
    return null;
  } catch (error) {
    logger.error({ guildId, caseId: caseRecord.id, error: error.message }, 'Failed to post documents channel');
    return null;
  }
}

async function handleEvidenceCollection(message) {
  if (!message.attachments.size || !message.guild) return;
  const channelId = config.documents?.channelId || stateManager.getDocumentsChannel(message.guild.id);
  if (message.channel.id !== channelId) return;

  const ref = message.reference?.messageId;
  if (!ref) return;

  try {
    const refMsg = await message.channel.messages.fetch(ref);
    const caseMatch = refMsg.embeds?.[0]?.title?.match(/Mod Case #(\d+)/);
    if (!caseMatch) return;

    const caseId = parseInt(caseMatch[1], 10);
    const caseRecord = stateManager.getModCase(caseId);
    if (!caseRecord || caseRecord.guild_id !== message.guild.id) return;

    // Only the original moderator can upload evidence
    if (message.author.id !== caseRecord.moderator_id) {
      await message.reply('Only the moderator who handled this case can upload evidence.').catch(() => {});
      return;
    }

    for (const attachment of message.attachments.values()) {
      stateManager.addCaseEvidence(caseId, message.guild.id, attachment.url, attachment.name, message.author.id);
    }

    await message.react('✅');
  } catch { }
}

async function runModAction(guildId, userId, moderatorId, action, reason, options = {}, guild) {
  const caseId = stateManager.createModCase(guildId, userId, moderatorId, action, reason, options);
  const caseRecord = stateManager.getModCase(caseId);
  await postModlog(guildId, caseRecord);
  await postDocumentsChannel(guildId, caseRecord, moderatorId);
  return caseRecord;
}

function parseDuration(input) {
  if (!input) return null;
  const match = input.toLowerCase().match(/^(\d+)\s*(s|m|h|d|w)$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return value * (multipliers[unit] || 60000);
}

function formatDuration(ms) {
  if (!ms) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const weeks = Math.floor(totalSeconds / 604800);
  const days = Math.floor((totalSeconds % 604800) / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const parts = [];
  if (weeks) parts.push(`${weeks}w`);
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (secs) parts.push(`${secs}s`);
  return parts.join(' ') || '0s';
}

function extractUserAndReason(args) {
  const parts = args.trim().split(/\s+/);
  const userId = parts[0]?.replace(/[<@!>]/g, '');
  const reason = parts.slice(1).join(' ') || 'No reason provided.';
  return { userId, reason };
}

function getProtectedRoleIds(guildId) {
  const guildRaw = stateManager.getGuildSetting(guildId, 'PBAN_PROTECTED_ROLE_IDS', '');
  const guildIds = guildRaw ? guildRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
  const configIds = config.pban.protectedRoleIds;
  return [...new Set([...configIds, ...guildIds])];
}

function hasProtectedRole(member, guildId) {
  if (!member) return false;
  const roleIds = getProtectedRoleIds(guildId);
  if (roleIds.length === 0) return false;
  return member.roles.cache.some(r => roleIds.includes(r.id));
}

function getSuccessResponse(guildId) {
  return stateManager.getGuildSetting(guildId, 'success_response', '👍') || '👍';
}

export {
  caseEmbed, moderationDMEmbed, sendModerationDM,
  postModlog, postDocumentsChannel, handleEvidenceCollection, runModAction,
  parseDuration, formatDuration, checkHierarchy, extractUserAndReason,
  getSuccessResponse, getProtectedRoleIds, hasProtectedRole,
  ACTION_LABELS, ACTION_COLORS
};
