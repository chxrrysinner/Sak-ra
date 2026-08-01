import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AuditLogEvent, PermissionFlagsBits } from 'discord.js';
import client from '../../core/client.js';
import { styledEmbed, trimTo, isImageAttachment, normalizeAttachments, imageProofDataFromAttachment, attachmentDataFromMessage } from '../../core/embeds.js';
import { pbanVoteWeight, memberCanVotePban } from '../../core/permissions.js';
import config from '../../core/config.js';

function saveState() {
  if (typeof globalThis.__HALLOWS_SAVE_STATE__ === 'function') {
    return globalThis.__HALLOWS_SAVE_STATE__();
  }
}

function stateRef() {
  return globalThis.__HALLOWS_STATE__ || {};
}

function pbanTimeoutsRef() {
  if (!globalThis.__HALLOWS_PBAN_TIMEOUTS__) {
    globalThis.__HALLOWS_PBAN_TIMEOUTS__ = new Map();
  }
  return globalThis.__HALLOWS_PBAN_TIMEOUTS__;
}

function pendingAddProofUploadsRef() {
  if (!globalThis.__HALLOWS_PENDING_ADD_PROOF_UPLOADS__) {
    globalThis.__HALLOWS_PENDING_ADD_PROOF_UPLOADS__ = new Map();
  }
  return globalThis.__HALLOWS_PENDING_ADD_PROOF_UPLOADS__;
}

let banSyncRunning = false;

export function banProfileKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

export function banProfileFor(guildId, userId) {
  return stateRef().banProfilesByGuildUser?.[banProfileKey(guildId, userId)] || null;
}

export function upsertBanProfile(guildId, user, fields = {}) {
  const state = stateRef();
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

function banSourceLabel(source) {
  if (source === 'pban') return 'PBAN';
  if (source === 'anti_bot_automod') return 'Anti-bot automod';
  return 'Server ban list';
}

export function banProfileEmbed(profile) {
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

export async function ensureBanProfileForUser(guild, userId) {
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

export async function addProofToBanProfile({ guild, userId, screenshots, addedBy }) {
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

function auditEntryForBan(auditEntries, userId) {
  return auditEntries.find((entry) => entry.target?.id === userId || entry.targetId === userId) || null;
}

export async function fetchRecentBanAuditEntries(guild) {
  const logs = await guild.fetchAuditLogs({
    type: AuditLogEvent.MemberBanAdd,
    limit: 100
  }).catch((error) => {
    console.error('Could not fetch ban audit logs:', error);
    return null;
  });

  return [...(logs?.entries?.values() || [])];
}

export async function sendBanProofReplies(message, proofUrls) {
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

export function validDiscordUserId(userId) {
  return /^\d{17,20}$/.test(userId || '');
}

export async function sendPbanLog(proposal, title, details, files = []) {
  const channelId = config.pban.logChannelId;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.() || !channel.send) return;

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

export function pbanStatusLabel(status) {
  return {
    proof_pending: 'Waiting for screenshot proof',
    voting: 'Voting',
    passed: 'Ban successful',
    cancelled: 'Cancelled',
    expired: 'Expired'
  }[status] || status;
}

export function pbanVoteTotal(proposal) {
  return Object.values(proposal.votes || {})
    .reduce((total, vote) => total + pbanVoteWeight(vote.rank), 0);
}

export function pbanVoteProgressBar(total) {
  const filled = Math.min(6, Math.max(0, total));
  return `${'█'.repeat(filled)}${'░'.repeat(6 - filled)}`;
}

export function pbanVoteSummary(proposal) {
  const total = pbanVoteTotal(proposal);
  const abstains = Object.values(proposal.abstains || {});
  const lines = [
    `**Vote Progress:** ${pbanVoteProgressBar(total)} ${Math.min(total, 6)}/6`,
    `**Vote Weight:** ${total}`
  ];
  if (abstains.length) lines.push(`**Abstains:** ${abstains.map((vote) => `<@${vote.userId}>`).join(', ')}`);
  return lines.join('\n');
}

export function pbanProposalEmbed(proposal) {
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

export function pbanVoteRow(proposal) {
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

export function pbanCleanupRow(proposal) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pban_cleanup:${proposal.messageId}`)
      .setLabel('Clean up messages')
      .setStyle(ButtonStyle.Primary)
  );
}

export function pbanComponents(proposal) {
  if (proposal.status === 'voting') return [pbanVoteRow(proposal)];
  if (proposal.status === 'passed' && !proposal.messageCleanupCompletedAt) return [pbanCleanupRow(proposal)];
  return [];
}

export function pbanPassed(proposal) {
  return pbanVoteTotal(proposal) >= 6;
}

export function clearPbanTimeout(messageId) {
  const timeouts = pbanTimeoutsRef();
  const timeout = timeouts.get(messageId);
  if (timeout) clearTimeout(timeout);
  timeouts.delete(messageId);
}

export async function editPbanProposalMessage(proposal) {
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

export async function expirePbanProposal(messageId) {
  const state = stateRef();
  const proposal = state.pbanProposalsByMessageId[messageId];
  if (!proposal || !['proof_pending', 'voting'].includes(proposal.status)) return;

  proposal.status = 'expired';
  proposal.expiredAt = Date.now();
  await saveState();
  clearPbanTimeout(messageId);
  await editPbanProposalMessage(proposal);
}

export function schedulePbanExpiration(messageId) {
  clearPbanTimeout(messageId);
  const state = stateRef();
  const proposal = state.pbanProposalsByMessageId[messageId];
  if (!proposal || !['proof_pending', 'voting'].includes(proposal.status)) return;

  const expiresAt = Number(proposal.expiresAt);
  if (!Number.isFinite(expiresAt)) return;

  const delay = Math.max(0, Math.min(expiresAt - Date.now(), 2_147_483_647));
  const timeouts = pbanTimeoutsRef();
  const timeout = setTimeout(async () => {
    timeouts.delete(messageId);
    const current = stateRef().pbanProposalsByMessageId[messageId];
    if (!current || Number(current.expiresAt) !== expiresAt) return;
    if (expiresAt > Date.now()) {
      schedulePbanExpiration(messageId);
      return;
    }
    await expirePbanProposal(messageId).catch((error) => {
      console.error(`Could not expire pban proposal ${messageId}:`, error);
    });
  }, delay);
  timeouts.set(messageId, timeout);
}

export async function restorePbanProposals() {
  const state = stateRef();
  for (const [messageId, proposal] of Object.entries(state.pbanProposalsByMessageId || {})) {
    if (['proof_pending', 'voting'].includes(proposal.status) && Number(proposal.expiresAt) <= Date.now()) {
      await expirePbanProposal(messageId);
    } else {
      schedulePbanExpiration(messageId);
      await editPbanProposalMessage(proposal);
    }
  }
}

export async function completePbanProposal(proposal, passedByUser) {
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
            `You can appeal this ban here: ${config.pban.appealsInvite}`
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

export async function cleanupUserMessagesInGuild(guild, userId, limitPerChannel = 10) {
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

export async function syncGuildBans(guild) {
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

export function addProofUploadKey(guildId, channelId, userId) {
  return `${guildId}:${channelId}:${userId}`;
}

export function clearPendingAddProofUpload(key) {
  const pendingUploads = pendingAddProofUploadsRef();
  const pending = pendingUploads.get(key);
  if (pending?.timeout) clearTimeout(pending.timeout);
  pendingUploads.delete(key);
}

export function setPendingAddProofUpload({ guild, channel, user, targetUserId }) {
  const key = addProofUploadKey(guild.id, channel.id, user.id);
  clearPendingAddProofUpload(key);

  const addProofUploadTimeoutMs = 5 * 60_000;
  const pendingUploads = pendingAddProofUploadsRef();
  const timeout = setTimeout(() => {
    pendingUploads.delete(key);
  }, addProofUploadTimeoutMs);

  pendingUploads.set(key, {
    guildId: guild.id,
    channelId: channel.id,
    userId: user.id,
    targetUserId,
    timeout,
    createdAt: Date.now()
  });
}

export async function handleAddProofUpload(message) {
  const key = addProofUploadKey(message.guild.id, message.channel.id, message.author.id);
  const pendingUploads = pendingAddProofUploadsRef();
  const pending = pendingUploads.get(key);
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

export async function sendAntiBotAutomodLog(message, status, details = '') {
  const channelId = config.pban.logChannelId;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.() || !channel.send) return;

  await channel.send({
    embeds: [
      styledEmbed(
        'Anti-Bot Automod Ban',
        [
          `**Person:** <@${message.author.id}> (\`${message.author.id}\`)`,
          `**User Tag:** ${message.author.tag}`,
          `**Channel:** <#${message.channel.id}>`,
          `**Reason:** ${config.antiBotAutomod.reason}`,
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

function canCleanupMessagesInChannel(channel, member) {
  if (!channel?.isTextBased?.() || !channel.messages?.fetch || !member) return false;

  const permissions = channel.permissionsFor(member);
  return Boolean(permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.ManageMessages
  ]));
}
