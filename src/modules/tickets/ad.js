import { styledEmbed, sendPlainTextMessages } from '../../core/embeds.js';
import client from '../../core/client.js';
import config from '../../core/config.js';
import { userIdForChannel, recordHistory } from './ticket.js';
import { getTicketState, saveBridgeState } from '../../bridge.js';
import { getTicketCommands } from './commands.js';
import { commandCanRunInTicketBranchForMember, restrictedTicketBranchMessage, ticketRoleIdsForCommand, modmailPrefixCommandPolicy, memberCanUsePrefixRoles } from '../../core/permissions.js';

function tc(key) {
  return getTicketCommands()[key];
}

const PARTNERSHIP_AD_COMMAND = tc('partnershipAd') || '?ad';

export default async function handler(message, args, guildId) {
  const userId = userIdForChannel(message.channel.id);
  if (!userId) {
    await message.reply({ embeds: [styledEmbed('Ad Not Sent', 'this is not a ticket channel.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const state = getTicketState();
  const ticket = state[userId];
  if (!ticket) {
    await message.reply({ embeds: [styledEmbed('Ad Not Sent', 'this channel is not linked to an open modmail ticket.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const commandPolicy = modmailPrefixCommandPolicy('partnershipAd', message.guild?.id);
  if (!await commandCanRunInTicketBranchForMember(message, commandPolicy, ticket.departmentId)) {
    await message.reply({ embeds: [styledEmbed('Ad Not Sent', restrictedTicketBranchMessage(commandPolicy, PARTNERSHIP_AD_COMMAND))], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const allowedRoleIds = ticketRoleIdsForCommand(commandPolicy, ticket.departmentId);
  if (!allowedRoleIds.length) {
    await message.reply({ embeds: [styledEmbed('Ad Not Sent', 'no partnership reply or close roles are configured.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const canSendAd = await memberCanUsePrefixRoles(message.guild.id, message.author.id, allowedRoleIds);
  if (!canSendAd) {
    await message.reply({ embeds: [styledEmbed('Ad Not Sent', `you need a partnership reply or close role to use **${PARTNERSHIP_AD_COMMAND}**.`)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) {
    await message.reply({ embeds: [styledEmbed('Ad Not Sent', 'i could not find the user for this ticket.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  let adText = '';
  try {
    const { readText } = await import('../../core/config.js');
    adText = await readText(config.paths.partnershipAdFile, 'partnership ad');
  } catch {
    await message.reply({ embeds: [styledEmbed('Ad Not Sent', 'i could not read the partnership ad file.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  if (!adText) {
    await message.reply({ embeds: [styledEmbed('Ad Not Sent', 'the partnership ad file is empty.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  let introText = '';
  try {
    const { readText } = await import('../../core/config.js');
    introText = await readText(config.paths.partnershipAdIntroFile, 'partnership ad intro');
  } catch {}

  const introEmbed = styledEmbed('Staff Reply', introText || '');
  const delivered = await user.send({ embeds: [introEmbed], allowedMentions: { parse: [] } }).then(async () => {
    await sendPlainTextMessages(user, adText, { allowedMentions: { parse: [] } });
    return true;
  }).catch(() => false);

  if (!delivered) {
    await message.reply({ embeds: [styledEmbed('Ad Not Sent', 'i could not dm this user. they may have dms disabled or may have blocked the bot.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }

  recordHistory(userId, { kind: 'STAFF REPLY', authorId: message.author.id, authorTag: message.author.tag, content: `${introText || ''}\n\n${adText}`, attachmentUrls: [] });
  ticket.lastReplyStaffUserId = message.author.id;
  ticket.lastActivityAt = new Date().toISOString();
  await saveBridgeState();

  await message.delete().catch(() => null);
  await message.channel.send({
    embeds: [styledEmbed('Staff Reply', introText || '').setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })],
    allowedMentions: { parse: [] }
  });
  await sendPlainTextMessages(message.channel, adText, { allowedMentions: { parse: [] } });
}
