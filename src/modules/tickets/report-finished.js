import { styledEmbed } from '../../core/embeds.js';
import config from '../../core/config.js';
import { userIdForChannel } from './ticket.js';
import { getTicketState } from '../../bridge.js';
import { getTicketCommands } from './commands.js';
import { commandCanRunInTicketBranchForMember, restrictedTicketBranchMessage, ticketRoleIdsForCommand, modmailPrefixCommandPolicy, memberCanUsePrefixRoles } from '../../core/permissions.js';
import { relayStaffReply } from './reply.js';

function tc(key) {
  return getTicketCommands()[key];
}

const REPORT_FINISHED_COMMAND = tc('reportFinished') || '?repfin';

export default async function handler(message, args, guildId) {
  const userId = userIdForChannel(message.channel.id);
  if (!userId) {
    await message.reply({ embeds: [styledEmbed('Reply Not Sent', 'this is not a ticket channel.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const state = getTicketState();
  const ticket = state[userId];
  if (!ticket) {
    await message.reply({ embeds: [styledEmbed('Reply Not Sent', 'this channel is not linked to an open modmail ticket.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const commandPolicy = modmailPrefixCommandPolicy('reportFinished', message.guild?.id);
  if (!await commandCanRunInTicketBranchForMember(message, commandPolicy, ticket.departmentId)) {
    await message.reply({ embeds: [styledEmbed('Reply Not Sent', restrictedTicketBranchMessage(commandPolicy, REPORT_FINISHED_COMMAND))], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const replyRoleIds = ticketRoleIdsForCommand(commandPolicy, ticket.departmentId);
  if (!replyRoleIds.length) {
    await message.reply({ embeds: [styledEmbed('Reply Not Sent', 'no moderation reply roles are configured.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const canReply = await memberCanUsePrefixRoles(message.guild.id, message.author.id, replyRoleIds);
  if (!canReply) {
    await message.reply({ embeds: [styledEmbed('Reply Not Sent', `you need a moderation reply role to use **${REPORT_FINISHED_COMMAND}**.`)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  let reportMsg = 'Your report has been reviewed and appropriate action has been taken.';
  try {
    const { readText } = await import('../../core/config.js');
    reportMsg = await readText(config.paths.reportFinishedMessageFile, 'report-finished-message');
  } catch {}

  await relayStaffReply(message, userId, reportMsg);
}
