import { styledEmbed } from '../../core/embeds.js';
import { userIdForChannel } from './ticket.js';
import { getTimedCloseState } from '../../bridge.js';
import { getTicketCommands } from './commands.js';
import { commandRoleIds, memberCanUsePrefixRoles } from '../../core/permissions.js';
import { formatDuration } from './transcripts.js';

function tc(key) {
  return getTicketCommands()[key];
}

const TIMER_COMMAND = tc('timer') || '?timer';

export default async function handler(message, args, guildId) {
  const userId = userIdForChannel(message.channel.id);
  if (!userId) {
    await message.reply({ embeds: [styledEmbed('Timer Not Available', 'this is not a ticket channel.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  if (!await memberCanUsePrefixRoles(message.guild.id, message.author.id, commandRoleIds('timer'))) {
    await message.reply({ embeds: [styledEmbed('Timer Not Available', 'you need a staff hierarchy role to use this command.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const tcState = getTimedCloseState();
  const closeAt = Number(tcState[userId]?.closeAt);
  const description = Number.isFinite(closeAt)
    ? `this ticket closes in **${formatDuration(closeAt - Date.now())}**.`
    : 'this ticket does not have an active close timer.';
  await message.reply({ embeds: [styledEmbed('Close Timer', description)], allowedMentions: { repliedUser: false, parse: [] } });
}
