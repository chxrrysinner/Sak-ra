import { AttachmentBuilder } from 'discord.js';
import client from '../../core/client.js';
import config from '../../core/config.js';
import { styledEmbed, modmailEmbed, modmailMessageEmbeds, trimTo, attachmentDataFromMessage, sendEmbedsAsMessages, sendPlainTextMessages } from '../../core/embeds.js';
import {
  departmentFor, commandRoleIds, roleIdsFor, memberCanUsePrefixRoles,
  commandCanRunInTicketBranchForMember, restrictedTicketBranchMessage,
  ticketRoleIdsForCommand, modmailPrefixCommandPolicy, savedSnippetCommandPolicy
} from '../../core/permissions.js';
import { getTicketState, getTimedCloseState, saveBridgeState } from '../../bridge.js';
import { getPrefix } from '../../core/prefix.js';
import { userIdForChannel, ticketChannelName, recordHistory } from './ticket.js';
import { relayStaffReply } from './reply.js';
import { generateTranscriptBuffer, formatTimestamp, formatDuration } from './transcripts.js';
import { safeChannelLabel, stripPriorityPrefix, priorityChannelName, syncTicketChannelName, queueTicketChannelRename, restoreTicketChannelNames, escapeRegExp } from './shared.js';
import { getTicketCommands } from './commands.js';

let _cmdCache = null;
function tc(key) {
  if (!_cmdCache) {
    const fromFile = config.policy.commands || {};
    _cmdCache = { ...fromFile };
  }
  return _cmdCache[key];
}

const HELP_COMMAND = tc('help') || '?h';
const SNIPPETS_COMMAND = tc('snippets') || '?s';
const REPLY_PREFIX = tc('reply') || '?r';
const PARTNERSHIP_AD_COMMAND = tc('partnershipAd') || '?ad';
const TIMED_CLOSE_COMMAND = tc('timedClose') || '?close';
const REPORT_FINISHED_COMMAND = tc('reportFinished') || '?repfin';
const RENAME_COMMAND = tc('rename') || '?rename';
const PRIORITY_COMMAND = tc('priority') || '?priority';
const NOTE_COMMAND = tc('note') || '?note';
const USER_INFO_COMMAND = tc('userInfo') || '?id';
const TRANSFER_COMMAND = tc('transfer') || '?transfer';
const TRANSCRIPT_COMMAND = tc('transcript') || '?transcript';
const CLAIM_INFO_COMMAND = tc('claimInfo') || '?claiminfo';
const CLOSE_INFO_COMMAND = tc('closeInfo') || '?closeinfo';
const ESCALATE_COMMAND = tc('escalate') || '?escalate';
const CANCEL_CLOSE_COMMAND = tc('cancelClose') || '?cancelclose';
const TIMER_COMMAND = tc('timer') || '?timer';
const CLAIM_COMMAND = tc('claim') || '?c';
const CLAIM_COMMAND_ALIASES = [...new Set([CLAIM_COMMAND, '?claim'])];
const UNCLAIM_COMMAND = tc('unclaim') || '?unclaim';
const SNIPPET_PREVIEW_PREFIX = tc('previewPrefix') || '!!!';
const SAVED_SNIPPETS = config.policy.savedSnippets || {};

const COMMAND_HELP = {
  ad: `use **${PARTNERSHIP_AD_COMMAND}** in a partnership or internals ticket to send the saved partnership introduction and advertisement to the user.`,
  r: `use **${REPLY_PREFIX} <response>** to send a staff reply to the user who opened the ticket.`,
  s: `use **${SNIPPETS_COMMAND}** to list the available snippets. use **${SNIPPETS_COMMAND} <command> perms** to list the roles allowed to use a command.`,
  close: `use **${TIMED_CLOSE_COMMAND} <time>** to send the saved closing warning and close the ticket automatically after that many minutes.`,
  repfin: `use **${REPORT_FINISHED_COMMAND}** in a moderation or internals ticket to send the saved investigation response to the user.`,
  c: `use **${CLAIM_COMMAND}** or **?claim** to mark yourself as the staff member handling a ticket.`,
  claim: `use **${CLAIM_COMMAND}** or **?claim** to mark yourself as the staff member handling a ticket.`,
  unclaim: `use **${UNCLAIM_COMMAND}** to release a claimed ticket.`,
  cancelclose: `use **${CANCEL_CLOSE_COMMAND}** to remove an active timed-close deadline.`,
  timer: `use **${TIMER_COMMAND}** to view the remaining timed-close duration.`,
  note: `use **${NOTE_COMMAND} <text>** to add an explicit internal transcript note.`,
  id: `use **${USER_INFO_COMMAND}** to show details about the ticket opener.`,
  transfer: `use **${TRANSFER_COMMAND} <wing>** to transfer a ticket.`,
  rename: `use **${RENAME_COMMAND} <name>** to rename the staff ticket channel.`,
  priority: `use **${PRIORITY_COMMAND} <low|normal|high|urgent>** to set ticket priority.`,
  transcript: `use **${TRANSCRIPT_COMMAND}** to generate a transcript preview without closing the ticket.`,
  claiminfo: `use **${CLAIM_INFO_COMMAND}** to view the ticket claimant and claim time.`,
  closeinfo: `use **${CLOSE_INFO_COMMAND}** to view the scheduled close timestamp and remaining time.`,
  escalate: `use **${ESCALATE_COMMAND}** to transfer the ticket to internals.`,
  h: `use **${HELP_COMMAND} <command>** to view a command description.`
};

for (const [key, snippet] of Object.entries(SAVED_SNIPPETS)) {
  COMMAND_HELP[key] = snippet.description;
}

const SNIPPET_PREVIEW_PREFIX_REGEX = (() => {
  const escaped = SNIPPET_PREVIEW_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}`);
})();

function previewCommand(command) {
  return `${SNIPPET_PREVIEW_PREFIX}${command.replace(/^\?/, '')}`;
}

async function readPartnershipAd() {
  try {
    const { readText } = await import('../../core/config.js');
    return await readText(config.paths.partnershipAdFile, 'partnership ad');
  } catch { return ''; }
}

async function handlePrefixCommand(message, args, guildId) {
  const trimmed = message.content.trim();
  const userId = userIdForChannel(message.channel.id);

  const helpMatch = trimmed.match(new RegExp(`^${escapeRegExp(HELP_COMMAND)}(?:\\s+(\\S+))?$`, 'i'));
  if (helpMatch) { await handleHelpCommand(message, helpMatch[1] || ''); return; }

  const snippetPermsMatch = trimmed.match(new RegExp(`^${escapeRegExp(SNIPPETS_COMMAND)}\\s+(\\S+)\\s+perms$`, 'i'));
  if (snippetPermsMatch) { await handleSnippetPermissionsCommand(message, snippetPermsMatch[1]); return; }

  if (new RegExp(`^${escapeRegExp(SNIPPETS_COMMAND)}\\s+perms$`, 'i').test(trimmed)) { await handleSnippetPermissionsCommand(message, ''); return; }

  if (new RegExp(`^${escapeRegExp(SNIPPETS_COMMAND)}$`, 'i').test(trimmed)) { await handleSnippetsListCommand(message); return; }

  if (userId) {
    const previewMatch = trimmed.match(new RegExp(`^${escapeRegExp(previewCommand(REPLY_PREFIX))}(?:\\s+([\\s\\S]*))?$`, 'i'));
    if (previewMatch) { await handleSnippetPreview(message, REPLY_PREFIX, (previewMatch[1] || '').trim()); return; }

    if (new RegExp(`^${escapeRegExp(previewCommand(TIMED_CLOSE_COMMAND))}$`, 'i').test(trimmed)) { await handleSnippetPreview(message, TIMED_CLOSE_COMMAND); return; }
    if (new RegExp(`^${escapeRegExp(previewCommand(PARTNERSHIP_AD_COMMAND))}$`, 'i').test(trimmed)) { await handleSnippetPreview(message, PARTNERSHIP_AD_COMMAND); return; }
    if (new RegExp(`^${escapeRegExp(previewCommand(REPORT_FINISHED_COMMAND))}$`, 'i').test(trimmed)) { await handleSnippetPreview(message, REPORT_FINISHED_COMMAND); return; }

    const savedPreview = Object.values(SAVED_SNIPPETS).find((s) =>
      new RegExp(`^${escapeRegExp(previewCommand(s.command))}$`, 'i').test(trimmed)
    );
    if (savedPreview) { await handleSnippetPreview(message, savedPreview.command); return; }

    const controlPreviews = [SNIPPETS_COMMAND, HELP_COMMAND, CLAIM_COMMAND, UNCLAIM_COMMAND, CANCEL_CLOSE_COMMAND, TIMER_COMMAND, NOTE_COMMAND, USER_INFO_COMMAND, TRANSFER_COMMAND, RENAME_COMMAND, PRIORITY_COMMAND, TRANSCRIPT_COMMAND, CLAIM_INFO_COMMAND, CLOSE_INFO_COMMAND, ESCALATE_COMMAND];
    for (const cmd of controlPreviews) {
      const m = trimmed.match(new RegExp(`^${escapeRegExp(previewCommand(cmd))}(?:\\s+([\\s\\S]*))?$`, 'i'));
      if (m) { await handleSnippetPreview(message, cmd, (m[1] || '').trim(), userId); return; }
    }

    if (new RegExp(`^${escapeRegExp(PARTNERSHIP_AD_COMMAND)}$`, 'i').test(trimmed)) { await handlePartnershipAdCommand(message, userId); return; }
    if (new RegExp(`^${escapeRegExp(REPORT_FINISHED_COMMAND)}$`, 'i').test(trimmed)) { await handleReportFinishedCommand(message, userId); return; }

    const savedSnippet = Object.values(SAVED_SNIPPETS).find((s) =>
      new RegExp(`^${escapeRegExp(s.command)}$`, 'i').test(trimmed)
    );
    if (savedSnippet) { await handleSavedSnippetCommand(message, userId, savedSnippet); return; }

    const noteMatch = trimmed.match(new RegExp(`^${escapeRegExp(NOTE_COMMAND)}(?:\\s+([\\s\\S]*))?$`, 'i'));
    if (noteMatch) { await handleNoteCommand(message, userId, (noteMatch[1] || '').trim()); return; }

    if (new RegExp(`^${escapeRegExp(USER_INFO_COMMAND)}$`, 'i').test(trimmed)) { await handleUserInfoCommand(message, userId); return; }

    const renameMatch = trimmed.match(new RegExp(`^${escapeRegExp(RENAME_COMMAND)}(?:\\s+([\\s\\S]*))?$`, 'i'));
    if (renameMatch) { await handleRenameCommand(message, userId, (renameMatch[1] || '').trim()); return; }

    const priorityMatch = trimmed.match(new RegExp(`^${escapeRegExp(PRIORITY_COMMAND)}(?:\\s+(\\S+))?$`, 'i'));
    if (priorityMatch) { await handlePriorityCommand(message, userId, (priorityMatch[1] || '').toLowerCase()); return; }

    if (new RegExp(`^${escapeRegExp(TRANSCRIPT_COMMAND)}$`, 'i').test(trimmed)) { await handleTranscriptCommand(message, userId); return; }
    if (new RegExp(`^${escapeRegExp(CLAIM_INFO_COMMAND)}$`, 'i').test(trimmed)) { await handleClaimInfoCommand(message, userId); return; }
    if (new RegExp(`^${escapeRegExp(CLOSE_INFO_COMMAND)}$`, 'i').test(trimmed)) { await handleCloseInfoCommand(message, userId); return; }
  }
}

async function handleHelpCommand(message, commandName) {
  const canUse = await memberCanUsePrefixRoles(message.guild.id, message.author.id, commandRoleIds('help'));
  if (!canUse) {
    await message.reply({ embeds: [styledEmbed('Help Not Available', 'you need a staff hierarchy role to use this command.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  const key = commandName.replace(/^[?!]+/, '').toLowerCase();
  if (!key) {
    await message.reply({ embeds: [styledEmbed('Help: h', COMMAND_HELP.h)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  if (key === 'h') {
    await message.reply({ content: 'hhhhhhhhhhhhhh wtf are u doing bro', allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  const description = COMMAND_HELP[key];
  if (!description) {
    await message.reply({ embeds: [styledEmbed('Help Not Found', `use **${HELP_COMMAND} <command>** with one of: **${Object.keys(COMMAND_HELP).join('**, **')}**.`)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  await message.reply({ embeds: [styledEmbed(`Help: ${key}`, description)], allowedMentions: { repliedUser: false, parse: [] } });
}

async function handleSnippetPermissionsCommand(message, commandName) {
  const canUse = await memberCanUsePrefixRoles(message.guild.id, message.author.id, commandRoleIds('snippets'));
  if (!canUse) {
    await message.reply({ embeds: [styledEmbed('Permissions Not Available', 'you need a staff hierarchy role to use this command.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  if (!commandName) {
    await message.reply({ embeds: [styledEmbed('Permissions', `use **${SNIPPETS_COMMAND} <command> perms**, such as **${SNIPPETS_COMMAND} r perms** or **${SNIPPETS_COMMAND} ad perms**.`)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  const { snippetPermissionsEmbed } = await import('./snippets.js');
  await message.reply({ embeds: [snippetPermissionsEmbed(commandName)], allowedMentions: { repliedUser: false, parse: [] } });
}

async function handleSnippetsListCommand(message) {
  const canUse = await memberCanUsePrefixRoles(message.guild.id, message.author.id, commandRoleIds('snippets'));
  if (!canUse) {
    await message.reply({ embeds: [styledEmbed('Snippets Not Available', 'you need a staff hierarchy role to use this command.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  const { snippetsEmbed } = await import('./snippets.js');
  await message.reply({ embeds: [snippetsEmbed()], allowedMentions: { repliedUser: false, parse: [] } });
}

async function handleSnippetPreview(message, snippetCommand, replyText = '', userId = null) {
  const canPreview = await memberCanUsePrefixRoles(message.guild.id, message.author.id, commandRoleIds('preview'));
  if (!canPreview) {
    await message.reply({ embeds: [styledEmbed('Preview Not Available', 'you need a staff hierarchy role to preview snippets.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  if (snippetCommand === REPLY_PREFIX) {
    const attachments = attachmentDataFromMessage(message);
    if (!replyText && !attachments.length) {
      await message.reply({ embeds: [styledEmbed('Preview Not Available', `use **${previewCommand(REPLY_PREFIX)} <response>** or attach a file to preview a reply.`)], allowedMentions: { repliedUser: false, parse: [] } });
      return;
    }
    await sendEmbedsAsMessages(message.channel, modmailMessageEmbeds({
      title: 'Preview: Staff Reply',
      content: replyText,
      attachments,
      fallback: '*No text content provided.*',
      author: { name: message.author.username, iconURL: message.author.displayAvatarURL() }
    }), { allowedMentions: { parse: [] } });
    return;
  }

  if (snippetCommand === PARTNERSHIP_AD_COMMAND) {
    let adText = '';
    try { adText = await readPartnershipAd(); } catch {
      await message.reply({ embeds: [styledEmbed('Preview Not Available', `i could not read the partnership ad file.`)], allowedMentions: { repliedUser: false, parse: [] } });
      return;
    }
    if (!adText) {
      await message.reply({ embeds: [styledEmbed('Preview Not Available', 'the partnership ad file is empty.')], allowedMentions: { repliedUser: false, parse: [] } });
      return;
    }
    let introMsg = 'thank you for choosing to partner with us!';
    try { const { readText } = await import('../../core/config.js'); introMsg = await readText(config.paths.partnershipAdIntroFile, 'partnership ad intro'); } catch {}
    await message.channel.send({ embeds: [styledEmbed('Preview: Staff Reply', introMsg).setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })], allowedMentions: { parse: [] } });
    await sendPlainTextMessages(message.channel, adText, { allowedMentions: { parse: [] } });
    return;
  }

  if (snippetCommand === TIMED_CLOSE_COMMAND) {
    const tcMsg = config.policy.savedSnippets?.['timed-close-warning']?.message || 'your ticket will close soon due to inactivity. send a message to keep it open.';
    await message.channel.send({ embeds: [styledEmbed('Preview: Staff Reply', tcMsg).setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })], allowedMentions: { parse: [] } });
    return;
  }

  if (snippetCommand === REPORT_FINISHED_COMMAND) {
    const repMsg = config.policy.savedSnippets?.['report-finished-message']?.message || 'thank you for reporting. we will take appropriate action.';
    await message.channel.send({ embeds: [styledEmbed('Preview: Staff Reply', repMsg).setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })], allowedMentions: { parse: [] } });
    return;
  }

  const savedSnippet = Object.values(SAVED_SNIPPETS).find((s) => s.command === snippetCommand);
  if (savedSnippet) {
    await message.channel.send({ embeds: [styledEmbed('Preview: Staff Reply', savedSnippet.message).setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })], allowedMentions: { parse: [] } });
    return;
  }

  const ticket = userId ? getTicketState()?.[userId] : null;
  const tcState = getTimedCloseState();
  const closeAt = Number(userId ? tcState[userId]?.closeAt : null);
  const previewText = replyText || 'example';
  const previews = new Map([
    [SNIPPETS_COMMAND, styledEmbed('Snippets', '')],
    [HELP_COMMAND, styledEmbed('Help: h', COMMAND_HELP.h)],
    [CLAIM_COMMAND, styledEmbed('Preview: Ticket Claimed', `Claimed by **${message.author.tag}**.`)],
    [UNCLAIM_COMMAND, styledEmbed('Preview: Ticket Unclaimed', 'this ticket is no longer claimed.')],
    [CANCEL_CLOSE_COMMAND, styledEmbed('Preview: Close Timer', 'the timed close was cancelled.')],
    [TIMER_COMMAND, styledEmbed('Preview: Close Timer', Number.isFinite(closeAt) ? `this ticket closes in **${formatDuration(closeAt - Date.now())}**.` : 'this ticket does not have an active close timer.')],
    [NOTE_COMMAND, styledEmbed('Preview: Internal Note Added', previewText)],
    [USER_INFO_COMMAND, styledEmbed('Preview: Ticket User Info', `**User ID:** \`${userId || 'example-user-id'}\`\n**Wing:** ${departmentFor(ticket?.departmentId)?.label || 'Example Wing'}\n**Priority:** ${ticket?.priority || 'normal'}\n**Claimed By:** ${ticket?.claimedByStaffTag || 'nobody'}`)],
    [TRANSFER_COMMAND, styledEmbed('Preview: Ticket Transferred', `transferred this ticket to **${replyText || 'assistants'}**.`)],
    [RENAME_COMMAND, styledEmbed('Preview: Ticket Renamed', `renamed this ticket to **${safeChannelLabel(previewText) || 'example'}**.`)],
    [PRIORITY_COMMAND, styledEmbed('Preview: Ticket Priority', `priority set to **${replyText || 'high'}**.`)],
    [TRANSCRIPT_COMMAND, styledEmbed('Preview: Transcript Preview', 'this command attaches a transcript preview without closing the ticket.')],
    [CLAIM_INFO_COMMAND, styledEmbed('Preview: Claim Info', ticket?.claimedByStaffTag ? `**Claimed By:** ${ticket.claimedByStaffTag}\n**Priority:** ${ticket.priority || 'normal'}` : 'this ticket is not claimed.')],
    [CLOSE_INFO_COMMAND, styledEmbed('Preview: Close Info', Number.isFinite(closeAt) ? `**Closes At:** ${formatTimestamp(closeAt)}\n**Remaining:** ${formatDuration(closeAt - Date.now())}` : 'this ticket does not have an active close timer.')],
    [ESCALATE_COMMAND, styledEmbed('Preview: Ticket Escalated', 'your ticket is being escalated to internals.')]
  ]);
  const preview = previews.get(CLAIM_COMMAND_ALIASES.includes(snippetCommand) ? CLAIM_COMMAND : snippetCommand);
  if (preview) {
    await message.channel.send({ embeds: [preview], allowedMentions: { parse: [] } });
  }
}

async function handleSavedSnippetCommand(message, userId, snippet) {
  const commandPolicy = savedSnippetCommandPolicy(snippet);
  if (!await commandCanRunInTicketBranchForMember(message, commandPolicy, ticket?.departmentId)) {
    await message.reply({ embeds: [styledEmbed('Reply Not Sent', restrictedTicketBranchMessage(commandPolicy, snippet.command))], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  await relayStaffReply(message, userId, snippet.message);
}

// The following commands have been moved to their own files:
// handlePartnershipAdCommand -> ad.js
// handleReportFinishedCommand -> report-finished.js
// handleRenameCommand -> rename.js
// handlePriorityCommand -> priority.js
// handleNoteCommand -> note.js
// handleUserInfoCommand -> userinfo.js
// handleTranscriptCommand -> transcript.js
// handleClaimInfoCommand -> claiminfo.js
// handleCloseInfoCommand -> closeinfo.js
// handleTimerCommand -> timer.js
// handleHelpCommand, handleSnippetPermissionsCommand, handleSnippetsListCommand, handleSnippetPreview, handleSavedSnippetCommand are above.

export {
  handlePrefixCommand,
  handleHelpCommand, handleSnippetPermissionsCommand, handleSnippetsListCommand,
  handleSnippetPreview, handleSavedSnippetCommand
};
export default handlePrefixCommand;