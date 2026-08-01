import client from '../../core/client.js';
import { styledEmbed, modmailEmbed, modmailMessageEmbeds, attachmentDataFromMessage, sendEmbedsAsMessages, containsDiscordInvite, trimTo } from '../../core/embeds.js';
import { departmentFor, normalizeDepartmentId, roleIdsFor, memberCanUsePrefixRoles } from '../../core/permissions.js';
import { activeChannelFor, userIdForChannel, sendDepartmentPrompt, recordHistory } from './ticket.js';
import { getTicketState, getPendingState, saveBridgeState, getTimedCloseState } from '../../bridge.js';
import { getTicketCommands } from './commands.js';

function tc(key) {
  return getTicketCommands()[key];
}

const REPLY_PREFIX = tc('reply') || '?r';

async function relayUserDm(message) {
  const userId = message.author.id;
  const tickets = getTicketState();
  const pending = getPendingState();
  const ticket = tickets[userId];
  const existingChannel = await activeChannelFor(userId);

  if (pending[userId] && !ticket) {
    await message.author.send({
      embeds: [modmailEmbed('Waiting', 'A wing has been requested. Please check the wing selection I sent earlier.')],
      allowedMentions: { parse: [] }
    }).catch(() => null);
    return;
  }

  if (!ticket || !existingChannel) {
    await sendDepartmentPrompt(message);
    return;
  }

  if (ticket.guildId && existingChannel.guildId !== ticket.guildId) {
    await message.author.send({
      embeds: [modmailEmbed('Ticket Not Found', 'Your ticket is associated with a different server.')],
      allowedMentions: { parse: [] }
    }).catch(() => null);
    return;
  }

  const relayEmbeds = modmailMessageEmbeds({
    title: `New message from ${message.author.tag}`,
    content: message.content,
    attachments: attachmentDataFromMessage(message),
    fallback: 'Sent an attachment.',
    author: { name: message.author.tag, iconURL: message.author.displayAvatarURL() }
  });

  await message.react('✅').catch(() => null);

  await sendEmbedsAsMessages(existingChannel, relayEmbeds, {
    firstMessageContent: ticket.claimedByStaffUserId ? `<@${ticket.claimedByStaffUserId}>` : undefined,
    allowedMentions: { users: ticket.claimedByStaffUserId ? [ticket.claimedByStaffUserId] : [] }
  }).catch(async () => {
    if (ticket.guildId) {
      const guild = await client.guilds.fetch(ticket.guildId).catch(() => null);
      if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          await message.author.send({
            embeds: [modmailEmbed('Ticket Closed', 'You are no longer in the server, so this ticket has been closed.')],
            allowedMentions: { parse: [] }
          }).catch(() => null);
          const { closeTicket } = await import('./ticket.js');
          await closeTicket(existingChannel, client.user, 'User left the server', { skipPermissionCheck: true });
          return;
        }
      }
    }

    await message.author.send({
      embeds: [modmailEmbed('Delivery Failed', 'I could not deliver your message. The staff channel may have been deleted.')],
      allowedMentions: { parse: [] }
    }).catch(() => null);
  });

  if (normalizeDepartmentId(ticket.departmentId) === 'partnership' && message.content && containsDiscordInvite(message.content)) {
    await existingChannel.send({
      content: trimTo(message.content.trim(), 1900),
      allowedMentions: { parse: [] }
    }).catch(() => null);
  }

  recordHistory(userId, {
    kind: 'USER MESSAGE',
    authorId: userId,
    authorTag: message.author.tag,
    content: message.content,
    attachmentUrls: message.attachments.map((a) => a.url)
  });
  await saveBridgeState();

  const tcState = getTimedCloseState();
  if (tcState[userId]) {
    delete tcState[userId];
    if (typeof globalThis.__HALLOWS_SAVE_TIMED_CLOSE_STATE__ === 'function') {
      await globalThis.__HALLOWS_SAVE_TIMED_CLOSE_STATE__();
    }
  }
}

async function relayStaffReply(message, userId, replyText) {
  const tickets = getTicketState();
  const ticket = tickets[userId];
  if (!ticket) {
    await message.reply({
      embeds: [styledEmbed('Reply Not Sent', 'this channel is not linked to an open modmail ticket.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const department = departmentFor(ticket.departmentId);
  const replyRoleIds = roleIdsFor(ticket.departmentId, 'reply');
  if (!replyRoleIds.length) {
    await message.reply({
      embeds: [styledEmbed('Reply Not Sent', `no reply roles are configured for **${department?.label || ticket.departmentId}** in the ticket branch policy.`)],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const canReply = await memberCanUsePrefixRoles(message.guild.id, message.author.id, replyRoleIds);
  if (!canReply) {
    await message.reply({
      embeds: [styledEmbed('Reply Not Sent', `you need a **${department?.label || 'wing'}** reply role to use **${REPLY_PREFIX}** in this ticket.`)],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) {
    await message.reply({
      embeds: [styledEmbed('Reply Not Sent', 'i could not find the user for this ticket.')],
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
      embeds: [styledEmbed('Reply Not Sent', 'i could not dm this user. they may have dms disabled or may have blocked the bot.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  recordHistory(userId, {
    kind: 'STAFF REPLY',
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: replyText || '',
    attachmentUrls: attachments.map((a) => a.url)
  });
  ticket.lastReplyStaffUserId = message.author.id;
  ticket.lastActivityAt = new Date().toISOString();
  await saveBridgeState();

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

async function recordStaffNote(message, userId) {
  if (!message.content && !message.attachments.size) return;

  recordHistory(userId, {
    kind: 'STAFF NOTE',
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: message.content || '',
    attachmentUrls: message.attachments.map((a) => a.url)
  });
  await saveBridgeState();
}

async function handlePrefixCommand(message, args, guildId) {
  const userId = userIdForChannel(message.channel.id);
  if (!userId) {
    await message.reply({ embeds: [styledEmbed('Reply Not Sent', `use **${REPLY_PREFIX} <response>** in a ticket channel.`)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  const replyText = args?.trim() || '';
  if (!replyText && !message.attachments.size) {
    await message.reply({ embeds: [styledEmbed('Reply Not Sent', `use **${REPLY_PREFIX} <response>** or attach a file with **${REPLY_PREFIX}**.`)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  await relayStaffReply(message, userId, replyText);
}

export { relayUserDm, relayStaffReply, recordStaffNote, handlePrefixCommand };
export default handlePrefixCommand;