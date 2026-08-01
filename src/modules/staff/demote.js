import stateManager from '../../core/state.js';
import { findGuild } from '../../bridge.js';
import client from '../../core/client.js';
import { styledEmbed, trimTo } from '../../core/embeds.js';
import {
  normalizeStaffWingId, staffWingNameFor, numberedHierarchyPartsForWing,
  memberHierarchyPartsForWing, memberLeadHierarchyPartForWing,
  memberNumberedHierarchyPartForWing, nonAssistantStaffWingIds,
  syncCategoryRoleForWing, syncLeadCategoryRole, memberCanRunDemote,
  demoteExemptRoleIds, inferredStaffWingId,
  leadHierarchyPartForWing, removeCategoryRoleForWing, staffRoleHierarchyIds,
  memberHasAnyCachedRole, memberHasAnyRole, demoteCommandRoleIds
} from '../../core/permissions.js';

const ROLE_POLICY_FILE = process.env.ROLE_POLICY_FILE || './role-policy.json';

async function demoteUser(author, targetUser, reason, wingOpt, guild) {
  const guildMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!guildMember) {
    return { ok: false, message: 'I could not find that user in this server.' };
  }

  if (demoteExemptRoleIds().some((roleId) => guildMember.roles.cache.has(roleId))) {
    return { ok: false, message: `${targetUser.username} has a demotion-exempt role.` };
  }

  const inferredWing = wingOpt
    ? { wingId: normalizeStaffWingId(wingOpt), ambiguous: false }
    : inferredStaffWingId(guildMember);
  if (inferredWing.ambiguous) {
    return { ok: false, message: `${targetUser.username} has roles in multiple staff wings. Use the optional wing field to choose which wing to demote from.` };
  }

  const wingId = inferredWing.wingId;
  const wingName = staffWingNameFor(wingId);
  if (!wingId) {
    return { ok: false, message: `${targetUser.username} does not have a configured staff role.` };
  }

  const numberedParts = numberedHierarchyPartsForWing(wingId);
  const leadPart = leadHierarchyPartForWing(wingId);
  if (!numberedParts.length) {
    return { ok: false, message: `The demote command is missing numbered staffHierarchy roles for ${wingName} in ${ROLE_POLICY_FILE}.` };
  }

  const currentLeadPart = memberLeadHierarchyPartForWing(guildMember, wingId);
  const currentNumberedPart = memberNumberedHierarchyPartForWing(guildMember, wingId);
  const currentPart = currentLeadPart || currentNumberedPart;

  if (!currentPart) {
    return { ok: false, message: `${targetUser.username} does not have a configured staff role in the ${wingName} wing.` };
  }

  const currentRoleId = currentPart.roleId;
  const currentRole = await guild.roles.fetch(currentRoleId).catch(() => null);
  if (!currentRole) {
    return { ok: false, message: `I could not find the current staff role \`${currentRoleId}\`.` };
  }

  const targetPart = currentLeadPart
    ? numberedParts[numberedParts.length - 1]
    : [...numberedParts].reverse().find((entry) => (entry.level || 0) < (currentNumberedPart.level || 0));

  if (!targetPart) {
    const assistantRankOnePart = wingId === 'assistants'
      ? null
      : numberedHierarchyPartsForWing('assistants').find((entry) => entry.level === 1);
    if (assistantRankOnePart) {
      const assistantRole = await guild.roles.fetch(assistantRankOnePart.roleId).catch(() => null);
      if (!assistantRole) {
        return { ok: false, message: `I could not find the Assistant rank 1 role \`${assistantRankOnePart.roleId}\`.` };
      }

      const auditReason = `Demoted from ${wingName} to Assistants by ${author.tag}: ${reason}`;
      const currentWingRoleIds = memberHierarchyPartsForWing(guildMember, wingId).map((entry) => entry.roleId);
      const assistantRoleIdsToRemove = memberHierarchyPartsForWing(guildMember, 'assistants')
        .map((entry) => entry.roleId)
        .filter((roleId) => roleId !== assistantRankOnePart.roleId);
      await guildMember.roles.add(assistantRole, auditReason);
      await guildMember.roles.remove([...new Set([
        ...currentWingRoleIds,
        ...assistantRoleIdsToRemove
      ])].filter((roleId) => roleId !== assistantRankOnePart.roleId), auditReason);
      await syncCategoryRoleForWing(guildMember, 'assistants', auditReason);
      await syncLeadCategoryRole(guildMember, auditReason);
      await targetUser.send({
        content: [
          `You have been demoted to ${assistantRole.name} in the Assistants wing.`,
          '',
          `**Reason:** ${reason}`,
          '',
          'To review more specific details, please open a ticket in modmail under the "Internals" section.'
        ].join('\n'),
        allowedMentions: { parse: [] }
      }).catch(() => null);

      return { ok: true, message: `${targetUser.username} has been demoted to the Assistants wing.` };
    }

    const auditReason = `Removed from ${wingName} by ${author.tag}: ${reason}`;
    await guildMember.roles.remove(currentRole, auditReason);
    await removeCategoryRoleForWing(guildMember, wingId, auditReason);
    await syncLeadCategoryRole(guildMember, auditReason);
    const removalMessage = wingId === 'assistants'
      ? 'You have been removed from staff.'
      : `You have been removed from the ${wingName} wing.`;
    await targetUser.send({
      content: [
        removalMessage,
        '',
        `**Reason:** ${reason}`,
        '',
        'To review more specific details, please open a ticket in modmail under the "Internals" section.'
      ].join('\n'),
      allowedMentions: { parse: [] }
    }).catch(() => null);

    return { ok: true, message: wingId === 'assistants'
      ? `${targetUser.username} has been removed from staff.`
      : `${targetUser.username} has been removed from the ${wingName} wing.` };
  }

  const nextRoleId = targetPart.roleId;
  const nextRole = await guild.roles.fetch(nextRoleId).catch(() => null);
  if (!nextRole) {
    return { ok: false, message: `I could not find the demotion target role \`${nextRoleId}\`.` };
  }

  const auditReason = `Demoted in ${wingName} by ${author.tag}: ${reason}`;
  await guildMember.roles.add(nextRole, auditReason);
  await guildMember.roles.remove(currentRole, auditReason);
  await syncCategoryRoleForWing(guildMember, wingId, auditReason);
  await syncLeadCategoryRole(guildMember, auditReason);
  await targetUser.send({
    content: [
      `You have been demoted to ${nextRole.name} in the ${wingName} wing.`,
      '',
      `**Reason:** ${reason}`,
      '',
      'To review more specific details, please open a ticket in modmail under the "Internals" section.'
    ].join('\n'),
    allowedMentions: { parse: [] }
  }).catch(() => null);

  return { ok: true, message: `${targetUser.username} has been demoted in the ${wingName} wing.` };
}

async function handleSlashCommand(interaction) {
  const allowed = await memberCanRunDemote(interaction);
  if (!allowed) {
    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);
  const wing = interaction.options.getString('wing');
  const guild = await findGuild();
  const result = await demoteUser(interaction.user, targetUser, reason, wing, guild);
  const _sr = stateManager.getGuildSetting(interaction.guildId, 'success_response', '👍') || '👍'; await interaction.editReply(_sr);
}

async function handlePrefixCommand(message, args, guildId) {
  const allowed = await memberHasAnyRole(guildId, message.author.id, demoteCommandRoleIds());
  if (!allowed) {
    await message.reply('You do not have permission to use this command.');
    return;
  }

  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    await message.reply('usage: `?demote <@user> <reason> [wing]`');
    return;
  }

  const userId = parts[0].replace(/[<@!>]/g, '');
  let targetUser;
  try { targetUser = await message.client.users.fetch(userId); } catch {
    await message.reply('i could not find that user.');
    return;
  }

  const guild = message.guild || await findGuild();
  const reason = parts.slice(1).join(' ');
  const result = await demoteUser(message.author, targetUser, reason, null, guild);
  const _sr = stateManager.getGuildSetting(guildId, 'success_response', '👍') || '👍'; await message.channel.send(_sr);
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
