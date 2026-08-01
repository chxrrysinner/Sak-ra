import { ChannelType } from 'discord.js';
import client from '../../core/client.js';
import { styledEmbed } from '../../core/embeds.js';
import { departmentFor, normalizeDepartmentId, roleIdsFor, teamNameForDepartment, categoryIdFor, categoryEnvLabel, memberCanUseClaimedTicketCommands, memberCanUsePrefixRoles } from '../../core/permissions.js';
import { userIdForChannel, recordHistory, removeTimedClose, ticketChannelName } from './ticket.js';
import { getTicketState, saveBridgeState } from '../../bridge.js';
import { priorityChannelName, queueTicketChannelRename } from './shared.js';

async function transferTicket(channel, transferredBy, targetDepartmentId, options = {}) {
  if (!channel?.id || channel.type !== ChannelType.GuildText) {
    return { ok: false, message: 'This command can only be used inside a modmail channel.' };
  }

  const userId = userIdForChannel(channel.id);
  if (!userId) {
    return { ok: false, message: 'This channel is not an open modmail thread.' };
  }

  const tickets = getTicketState();
  const ticket = tickets[userId];
  const targetDepartment = departmentFor(targetDepartmentId);
  if (!targetDepartment) {
    return { ok: false, message: 'That transfer wing is not configured.' };
  }

  if (!await memberCanUseClaimedTicketCommands(channel.guild.id, transferredBy.id, ticket)) {
    return { ok: false, message: `Claim this ticket with ?claim before using ticket commands.` };
  }

  const currentDepartment = departmentFor(ticket.departmentId);
  const replyRoleIds = roleIdsFor(ticket.departmentId, 'reply');
  if (!replyRoleIds.length) {
    return { ok: false, message: `No reply roles are configured for ${currentDepartment?.label || ticket.departmentId}.` };
  }

  const canTransfer = await memberCanUsePrefixRoles(channel.guild.id, transferredBy.id, replyRoleIds);
  if (!canTransfer) {
    return { ok: false, message: `You need a ${currentDepartment?.label || 'wing'} reply role to transfer this ticket.` };
  }

  const sameDepartment = normalizeDepartmentId(ticket.departmentId) === targetDepartment.id;
  if (sameDepartment && !options.allowSameDepartment) {
    return { ok: false, message: `This ticket is already with the ${teamNameForDepartment(targetDepartment.id)}.` };
  }

  const categoryId = categoryIdFor(targetDepartment.id);
  if (!categoryId) {
    return { ok: false, message: `No category is configured for ${targetDepartment.label}. Add ${categoryEnvLabel(targetDepartment)} to the environment.` };
  }

  const category = await channel.guild.channels.fetch(categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    return { ok: false, message: `I could not find the configured category for ${targetDepartment.label}.` };
  }

  await removeTimedClose(userId);

  const user = await client.users.fetch(userId).catch(() => null);
  const username = user?.username || ticket.userName || 'user';
  let movedChannel = channel;
  const warnings = [];
  const movedToDifferentCategory = channel.parentId !== category.id;

  if (movedToDifferentCategory) {
    movedChannel = await channel.setParent(category.id, { lockPermissions: false }).catch((error) => {
      console.error(`Ticket channel transfer failed for ${channel.id}:`, error);
      return null;
    });
    if (!movedChannel) {
      return { ok: false, message: `I could not move this ticket to ${targetDepartment.label}. Check my **Manage Channels** permission.` };
    }
  }

  ticket.departmentId = targetDepartment.id;
  ticket.userName = username;
  ticket.userTag = user?.tag || ticket.userTag;
  delete ticket.claimedByStaffUserId;
  delete ticket.claimedByStaffTag;
  delete ticket.claimedAt;
  queueTicketChannelRename(movedChannel, priorityChannelName(ticket, ticketChannelName(userId, username, targetDepartment.id)));
  recordHistory(userId, {
    kind: options.historyKind || 'TICKET TRANSFERRED',
    authorId: transferredBy.id,
    authorTag: transferredBy.tag,
    content: options.historyContent || `Transferred to ${targetDepartment.label}`,
    attachmentUrls: []
  });
  await saveBridgeState();

  if (user) {
    await user.send({
      embeds: [styledEmbed(
        options.userEmbedTitle || 'Ticket Transferred',
        options.userMessage || `Your ticket is being transferred to the **${teamNameForDepartment(targetDepartment.id)}**, please wait!`
      )],
      allowedMentions: { parse: [] }
    }).catch(() => null);
  }

  const pingRoleIds = roleIdsFor(targetDepartment.id, 'ping');
  const pingContent = pingRoleIds.map((roleId) => `<@&${roleId}>`).join(' ');

  const staffNoticeSent = await movedChannel.send({
    content: pingContent || undefined,
    embeds: [styledEmbed(
      options.staffEmbedTitle || 'Ticket Transferred',
      options.staffMessage || `Transferred by **${transferredBy.tag}** to the **${teamNameForDepartment(targetDepartment.id)}**.`
    )],
    allowedMentions: { roles: pingRoleIds }
  }).then(() => true).catch((error) => {
    console.error(`Ticket transfer notice failed for ${channel.id}:`, error);
    return false;
  });
  if (!staffNoticeSent) {
    warnings.push('I moved the ticket, but could not post the transfer notice in the destination category. Check the bot channel permissions.');
  }

  if (movedToDifferentCategory) {
    const permissionsSynced = await movedChannel.lockPermissions()
      .then(() => true)
      .catch((error) => {
        console.error(`Ticket permission sync failed for ${channel.id}:`, error);
        return false;
      });
    if (!permissionsSynced) {
      warnings.push('I moved the ticket, but could not sync its category permissions. Check my **Manage Channels** permission.');
    }
  }

  const warningText = warnings.length ? `\n\n${warnings.join('\n')}` : '';
  return { ok: true, message: `Transferred this ticket to the ${teamNameForDepartment(targetDepartment.id)}.${warningText}` };
}

async function handlePrefixCommand(message, args, guildId) {
  const userId = userIdForChannel(message.channel.id);
  if (!userId) {
    await message.reply({ embeds: [modmailEmbed('Transfer Failed', 'This is not a ticket channel.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  const targetWing = (args || '').trim().toLowerCase();
  if (!targetWing) {
    await message.reply({ embeds: [modmailEmbed('Transfer Failed', 'Usage: `?transfer <wing>` — e.g., `?transfer moderation`')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  const targetDept = normalizeDepartmentId(targetWing);
  if (!targetDept) {
    await message.reply({ embeds: [modmailEmbed('Transfer Failed', `Unknown wing: **${targetWing}**. Use one of: assistants, moderation, partnership, hr, internals.`)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  const result = await transferTicket(message.channel, message.author, targetDept, {
    allowSameDepartment: true,
    historyKind: 'TICKET TRANSFERRED',
    historyContent: `Transferred to ${targetDept}`,
    userEmbedTitle: 'Ticket Transferred',
    userMessage: `Your ticket has been transferred to **${teamNameForDepartment(targetDept)}**.`,
    staffEmbedTitle: 'Ticket Transferred',
    staffMessage: `Transferred by **${message.author.tag}** to **${teamNameForDepartment(targetDept)}**.`
  });
  if (!result.ok) {
    await message.reply({ embeds: [modmailEmbed('Transfer Failed', result.message)], allowedMentions: { repliedUser: false, parse: [] } });
  }
}

export { transferTicket, handlePrefixCommand };
export default handlePrefixCommand;
