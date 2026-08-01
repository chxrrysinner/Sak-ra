import { styledEmbed } from '../../core/embeds.js';
import { userIdForChannel } from './ticket.js';
import { getTicketState, saveBridgeState } from '../../bridge.js';
import { getTicketCommands } from './commands.js';
import { memberCanUsePrefixRoles, roleIdsFor } from '../../core/permissions.js';
import { safeChannelLabel, priorityChannelName, syncTicketChannelName } from './shared.js';

function tc(key) {
  return getTicketCommands()[key];
}

const RENAME_COMMAND = tc('rename') || '?rename';

export default async function handler(message, args, guildId) {
  const userId = userIdForChannel(message.channel.id);
  if (!userId) {
    await message.reply({ embeds: [styledEmbed('Rename Failed', 'this is not a ticket channel.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const state = getTicketState();
  const ticket = state[userId];
  const name = (args || '').trim();

  if (!name || !await memberCanUsePrefixRoles(message.guild.id, message.author.id, roleIdsFor(ticket?.departmentId, 'reply'))) {
    await message.reply({ embeds: [styledEmbed('Rename Failed', `use **${RENAME_COMMAND} <name>** with a ticket reply role.`)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const safeName = safeChannelLabel(name);
  if (!safeName) {
    await message.reply({ embeds: [styledEmbed('Rename Failed', 'choose a name containing letters or numbers.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  ticket.customChannelName = safeName;
  await saveBridgeState();
  const renamed = await syncTicketChannelName(message.channel, priorityChannelName(ticket, safeName));
  await message.reply({
    embeds: [styledEmbed(renamed ? 'Ticket Renamed' : 'Ticket Rename Delayed', renamed ? `renamed this ticket to **${safeName}**.` : `saved **${safeName}**. the visible channel rename is queued and will retry automatically.`)],
    allowedMentions: { repliedUser: false, parse: [] }
  });
}
