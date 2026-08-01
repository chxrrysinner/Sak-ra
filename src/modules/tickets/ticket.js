import { ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import client from '../../core/client.js';
import { styledEmbed, modmailEmbed, trimTo, attachmentDataFromMessage } from '../../core/embeds.js';
import { departmentFor, roleIdsFor, memberCanUseClaimedTicketCommands, memberCanUsePrefixRoles, categoryIdFor, WING_ORDER } from '../../core/permissions.js';
import { findGuild, getTicketState, getPendingState, getTimedCloseState, getTimedCloseTimeouts, saveBridgeState } from '../../bridge.js';
import config from '../../core/config.js';
import logger from '../../core/logger.js';

function ticketChannelName(userId, username, departmentId) {
  const department = departmentFor(departmentId);
  const safeName = username
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 18) || 'user';
  return `${department?.channelPrefix || 'ticket'}-${safeName}-${userId.slice(-4)}`;
}

function ticketTitle(user, departmentId) {
  return ticketChannelName(user.id, user.username, departmentId);
}

async function activeChannelFor(userId, guildId = null) {
  const tickets = getTicketState();
  const ticket = tickets[userId];
  if (!ticket?.channelId) return null;

  try {
    const channel = await client.channels.fetch(ticket.channelId);
    if (guildId && channel?.guildId !== guildId) return null;
    if (channel?.type === ChannelType.GuildText) return channel;
  } catch {
    const timedCloseState = getTimedCloseState();
    delete timedCloseState[userId];
    delete tickets[userId];
    await saveBridgeState();
  }

  return null;
}

function userIdForChannel(channelId) {
  const tickets = getTicketState();
  return Object.entries(tickets)
    .find(([, ticket]) => ticket.channelId === channelId)?.[0] || null;
}

function recordHistory(userId, entry) {
  const tickets = getTicketState();
  const ticket = tickets[userId];
  if (!ticket) return;

  ticket.history ||= [];
  ticket.history.push({
    timestamp: Date.now(),
    ...entry
  });
  ticket.history = ticket.history.slice(-500);
  ticket.lastActivityAt = new Date().toISOString();
}

async function openTicket(user, departmentId, guildId = null) {
  const tickets = getTicketState();
  const existingChannel = await activeChannelFor(user.id, guildId);
  if (existingChannel) return existingChannel;

  // Double-check in-memory state for race conditions
  if (tickets[user.id]) {
    const chan = await client.channels.fetch(tickets[user.id].channelId).catch(() => null);
    if (chan) return chan;
  }

  const department = departmentFor(departmentId, guildId);
  if (!department) return null;

  let guild;
  try {
    guild = await findGuild({ guildId, userId: user.id, departmentId: department.id });
  } catch {
    return null;
  }

  const categoryId = categoryIdFor(department.id, guildId);
  const category = categoryId ? await guild.channels.fetch(categoryId).catch(() => null) : null;
  if (categoryId && !category) {
    try { await user.send({ embeds: [modmailEmbed('Ticket Not Opened', `The ${department.label} category is not configured for this server.`)], allowedMentions: { parse: [] } }); } catch {}
    return null;
  }

  const channel = await guild.channels.create({
    name: ticketTitle(user, department.id),
    type: ChannelType.GuildText,
    parent: category?.id,
    topic: `ModMail ${department.label} ticket with ${user.tag} (${user.id})`
  });

  if (category) {
    await channel.lockPermissions().catch(() => null);
  }

  tickets[user.id] = {
    channelId: channel.id,
    guildId: guild.id,
    departmentId: department.id,
    userTag: user.tag,
    userName: user.username,
    openedAt: Date.now(),
    lastActivityAt: new Date().toISOString(),
    priority: 'normal',
    history: []
  };
  await saveBridgeState();

  // Verify our channel is the one in state (race condition safety net)
  const savedEntry = getTicketState()?.[user.id];
  if (savedEntry && savedEntry.channelId !== channel.id) {
    console.log(`Duplicate ticket race for ${user.id}: our channel ${channel.id} was replaced by ${savedEntry.channelId}, deleting silently`);
    await channel.delete('Duplicate ticket — silently closed').catch(() => null);
    const olderChan = await client.channels.fetch(savedEntry.channelId).catch(() => null);
    return olderChan;
  }

  const intro = [
    `**Wing:** ${department.label}`,
    `**User:** ${user.tag}`,
    `**Username:** ${user.username}`,
    `**User ID:** ${user.id}`,
    '',
    'Discuss freely in this channel. Messages are not sent to the user unless they start with **?r**.',
    'Use **?r <response>** to reply to the user.',
    'Use **/close** when the conversation is finished.'
  ].join('\n');
  const pingRoleIds = roleIdsFor(department.id, 'ping');
  const pingContent = pingRoleIds.map((roleId) => `<@&${roleId}>`).join(' ');

  await channel.send({
    content: pingContent || undefined,
    embeds: [
      modmailEmbed('New ModMail Thread', intro)
        .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
        .setThumbnail(user.displayAvatarURL())
    ],
    allowedMentions: { roles: pingRoleIds }
  });

  return channel;
}

async function sendDepartmentPrompt(message) {
  const existing = await activeChannelFor(message.author.id);
  const pending = getPendingState();
  if (existing || pending[message.author.id]) {
    await message.author.send({
      embeds: [modmailEmbed('Ticket Already Open', 'You already have an open or pending ticket.')],
      allowedMentions: { parse: [] }
    }).catch(() => null);
    return;
  }

  const guild = await findGuild({ userId: message.author.id }).catch((error) => {
    logger.warn({ userId: message.author.id, error: error.message }, 'Could not resolve guild for DM');
    return null;
  });
  if (!guild) {
    await message.author.send({
      embeds: [modmailEmbed('Server Not Selected', 'I could not determine which server this ticket is for.')],
      allowedMentions: { parse: [] }
    }).catch(() => null);
    return;
  }

  pending[message.author.id] = {
    content: message.content || '',
    attachments: attachmentDataFromMessage(message),
    messageId: message.id,
    channelId: message.channel.id,
    guildId: guild.id,
    createdAt: Date.now()
  };
  await saveBridgeState();

  await message.author.send({
    embeds: [modmailEmbed('Choose a Wing', 'Please select where this message should go.\n\nYour message will be sent to staff after you choose a wing.')],
    components: [departmentRow()],
    allowedMentions: { parse: [] }
  });
}

async function sendButtonDepartmentPrompt(user, guildId = null) {
  const existing = await activeChannelFor(user.id, guildId);
  const pending = getPendingState();
  if (existing || pending[user.id]) {
    await user.send({
      embeds: [modmailEmbed('Ticket Already Open', 'You already have an open or pending ticket.')],
      allowedMentions: { parse: [] }
    });
    return;
  }

  pending[user.id] = {
    content: '',
    attachments: [],
    source: 'support_button',
    guildId,
    createdAt: Date.now()
  };
  await saveBridgeState();

  await user.send({
    embeds: [modmailEmbed('Choose a Wing', 'Please select where this ticket should go.\n\nYour ticket will be opened after you choose a wing.')],
    components: [departmentRow()],
    allowedMentions: { parse: [] }
  });
}

async function ensureSupportPanel() {
  const SUPPORT_PANEL_CHANNEL_ID = config.supportPanel.channelId;
  if (!SUPPORT_PANEL_CHANNEL_ID) return;

  const channel = await client.channels.fetch(SUPPORT_PANEL_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) return;

  const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  if (!messages) return;

  const hasPanel = messages.some((msg) =>
    msg.author.id === client.user.id
    && msg.components.length
    && msg.components.some((row) =>
      row.components.some((comp) => comp.customId === config.supportPanel.buttonId)
    )
  );

  if (hasPanel) return;

  await channel.send({
    content: config.supportPanel.content,
    components: [supportPanelRow()]
  }).catch((error) => {
    logger.error({ error: error.message }, 'Failed to send support panel');
  });
}

function departmentRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('modmail_department')
    .setPlaceholder('Select a wing...')
    .addOptions(
      WING_ORDER.map((value) => {
        const department = departmentFor(value);
        return new StringSelectMenuOptionBuilder()
          .setLabel(department.label)
          .setDescription(department.description)
          .setValue(value);
      })
    );
  return new ActionRowBuilder().addComponents(menu);
}

function supportPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(config.supportPanel.buttonId)
      .setLabel('open a ticket!')
      .setStyle(ButtonStyle.Primary)
  );
}

async function closeTicket(channel, closedBy, reason = 'Resolved', options = {}) {
  if (!channel?.id) {
    return { ok: false, message: 'This command can only be used inside a modmail channel.' };
  }

  const userId = userIdForChannel(channel.id);
  if (!userId) {
    return { ok: false, message: 'This channel is not an open modmail thread.' };
  }

  const tickets = getTicketState();
  const ticket = tickets[userId];
  if (!options.skipPermissionCheck) {
    if (!await memberCanUseClaimedTicketCommands(channel.guild.id, closedBy.id, ticket)) {
      const { getPrefix } = await import('../../core/prefix.js');
      const prefix = getPrefix(channel.guild.id);
      return { ok: false, message: `Claim this ticket with ${prefix}claim before using ticket commands.` };
    }

    const closeRoleIds = roleIdsFor(ticket.departmentId, 'close');
    if (!closeRoleIds.length) {
      return { ok: false, message: `No close roles are configured for this wing.` };
    }

    const canClose = await memberCanUsePrefixRoles(channel.guild.id, closedBy.id, closeRoleIds);
    if (!canClose) {
      const department = departmentFor(ticket.departmentId);
      return { ok: false, message: `You need a ${department?.label || 'wing'} close role to close this ticket.` };
    }
  }

  const user = await client.users.fetch(userId).catch(() => null);
  await removeTimedClose(userId);

  recordHistory(userId, {
    kind: 'TICKET CLOSED',
    authorId: closedBy.id,
    authorTag: closedBy.tag,
    content: reason,
    attachmentUrls: []
  });
  await saveBridgeState();

  const { sendTranscript } = await import('./transcripts.js');
  await sendTranscript(channel, userId, ticket, closedBy, reason);

  delete tickets[userId];
  await saveBridgeState();

  if (user) {
    await user.send({
      embeds: [modmailEmbed('Ticket Closed', `Thank you for opening a ticket.\nYour ticket has now been closed.\n\n**Reason:** ${trimTo(reason, 800)}`)],
      allowedMentions: { parse: [] }
    }).catch(() => null);
  }

  await channel.send({
    embeds: [modmailEmbed('Thread Closed', `Closed by **${closedBy.tag}**.\n\n**Reason:** ${trimTo(reason, 800)}`)],
    allowedMentions: { parse: [] }
  }).catch(() => null);

  if (config.TRANSCRIPT_CHANNEL_ID) {
    setTimeout(() => {
      channel.delete(`ModMail closed by ${closedBy.tag}: ${reason}`).catch(() => null);
    }, 5000);
  }

  return { ok: true, message: 'Closed this modmail thread.' };
}

async function removeTimedClose(userId) {
  const tcState = getTimedCloseState();
  const timeouts = getTimedCloseTimeouts();
  const timeout = timeouts.get(userId);
  if (timeout) {
    clearTimeout(timeout);
    timeouts.delete(userId);
  }
  if (tcState[userId]) {
    delete tcState[userId];
    if (typeof globalThis.__HALLOWS_SAVE_TIMED_CLOSE_STATE__ === 'function') {
      await globalThis.__HALLOWS_SAVE_TIMED_CLOSE_STATE__();
    }
  }
}

async function handleDepartmentSelect(interaction) {
  try {
    await interaction.deferUpdate();
    const departmentId = interaction.values?.[0];
    if (!departmentId) return;

    const department = departmentFor(departmentId, interaction.guildId);
    const pending = getPendingState();
    const userPending = pending[interaction.user.id];

    if (!department) {
      await interaction.message.edit({
        embeds: [modmailEmbed('Unknown Wing', 'Please send your message again, then select a wing.')],
        components: []
      });
      return;
    }

    if (!userPending) {
      await interaction.message.edit({
        embeds: [modmailEmbed('No Pending Message', 'Please send your message again, then select a wing.')],
        components: []
      });
      return;
    }

    const channel = await openTicket(interaction.user, department.id, userPending.guildId || interaction.guildId);
    if (!channel) {
      await interaction.message.edit({
        embeds: [modmailEmbed('Ticket Not Opened', 'I could not open a ticket for this server.')],
        components: []
      });
      return;
    }

    // Relay the pending message to the ticket channel
    if (userPending.source !== 'support_button' && userPending.content) {
      const { relayStaffReply } = await import('./reply.js');
      // Send the user's original message as a relay
      await channel.send({
        content: userPending.content,
        allowedMentions: { parse: [] }
      }).catch(() => null);
    }

    // Clean up pending state
    delete pending[interaction.user.id];
    await saveBridgeState();

    await interaction.message.edit({
      embeds: [
        modmailEmbed('Wing Selected', 'Your ticket has been transferred to the **' + department.label + '**.\n\nPlease wait patiently for a reply. If you would like to tell us in advance what help you need, we appreciate that as it helps ticket handling go by much faster!')
      ],
      components: []
    });
  } catch (error) {
    console.error('handleDepartmentSelect error:', error);
    try {
      await interaction.message.edit({
        embeds: [modmailEmbed('Error', 'Something went wrong. Please try again.')],
        components: []
      });
    } catch { }
  }
}

async function handleDashboardButton(interaction) {
  if (interaction.customId !== config.supportPanel.buttonId) return;
  const existing = await activeChannelFor(interaction.user.id, interaction.guildId);
  const pending = getPendingState();
  if (existing || pending[interaction.user.id]) {
    await interaction.reply({
      content: 'you already have an open or pending ticket. please continue in your dms.',
      ephemeral: true
    });
    return;
  }

  const sent = await sendButtonDepartmentPrompt(interaction.user, interaction.guildId)
    .then(() => true).catch(() => false);

  if (!sent) {
    await interaction.reply({
      content: 'i could not dm you. please enable dms from this server, then try again.',
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: 'i sent you a dm to choose your ticket wing.',
    ephemeral: true
  });
}

export {
  ticketChannelName,
  ticketTitle,
  activeChannelFor,
  userIdForChannel,
  recordHistory,
  openTicket,
  closeTicket,
  sendDepartmentPrompt,
  sendButtonDepartmentPrompt,
  ensureSupportPanel,
  departmentRow,
  supportPanelRow,
  removeTimedClose,
  handleDepartmentSelect,
  handleDashboardButton
};
export { handleDepartmentSelect as handleComponentInteraction };
