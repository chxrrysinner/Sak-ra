import client from '../../core/client.js';
import { styledEmbed } from '../../core/embeds.js';
import { userIdForChannel } from './ticket.js';
import { getTicketState } from '../../bridge.js';
import { getTicketCommands } from './commands.js';
import { commandRoleIds, memberCanUsePrefixRoles, departmentFor } from '../../core/permissions.js';
import { formatTimestamp, formatDuration } from './transcripts.js';

function tc(key) {
  return getTicketCommands()[key];
}

const USER_INFO_COMMAND = tc('userInfo') || '?id';

export default async function handler(message, args, guildId) {
  const userId = userIdForChannel(message.channel.id);
  if (!userId) {
    await message.reply({ embeds: [styledEmbed('User Info Not Available', 'this is not a ticket channel.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  if (!await memberCanUsePrefixRoles(message.guild.id, message.author.id, commandRoleIds('userInfo'))) {
    await message.reply({ embeds: [styledEmbed('User Info Not Available', 'you need a staff hierarchy role to use this command.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const state = getTicketState();
  const ticket = state[userId];
  const user = await client.users.fetch(userId).catch(() => null);
  await message.reply({
    embeds: [styledEmbed('Ticket User Info', [
      `**user:** ${user?.tag || ticket?.userTag || 'unknown'}`,
      `**user id:** \`${userId}\``,
      `**wing:** ${departmentFor(ticket?.departmentId)?.label || ticket?.departmentId}`,
      `**priority:** ${ticket?.priority || 'normal'}`,
      `**ticket opened:** ${formatTimestamp(ticket?.openedAt || Date.now())}`,
      `**account created:** ${user?.createdAt ? formatTimestamp(user.createdAt.getTime()) : 'unknown'}`,
      `**account age:** ${user?.createdAt ? formatDuration(Date.now() - user.createdAt.getTime()) : 'unknown'}`,
      `**claimed by:** ${ticket?.claimedByStaffTag || 'nobody'}`
    ].join('\n'))],
    allowedMentions: { repliedUser: false, parse: [] }
  });
}
