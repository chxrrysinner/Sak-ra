import { styledEmbed, modmailEmbed } from '../../core/embeds.js';
import { userIdForChannel } from './ticket.js';
import { handleUnclaimCommand } from './claim.js';

export default async function handler(message, args, guildId) {
  const userId = userIdForChannel(message.channel.id);
  if (!userId) {
    await message.reply({ embeds: [modmailEmbed('Unclaim Failed', 'This is not a ticket channel.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  await handleUnclaimCommand(message, userId);
}
