import client from '../../core/client.js';
import { modmailEmbed, styledEmbed } from '../../core/embeds.js';
import { memberHasPermission } from '../../core/permissions.js';
import { openTicket, userIdForChannel, recordHistory, sendDepartmentPrompt } from './ticket.js';
import { getTicketState, getPendingState, saveBridgeState } from '../../bridge.js';
import { getPrefix } from '../../core/prefix.js';

async function handleTstart(context, targetUser, wing) {
  const isMessage = !!context.author;
  const guildId = isMessage ? context.guild?.id : context.guildId;
  const guild = context.guild || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    await context.reply('Could not find guild.');
    return;
  }

  const member = isMessage ? context.member : (context.member || await guild.members.fetch(context.user.id).catch(() => null));
  if (!member || !memberHasPermission(member, 'tickets.start')) return;

  const department = await import('../../core/permissions.js').then((m) => m.departmentFor(wing, guildId));
  if (!department) {
    await context.reply({ content: 'That ticket wing is not configured.', ephemeral: true });
    return;
  }

  if (!isMessage) {
    await context.deferReply({ ephemeral: true });
  }

  const tickets = getTicketState();
  const pending = getPendingState();
  if (tickets[targetUser.id] || pending[targetUser.id]) {
    const msg = targetUser.tag + ' already has an open or pending ticket.';
    if (isMessage) await context.reply(msg);
    else await context.editReply(msg);
    return;
  }

  const channel = await openTicket(targetUser, department.id, guildId);
  if (!channel) {
    const msg = 'I could not open a ' + department.label + ' ticket for ' + targetUser.tag + '.';
    if (isMessage) await context.reply(msg);
    else await context.editReply(msg);
    return;
  }

  recordHistory(targetUser.id, {
    kind: 'TICKET OPENED BY STAFF',
    authorId: member.id,
    authorTag: member.user.tag,
    content: 'Opened in ' + department.label,
    attachmentUrls: []
  });
  await saveBridgeState();

  await targetUser.send({
    embeds: [modmailEmbed('Ticket Opened', 'A staff member opened a ticket for you with the **' + department.label + '**.\n\nYou can reply here to send messages into the ticket.')],
    allowedMentions: { parse: [] }
  }).catch(() => null);

  await channel.send({
    embeds: [modmailEmbed('Ticket Opened By Staff', 'Opened by **' + member.user.tag + '** for **' + targetUser.tag + '**.')],
    allowedMentions: { parse: [] }
  }).catch(() => null);

  const reply = 'Opened a ' + department.label + ' ticket for ' + targetUser.tag + ': <#' + channel.id + '>';
  if (isMessage) await context.reply(reply);
  else await context.editReply(reply);
}

async function handlePrefixCommand(message, args, guildId) {
  const parts = args.trim().split(/\s+/);
  const userId = parts[0]?.replace(/[<@!>]/g, '');
  const wing = parts[1] || 'assistants';
  if (!userId) {
    await message.reply('Usage: `?tstart <@user> [wing]`');
    return;
  }
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) {
    await message.reply('User not found.');
    return;
  }
  await handleTstart(message, user, wing);
}

async function handleSlashCommand(interaction) {
  const targetUser = interaction.options.getUser('user', true);
  const wing = interaction.options.getString('wing', true);
  await handleTstart(interaction, targetUser, wing);
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
