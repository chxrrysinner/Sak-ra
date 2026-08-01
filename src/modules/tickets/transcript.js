import { AttachmentBuilder } from 'discord.js';
import { styledEmbed } from '../../core/embeds.js';
import { userIdForChannel } from './ticket.js';
import { getTicketState } from '../../bridge.js';
import { getTicketCommands } from './commands.js';
import { memberCanUsePrefixRoles, roleIdsFor } from '../../core/permissions.js';
import { generateTranscriptBuffer } from './transcripts.js';

function tc(key) {
  return getTicketCommands()[key];
}

const TRANSCRIPT_COMMAND = tc('transcript') || '?transcript';

export default async function handler(message, args, guildId) {
  const userId = userIdForChannel(message.channel.id);
  if (!userId) {
    await message.reply({ embeds: [styledEmbed('Transcript Not Available', 'this is not a ticket channel.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const state = getTicketState();
  const ticket = state[userId];

  if (!await memberCanUsePrefixRoles(message.guild.id, message.author.id, roleIdsFor(ticket?.departmentId, 'reply'))) {
    await message.reply({ embeds: [styledEmbed('Transcript Not Available', 'you need a reply role for this ticket.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const filename = `modmail-preview-${userId}-${Date.now()}.txt`;
  const file = new AttachmentBuilder(generateTranscriptBuffer({ userId, ticket, closedByTag: message.author.tag, reason: 'Transcript preview' }), { name: filename });
  await message.reply({ embeds: [styledEmbed('Transcript Preview', 'this preview does not close the ticket.')], files: [file], allowedMentions: { repliedUser: false, parse: [] } });
}
