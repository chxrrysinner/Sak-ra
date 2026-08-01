import client from '../../core/client.js';
import { styledEmbed, modmailEmbed, modmailMessageEmbeds, sendEmbedsAsMessages } from '../../core/embeds.js';
import { closeTicket, userIdForChannel, recordHistory } from './ticket.js';
import { getTicketState, getTimedCloseState, saveBridgeState, getTimedCloseTimeouts } from '../../bridge.js';
import { memberHasAnyRole, roleIdsFor, departmentFor } from '../../core/permissions.js';
import config from '../../core/config.js';
import { getTicketCommands } from './commands.js';

function tc(key) {
  return getTicketCommands()[key];
}

const TIMED_CLOSE_COMMAND = tc('timedClose') || '?close';

async function handlePrefixCommand(message, args, guildId) {
  const userId = userIdForChannel(message.channel.id);
  if (!userId) {
    await message.reply('usage: `?close <minutes>` — schedule a close for this ticket (inside a ticket channel).');
    return;
  }
  await handleTimedCloseCommand(message, userId, args || '');
}

async function handleTimedCloseCommand(message, userId, minutesText) {
  const state = getTicketState();
  const ticket = state[userId];
  if (!ticket) {
    await message.reply({
      embeds: [styledEmbed('Timed Close Not Started', 'this channel is not linked to an open modmail ticket.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const minutes = Number(minutesText);
  const autoCloseAt = Date.now() + (minutes * 60_000);
  if (!Number.isSafeInteger(minutes) || minutes <= 0 || !Number.isSafeInteger(autoCloseAt)) {
    await message.reply({
      embeds: [styledEmbed('Timed Close Not Started', `use **${TIMED_CLOSE_COMMAND} <time>** with a positive whole number of minutes, such as **${TIMED_CLOSE_COMMAND} 60**.`)],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const department = departmentFor(ticket.departmentId);
  const closeRoleIds = roleIdsFor(ticket.departmentId, 'close');
  if (!closeRoleIds.length) {
    await message.reply({
      embeds: [styledEmbed('Timed Close Not Started', `no close roles are configured for **${department?.label || ticket.departmentId}**.`)],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const canClose = await memberHasAnyRole(message.guild.id, message.author.id, closeRoleIds);
  if (!canClose) {
    await message.reply({
      embeds: [styledEmbed('Timed Close Not Started', `you need a **${department?.label || 'wing'}** close role to use **${TIMED_CLOSE_COMMAND}** in this ticket.`)],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) {
    await message.reply({
      embeds: [styledEmbed('Timed Close Not Started', 'i could not find the user for this ticket.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  let timedCloseMessage = 'your ticket will close soon due to inactivity. send a message to keep it open.';
  try {
    const { readText } = await import('../../core/config.js');
    timedCloseMessage = await readText(config.paths.timedCloseMessageFile, 'timed-close-message');
  } catch {}

  const delivered = await user.send({
    embeds: [styledEmbed('Staff Reply', timedCloseMessage)],
    allowedMentions: { parse: [] }
  }).then(() => true).catch(() => false);

  if (!delivered) {
    await message.reply({
      embeds: [styledEmbed('Timed Close Not Started', 'i could not dm this user. they may have dms disabled or may have blocked the bot.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  recordHistory(userId, {
    kind: 'STAFF REPLY',
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: timedCloseMessage,
    attachmentUrls: []
  });
  ticket.lastReplyStaffUserId = message.author.id;

  const tcState = getTimedCloseState();
  tcState[userId] = { closeAt: autoCloseAt };
  await saveBridgeState();
  if (typeof globalThis.__HALLOWS_SAVE_TIMED_CLOSE_STATE__ === 'function') {
    await globalThis.__HALLOWS_SAVE_TIMED_CLOSE_STATE__();
  }

  scheduleTimedClose(userId);

  await message.delete().catch(() => null);
  await message.channel.send({
    embeds: [
      styledEmbed('Staff Reply', timedCloseMessage)
        .setAuthor({
          name: message.author.username,
          iconURL: message.author.displayAvatarURL()
        })
    ],
    allowedMentions: { parse: [] }
  });
}

function clearTimedCloseTimeout(userId) {
  const timeouts = getTimedCloseTimeouts();
  const timeout = timeouts.get(userId);
  if (timeout) clearTimeout(timeout);
  timeouts.delete(userId);
}

function scheduleTimedClose(userId) {
  const timeouts = getTimedCloseTimeouts();
  const old = timeouts.get(userId);
  if (old) clearTimeout(old);
  timeouts.delete(userId);

  const tcState = getTimedCloseState();
  const timer = tcState[userId];
  if (!timer) return;

  const delay = Math.max(0, Math.min(timer.closeAt - Date.now(), 2_147_483_647));
  const timeout = setTimeout(async () => {
    timeouts.delete(userId);
    const currentTimer = getTimedCloseState()[userId];
    if (!currentTimer || currentTimer.closeAt !== timer.closeAt) return;
    if (timer.closeAt > Date.now()) {
      scheduleTimedClose(userId);
      return;
    }
    const state = getTicketState();
    const ticket = state[userId];
    if (!ticket) return;
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel) return;
    const result = await closeTicket(channel, client.user, 'ticket closed due to inactivity.', { skipPermissionCheck: true });
    if (!result.ok) {
      await channel.send({ embeds: [styledEmbed('Close Failed', result.message)], allowedMentions: { parse: [] } }).catch(() => null);
    }
  }, delay);
  timeouts.set(userId, timeout);
}

async function handleCancelCloseCommand(message, userId) {
  const tcState = getTimedCloseState();
  if (!tcState[userId]) {
    await message.reply({
      embeds: [styledEmbed('No Close Scheduled', 'there is no scheduled close for this ticket.')],
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  clearTimedCloseTimeout(userId);
  delete tcState[userId];
  if (typeof globalThis.__HALLOWS_SAVE_TIMED_CLOSE_STATE__ === 'function') {
    await globalThis.__HALLOWS_SAVE_TIMED_CLOSE_STATE__();
  }

  await message.reply({
    embeds: [styledEmbed('Close Timer', 'the timed close was cancelled.')],
    allowedMentions: { repliedUser: false, parse: [] }
  });
}

export { handlePrefixCommand, handleTimedCloseCommand, handleCancelCloseCommand, scheduleTimedClose, clearTimedCloseTimeout };
export default handlePrefixCommand;
