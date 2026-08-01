import client from '../../core/client.js';
import { ChannelType } from 'discord.js';
import { modmailEmbed } from '../../core/embeds.js';
import { memberHasPermission } from '../../core/permissions.js';
import { userIdForChannel, closeTicket, removeTimedClose, recordHistory } from './ticket.js';
import { getTicketState, getPendingState, saveBridgeState } from '../../bridge.js';

async function forceCloseByUserId(userId, closedBy, reason) {
  const tickets = getTicketState();
  const pending = getPendingState();
  const ticket = tickets[userId];

  if (!ticket) {
    if (pending[userId]) {
      delete pending[userId];
      removeTimedClose(userId);
      await saveBridgeState();
      return { ok: true, message: 'Removed pending ticket state for <@' + userId + '>.' };
    }
    return { ok: false, message: 'No open ticket is tracked for <@' + userId + '>.' };
  }

  const channel = ticket.channelId ? await client.channels.fetch(ticket.channelId).catch(() => null) : null;
  if (channel?.type === ChannelType.GuildText) {
    const result = await closeTicket(channel, closedBy, reason, { skipPermissionCheck: true });
    if (result.ok && pending[userId]) {
      delete pending[userId];
      await saveBridgeState();
    }
    return result;
  }

  removeTimedClose(userId);
  recordHistory(userId, {
    kind: 'TICKET FORCE CLOSED',
    authorId: closedBy.id,
    authorTag: closedBy.tag,
    content: reason + '; staff channel was missing or inaccessible',
    attachmentUrls: []
  });
  delete tickets[userId];
  if (pending[userId]) delete pending[userId];
  await saveBridgeState();
  return { ok: true, message: 'Removed stale ticket state for <@' + userId + '>.' };
}

async function handlePrefixCommand(message, args, guildId) {
  const member = message.member;
  if (!member || !memberHasPermission(member, 'tickets.forceClose')) return;
  const parts = args.trim().split(/\s+/);
  const query = parts[0]?.replace(/[<@!>]/g, '') || '';

  if (query === 'all') {
    const tickets = getTicketState();
    const pending = getPendingState();
    const userIds = [...new Set([...Object.keys(tickets), ...Object.keys(pending)])];
    let closed = 0, failed = 0;
    for (const uid of userIds) {
      const r = await forceCloseByUserId(uid, message.author, 'Force closed by ?fclose all');
      if (r.ok) closed++; else failed++;
    }
    await message.reply('Force close complete. Closed **' + closed + '** ticket(s). Failed **' + failed + '**.');
    return;
  }

  const channelUserId = userIdForChannel(message.channel.id);
  const targetId = query || channelUserId;
  if (!targetId) {
    await message.reply('Usage: `?fclose <user ID>` or `?fclose all`');
    return;
  }
  const result = await forceCloseByUserId(targetId, message.author, 'Force closed by ?fclose');
  await message.reply((result.ok ? '✅ ' : '❌ ') + result.message);
}

async function handleSlashCommand(interaction) {
  if (!interaction.member || !memberHasPermission(interaction.member, 'tickets.forceClose')) return;

  const closeAll = interaction.options.getBoolean('all') || false;
  const targetUser = interaction.options.getUser('user');

  if (closeAll) {
    await interaction.deferReply({ ephemeral: true });
    const tickets = getTicketState();
    const pending = getPendingState();
    const userIds = [...new Set([...Object.keys(tickets), ...Object.keys(pending)])];
    let closed = 0, failed = 0;
    for (const uid of userIds) {
      const r = await forceCloseByUserId(uid, interaction.user, 'Force closed by /fclose all');
      if (r.ok) closed++; else failed++;
    }
    await interaction.editReply('Force close complete. Closed **' + closed + '** ticket(s). Failed **' + failed + '**.');
    return;
  }

  const channelUserId = interaction.channel?.id ? userIdForChannel(interaction.channel.id) : null;
  const userId = targetUser?.id || channelUserId;
  if (!userId) {
    await interaction.reply({ content: 'Use `/fclose user:<user>` or `/fclose all:true`.', ephemeral: true });
    return;
  }
  const result = await forceCloseByUserId(userId, interaction.user, 'Force closed by /fclose');
  await interaction.reply({ content: (result.ok ? '✅ ' : '❌ ') + result.message, ephemeral: true });
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
