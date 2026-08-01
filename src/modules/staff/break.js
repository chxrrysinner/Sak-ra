import client from '../../core/client.js';
import { breakRequestModal, breakRequestEmbed, breakDecisionRow, parseBreakDuration, formatBreakDuration, scheduleStaffBreakEnd } from './shared.js';
import { staffRoleHierarchyIds, categoryRoleIds, leadCategoryRoleId, memberHasPermission, commandRoleIds } from '../../core/permissions.js';
import stateManager from '../../core/state.js';
import { styledEmbed } from '../../core/embeds.js';
import config from '../../core/config.js';

export default async function handlePrefixCommand(message, args, guildId) {
  try {
    const brState = globalThis.__HALLOWS_BREAK_STATE__ || {};
    if (brState.activeByUserId?.[message.author?.id]) {
      await message.reply('you already have an active staff break.');
      return;
    }
    if (brState.requestsByUserId?.[message.author?.id]) {
      await message.reply('you already have a pending staff break request.');
      return;
    }

    const parts = args.trim().split(/\s+/);
    const durationStr = parts[0] || '';
    const reason = parts.slice(1).join(' ') || '';

    if (!durationStr || !reason) {
      await message.reply('usage: `?break <duration> <reason>`\nexample: `?break 2h need to run errands`\ndurations: 30m, 2h, 1d, 1w');
      return;
    }

    const durationMs = parseBreakDuration(durationStr);
    if (!durationMs) {
      await message.reply('invalid duration. use format like `30m`, `2h`, `1d`, `1w`.');
      return;
    }

    const breakChanId = (guildId ? await stateManager.getGuildSetting(guildId, 'BREAK_REQUEST_CHANNEL_ID') : null) || config.breaks.requestChannelId;
    if (!breakChanId) {
      await message.reply('break request channel is not configured.');
      return;
    }

    const request = {
      userId: message.author.id,
      guildId,
      durationText: durationStr,
      durationMs,
      reason,
      createdAt: Date.now()
    };

    const chan = await message.guild.channels.fetch(breakChanId).catch(() => null);
    if (!chan?.isTextBased()) {
      await message.reply('break request channel is not available.');
      return;
    }

    const requestMessage = await chan.send({
      embeds: [breakRequestEmbed(request)],
      components: [breakDecisionRow(request.userId)],
      allowedMentions: { users: [request.userId] }
    });

    request.channelId = chan.id;
    request.messageId = requestMessage.id;
    brState.requestsByUserId = brState.requestsByUserId || {};
    brState.requestsByUserId[message.author.id] = request;
    if (typeof globalThis.__HALLOWS_SAVE_BREAK_STATE__ === 'function') {
      await globalThis.__HALLOWS_SAVE_BREAK_STATE__();
    }

    await message.reply('break request submitted for **' + durationStr + '**. wait for approval.');
  } catch (error) {
    console.error('?break error:', error?.message || error);
    await message.channel.send('nuuu').catch(() => null);
  }
}

export async function handleSlashCommand(interaction) {
  try {
    if (!interaction?.guildId) {
      await interaction.reply({ content: 'nuuu', ephemeral: true });
      return;
    }

    const brState = globalThis.__HALLOWS_BREAK_STATE__ || {};
    if (brState.activeByUserId?.[interaction.user?.id]) {
      await interaction.reply({ content: 'you already have an active staff break.', ephemeral: true });
      return;
    }

    if (brState.requestsByUserId?.[interaction.user?.id]) {
      await interaction.reply({ content: 'you already have a pending staff break request.', ephemeral: true });
      return;
    }

    await interaction.showModal(breakRequestModal());
  } catch (error) {
    console.error('/break modal error:', error?.message || error);
    try { await interaction.reply({ content: 'nuuu', ephemeral: true }); } catch {}
  }
}

export async function handleDashboardModal(interaction) {
  try {
    if (interaction.customId !== 'staff_break_request_modal') return;

    const brState = globalThis.__HALLOWS_BREAK_STATE__ || {};
    if (brState.activeByUserId?.[interaction.user.id] || brState.requestsByUserId?.[interaction.user.id]) {
      await interaction.reply({ content: 'you already have a break or pending request.', ephemeral: true });
      return;
    }

    const breakChanId = (await stateManager.getGuildSetting(interaction.guildId, 'BREAK_REQUEST_CHANNEL_ID')) || config.breaks.requestChannelId;
    if (!breakChanId) {
      await interaction.reply({ content: 'break request channel is not configured.', ephemeral: true });
      return;
    }

    const channel = await client.channels.fetch(breakChanId).catch(() => null);
    if (!channel?.isTextBased()) {
      await interaction.reply({ content: 'break request channel is not available.', ephemeral: true });
      return;
    }

    const durationText = interaction.fields.getTextInputValue('duration').trim();
    const request = {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      durationText,
      durationMs: parseBreakDuration(durationText),
      reason: interaction.fields.getTextInputValue('reason').trim(),
      createdAt: Date.now()
    };

    const requestMessage = await channel.send({
      embeds: [breakRequestEmbed(request)],
      components: request.durationMs ? [breakDecisionRow(request.userId)] : [],
      allowedMentions: { users: [request.userId] }
    });

    request.channelId = channel.id;
    request.messageId = requestMessage.id;
    brState.requestsByUserId = brState.requestsByUserId || {};
    brState.requestsByUserId[request.userId] = request;
    if (typeof globalThis.__HALLOWS_SAVE_BREAK_STATE__ === 'function') {
      await globalThis.__HALLOWS_SAVE_BREAK_STATE__();
    }

    await interaction.reply({
      content: request.durationMs
        ? 'your staff break request has been submitted.'
        : 'your staff break request has been submitted and needs a manager to clarify its length.',
      ephemeral: true
    });
  } catch (error) {
    console.error('break modal submit error:', error?.message || error);
    try { await interaction.reply({ content: 'nuuu', ephemeral: true }); } catch {}
  }
}

async function handleDashboardButton(interaction) {
  const { customId, guildId, guild } = interaction;
  const userId = customId.split(':')[1];
  if (!userId) return;

  const brState = globalThis.__HALLOWS_BREAK_STATE__ || {};
  const request = brState.requestsByUserId?.[userId];

  async function canManageBreaks() {
    if (interaction.user.id === config.ownerId) return true;
    if (interaction.member && memberHasPermission(interaction.member, 'staff.breaks.manage')) return true;
    const mbr = interaction.member || await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
    if (!mbr) return false;
    const manageRoleIds = commandRoleIds('manageBreaks');
    if (manageRoleIds.length === 0) return false;
    return mbr.roles.cache.some(r => manageRoleIds.includes(r.id));
  }

  if (customId.startsWith('staff_break_approve')) {
    if (!await canManageBreaks()) return;
    if (!request || request.messageId !== interaction.message.id || !request.durationMs) {
      await interaction.reply({ content: 'this break request is no longer pending.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const requester = await client.users.fetch(userId).catch(() => null);

    const guildFetch = request.guildId ? await client.guilds.fetch(request.guildId).catch(() => guild) : guild;
    const member = guildFetch ? await guildFetch.members.fetch(userId).catch(() => null) : null;
    if (!member) {
      await interaction.editReply('i could not find that staff member in the server.');
      return;
    }

    const hierarchyIds = staffRoleHierarchyIds();
    const catIds = categoryRoleIds();
    const leadCatId = leadCategoryRoleId();
    const allStaffIds = [...new Set([...hierarchyIds, ...catIds, ...(leadCatId ? [leadCatId] : [])])];
    const staffRoles = member.roles.cache.filter((r) => allStaffIds.includes(r.id));
    const removedRoleIds = [...staffRoles.keys()];

    if (!removedRoleIds.length) {
      await interaction.editReply('that member no longer has a configured staff hierarchy role.');
      return;
    }

    await member.roles.remove(removedRoleIds, `staff break approved by ${interaction.user.tag}`);
    const onBreakRoleId = process.env.ON_BREAK_ROLE_ID || config.breaks.onBreakRoleId;
    if (onBreakRoleId) {
      await member.roles.add(onBreakRoleId, `staff break approved by ${interaction.user.tag}`).catch(() => null);
    }

    const endsAt = Date.now() + request.durationMs;
    brState.activeByUserId = brState.activeByUserId || {};
    brState.activeByUserId[userId] = {
      guildId: request.guildId,
      approvedByUserId: interaction.user.id,
      reason: request.reason,
      durationMs: request.durationMs,
      startedAt: Date.now(),
      endsAt,
      removedRoleIds,
      messageCount: 0
    };
    delete brState.requestsByUserId[userId];
    if (typeof globalThis.__HALLOWS_SAVE_BREAK_STATE__ === 'function') {
      await globalThis.__HALLOWS_SAVE_BREAK_STATE__();
    }
    scheduleStaffBreakEnd(userId);

    await interaction.message.edit({
      embeds: [breakRequestEmbed(request, `Approved by <@${interaction.user.id}> until <t:${Math.floor(endsAt / 1000)}:F>`)],
      components: []
    });

    await requester?.send({
      embeds: [
        styledEmbed(
          'Staff Break Approved',
          `your staff break has been approved.\n**Length:** ${formatBreakDuration(request.durationMs)}\n**Ends:** <t:${Math.floor(endsAt / 1000)}:F>`
        )
      ],
      allowedMentions: { parse: [] }
    }).catch(() => null);

    await interaction.editReply('approved this staff break request.');
    return;
  }

  if (customId.startsWith('staff_break_deny')) {
    if (!await canManageBreaks()) return;
    if (!request || request.messageId !== interaction.message.id) {
      await interaction.reply({ content: 'this break request is no longer pending.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const requester = await client.users.fetch(userId).catch(() => null);

    delete brState.requestsByUserId[userId];
    if (typeof globalThis.__HALLOWS_SAVE_BREAK_STATE__ === 'function') {
      await globalThis.__HALLOWS_SAVE_BREAK_STATE__();
    }

    await interaction.message.edit({
      embeds: [breakRequestEmbed(request, `Denied by <@${interaction.user.id}>`)],
      components: []
    });

    await requester?.send({
      embeds: [styledEmbed('Staff Break Denied', 'your staff break request has been denied.')],
      allowedMentions: { parse: [] }
    }).catch(() => null);

    await interaction.editReply('denied this staff break request.');
    return;
  }
}

export { handleDashboardButton };
