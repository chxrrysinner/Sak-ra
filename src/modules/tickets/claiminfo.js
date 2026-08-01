import { styledEmbed } from '../../core/embeds.js';
import { userIdForChannel } from './ticket.js';
import { getTicketState } from '../../bridge.js';
import { getTicketCommands } from './commands.js';
import { commandRoleIds, memberCanUsePrefixRoles } from '../../core/permissions.js';
import { formatTimestamp } from './transcripts.js';

function tc(key) {
  return getTicketCommands()[key];
}

const CLAIM_INFO_COMMAND = tc('claimInfo') || '?claiminfo';

export default async function handler(message, args, guildId) {
  const userId = userIdForChannel(message.channel.id);
  if (!userId) {
    await message.reply({ embeds: [styledEmbed('Claim Info Not Available', 'this is not a ticket channel.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  if (!await memberCanUsePrefixRoles(message.guild.id, message.author.id, commandRoleIds('claimInfo'))) {
    await message.reply({ embeds: [styledEmbed('Claim Info Not Available', 'you need a staff hierarchy role to use this command.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const state = getTicketState();
  const ticket = state[userId];
  const description = ticket?.claimedByStaffTag
    ? `**claimed by:** ${ticket.claimedByStaffTag}\n**claimed at:** ${formatTimestamp(ticket.claimedAt || Date.now())}\n**priority:** ${ticket.priority || 'normal'}`
    : `this ticket is not claimed.\n\n**priority:** ${ticket?.priority || 'normal'}`;
  await message.reply({ embeds: [styledEmbed('Claim Info', description)], allowedMentions: { repliedUser: false, parse: [] } });
}
