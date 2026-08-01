import { styledEmbed } from '../../core/embeds.js';
import { userIdForChannel, ticketChannelName, recordHistory } from './ticket.js';
import { getTicketState, saveBridgeState } from '../../bridge.js';
import { getTicketCommands } from './commands.js';
import { commandCanRunInTicketBranchForMember, restrictedTicketBranchMessage, modmailPrefixCommandPolicy, memberCanUsePrefixRoles, roleIdsFor } from '../../core/permissions.js';
import { priorityChannelName, syncTicketChannelName } from './shared.js';

function tc(key) {
  return getTicketCommands()[key];
}

const PRIORITY_COMMAND = tc('priority') || '?priority';

export default async function handler(message, args, guildId) {
  const userId = userIdForChannel(message.channel.id);
  if (!userId) {
    await message.reply({ embeds: [styledEmbed('Priority Not Changed', 'this is not a ticket channel.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const state = getTicketState();
  const ticket = state[userId];

  const commandPolicy = modmailPrefixCommandPolicy('priority', message.guild?.id);
  if (!await commandCanRunInTicketBranchForMember(message, commandPolicy, ticket?.departmentId)) {
    await message.reply({ embeds: [styledEmbed('Priority Not Changed', restrictedTicketBranchMessage(commandPolicy, PRIORITY_COMMAND))], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  if (!await memberCanUsePrefixRoles(message.guild.id, message.author.id, roleIdsFor(ticket?.departmentId, 'reply'))) {
    await message.reply({ embeds: [styledEmbed('Priority Not Changed', 'you need a reply role for this ticket.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const validLevels = ['low', 'normal', 'high', 'urgent'];
  const level = (args || '').toLowerCase().trim();

  if (!level) {
    await message.reply({ embeds: [styledEmbed('Ticket Priority', `current priority: **${ticket.priority || 'normal'}**.\n\nvalid levels: **${validLevels.join('**, **')}**.`)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  if (!validLevels.includes(level)) {
    await message.reply({ embeds: [styledEmbed('Priority Not Changed', `valid levels: **${validLevels.join('**, **')}**.`)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  ticket.priority = level;
  await saveBridgeState();
  const fallbackName = ticketChannelName(userId, ticket.userName || 'user', ticket.departmentId);
  const renamed = await syncTicketChannelName(message.channel, priorityChannelName(ticket, fallbackName));
  recordHistory(userId, { kind: 'PRIORITY CHANGED', authorId: message.author.id, authorTag: message.author.tag, content: level, attachmentUrls: [] });
  await saveBridgeState();
  await message.reply({
    embeds: [styledEmbed('Ticket Priority', renamed ? `priority set to **${level}**.` : `priority set to **${level}**. the visible channel rename is queued and will retry automatically.`)],
    allowedMentions: { repliedUser: false, parse: [] }
  });
}
