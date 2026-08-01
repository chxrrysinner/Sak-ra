import { styledEmbed } from '../../core/embeds.js';
import { userIdForChannel } from './ticket.js';
import { handleCancelCloseCommand } from './close.js';
import { getTicketCommands } from './commands.js';

function tc(key) {
  return getTicketCommands()[key];
}

const CANCEL_CLOSE_COMMAND = tc('cancelClose') || '?cancelclose';

export default async function handler(message, args, guildId) {
  const userId = userIdForChannel(message.channel.id);
  if (!userId) {
    await message.reply({ embeds: [styledEmbed('Timer Not Cancelled', 'this is not a ticket channel.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  await handleCancelCloseCommand(message, userId);
}
