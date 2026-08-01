import client from '../../core/client.js';
import { styledEmbed } from '../../core/embeds.js';
import { departmentFor, roleIdsFor, memberCanTakeOverClaim, memberHasTicketClaimAuthority, claimTakeoverDeniedMessage, memberHasAnyRole } from '../../core/permissions.js';
import { userIdForChannel, recordHistory } from './ticket.js';
import { getTicketState, saveBridgeState } from '../../bridge.js';

async function handlePrefixCommand(message, args, guildId) {
  const userId = userIdForChannel(message.channel.id);
  if (!userId) {
    await message.reply({ embeds: [styledEmbed('Claim Failed', 'this is not a ticket channel.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  await handleClaimCommand(message, userId);
}

async function handleClaimCommand(message, userId) {
  const tickets = getTicketState();
  const ticket = tickets[userId];
  if (!ticket) {
    await message.reply({ embeds: [styledEmbed('Claim Failed', 'this user does not have an open modmail thread.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const canClaim = await memberHasAnyRole(message.guild.id, message.author.id, roleIdsFor(ticket.departmentId, 'reply'))
    || await memberHasTicketClaimAuthority(message, ticket);
  if (!canClaim) {
    await message.reply({ embeds: [styledEmbed('Claim Failed', 'you need a reply role for this ticket.')], allowedMentions: { repliedUser: false, parse: [] } });
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
  await saveBridgeState();
  await message.reply({ embeds: [styledEmbed('Ticket Claimed', previousClaimantTag
    ? `Claim taken over by **${message.author.tag}** from **${previousClaimantTag}**.`
    : `Claimed by **${message.author.tag}**.`)], allowedMentions: { repliedUser: false, parse: [] } });
}

async function handleUnclaimCommand(message, userId) {
  const tickets = getTicketState();
  const ticket = tickets[userId];
  if (!ticket) {
    await message.reply({ embeds: [styledEmbed('Unclaim Failed', 'this user does not have an open modmail thread.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const canUnclaim = await memberHasAnyRole(message.guild.id, message.author.id, roleIdsFor(ticket.departmentId, 'reply'));
  if (!canUnclaim) {
    await message.reply({ embeds: [styledEmbed('Unclaim Failed', 'you need a reply role for this ticket.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  delete ticket.claimedByStaffUserId;
  delete ticket.claimedByStaffTag;
  delete ticket.claimedAt;
  delete ticket.lastReplyStaffUserId;
  recordHistory(userId, { kind: 'TICKET UNCLAIMED', authorId: message.author.id, authorTag: message.author.tag, content: 'Ticket unclaimed', attachmentUrls: [] });
  await saveBridgeState();
  await message.reply({ embeds: [styledEmbed('Ticket Unclaimed', 'this ticket is no longer claimed.')], allowedMentions: { repliedUser: false, parse: [] } });
}

export { handleClaimCommand, handleUnclaimCommand };
export default handlePrefixCommand;
