import { styledEmbed } from '../../core/embeds.js';
import { userIdForChannel, recordHistory } from './ticket.js';
import { getTicketState, saveBridgeState } from '../../bridge.js';
import { getTicketCommands } from './commands.js';
import { memberCanUsePrefixRoles, roleIdsFor } from '../../core/permissions.js';

function tc(key) {
  return getTicketCommands()[key];
}

const NOTE_COMMAND = tc('note') || '?note';

export default async function handler(message, args, guildId) {
  const userId = userIdForChannel(message.channel.id);
  if (!userId) {
    await message.reply({ embeds: [styledEmbed('Note Not Added', 'this is not a ticket channel.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const state = getTicketState();
  const ticket = state[userId];
  const text = (args || '').trim();

  if (!text) {
    await message.reply({ embeds: [styledEmbed('Note Not Added', `use **${NOTE_COMMAND} <text>**.`)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  if (!await memberCanUsePrefixRoles(message.guild.id, message.author.id, roleIdsFor(ticket?.departmentId, 'reply'))) {
    await message.reply({ embeds: [styledEmbed('Note Not Added', 'you need a reply role for this ticket.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  recordHistory(userId, { kind: 'STAFF NOTE', authorId: message.author.id, authorTag: message.author.tag, content: text, attachmentUrls: [] });
  await saveBridgeState();
  await message.reply({ embeds: [styledEmbed('Internal Note Added', text)], allowedMentions: { repliedUser: false, parse: [] } });
}
