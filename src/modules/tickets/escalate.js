import { styledEmbed, modmailEmbed } from '../../core/embeds.js';
import { userIdForChannel } from './ticket.js';
import { getPrefix } from '../../core/prefix.js';
import { transferTicket } from './transfer.js';

export default async function handler(message, args, guildId) {
  const userId = userIdForChannel(message.channel.id);
  if (!userId) {
    await message.reply({ embeds: [modmailEmbed('Escalation Failed', 'This is not a ticket channel.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const result = await transferTicket(message.channel, message.author, 'internals', {
    allowSameDepartment: true,
    historyKind: 'TICKET ESCALATED',
    historyContent: 'Escalated to Internals',
    userEmbedTitle: 'Ticket Escalated',
    userMessage: 'Your ticket is being escalated to Internals.',
    staffEmbedTitle: 'Ticket Escalated',
    staffMessage: `Escalated by **${message.author.tag}** to **Internals**.`
  });

  if (!result.ok) {
    await message.reply({ embeds: [modmailEmbed('Escalation Failed', result.message)], allowedMentions: { repliedUser: false, parse: [] } });
  }
}
