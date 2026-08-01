import stateManager from '../../core/state.js';
import { findGuild } from '../../bridge.js';
import client from '../../core/client.js';
import { styledEmbed, trimTo } from '../../core/embeds.js';
import {
  normalizeStaffWingId, staffWingNameFor, numberedHierarchyPartsForWing,
  memberHierarchyPartsForWing, memberLeadHierarchyPartForWing,
  memberNumberedHierarchyPartForWing, nonAssistantStaffWingIds,
  syncCategoryRoleForWing, syncLeadCategoryRole, memberCanRunDemote,
  memberHasAnyRole, demoteCommandRoleIds
} from '../../core/permissions.js';

const ROLE_POLICY_FILE = process.env.ROLE_POLICY_FILE || './role-policy.json';

async function promoteUser(author, targetUser, wing, guild) {
  const wingId = normalizeStaffWingId(wing);
  const wingName = staffWingNameFor(wing);
  const numberedParts = numberedHierarchyPartsForWing(wingId);
  if (!numberedParts.length) {
    return { ok: false, message: `The promote command is missing numbered staffHierarchy roles for ${wingName} in ${ROLE_POLICY_FILE}.` };
  }

  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    return { ok: false, message: 'I could not find that user in this server.' };
  }

  const nonAssistantWings = nonAssistantStaffWingIds(targetMember);
  if (nonAssistantWings.length && !nonAssistantWings.includes(wingId)) {
    return { ok: false, message: `${targetUser.username} is already in the ${staffWingNameFor(nonAssistantWings[0])} wing. Cross-wing promotions must start from Assistants.` };
  }

  const currentLeadPart = memberLeadHierarchyPartForWing(targetMember, wingId);
  if (currentLeadPart) {
    return { ok: false, message: `${targetUser.username} is already a ${wingName} lead. Use demote to move them back into the numbered hierarchy.` };
  }

  const currentNumberedPart = memberNumberedHierarchyPartForWing(targetMember, wingId);
  const assistantPartsToRemove = wingId === 'assistants'
    ? []
    : memberHierarchyPartsForWing(targetMember, 'assistants').map((entry) => entry.roleId);
  const targetPart = currentNumberedPart
    ? numberedParts.find((entry) => (entry.level || 0) > (currentNumberedPart.level || 0))
    : numberedParts[0];

  if (!currentNumberedPart && !assistantPartsToRemove.length && wingId !== 'assistants') {
    return { ok: false, message: `${targetUser.username} must be in Assistants before being promoted into ${wingName}.` };
  }

  if (!targetPart) {
    return { ok: false, message: `${targetUser.username} is already at the highest numbered ${wingName} role. Use makelead to assign the lead role.` };
  }

  const removeRoleIds = [
    currentNumberedPart?.roleId,
    ...assistantPartsToRemove
  ].filter(Boolean);
  const targetRole = await guild.roles.fetch(targetPart.roleId).catch(() => null);
  if (!targetRole) {
    return { ok: false, message: `I could not find the promotion target role \`${targetPart.roleId}\`.` };
  }

  const auditReason = `Promoted in ${wingName} by ${author.tag}`;
  await targetMember.roles.add(targetRole, auditReason);
  if (removeRoleIds.length) {
    await targetMember.roles.remove([...new Set(removeRoleIds)], auditReason);
  }
  await syncCategoryRoleForWing(targetMember, wingId, auditReason);
  await syncLeadCategoryRole(targetMember, auditReason);

  return { ok: true, message: `${targetUser.username} has been promoted to ${targetRole.name} in the ${wingName} wing.` };
}

async function handleSlashCommand(interaction) {
  const allowed = await memberCanRunDemote(interaction);
  if (!allowed) {
    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    return;
  }

  const wing = interaction.options.getString('wing', true);

  await interaction.deferReply();
  const guild = await findGuild();
  const targetUser = interaction.options.getUser('user', true);
  const result = await promoteUser(interaction.user, targetUser, wing, guild);
  const _sr = stateManager.getGuildSetting(interaction.guildId, 'success_response', '👍') || '👍'; await interaction.editReply(_sr);
}

async function handlePrefixCommand(message, args, guildId) {
  const allowed = await memberHasAnyRole(guildId, message.author.id, demoteCommandRoleIds());
  if (!allowed) {
    await message.reply('You do not have permission to use this command.');
    return;
  }

  if (args.length < 2) {
    await message.reply('Usage: `?promote <@user> <wing>`');
    return;
  }

  const first = args.trim().split(/\s+/)[0] || '';
  const userId = first.replace(/[<@!>]/g, '');
  let targetUser;
  try { targetUser = await message.client.users.fetch(userId); } catch {
    await message.reply('I could not find that user.');
    return;
  }

  const wing = args.slice(1).join(' ');
  const guild = await findGuild();
  const result = await promoteUser(message.author, targetUser, wing, guild);
  const _sr = stateManager.getGuildSetting(guildId, 'success_response', '👍') || '👍'; await message.channel.send(_sr);
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
