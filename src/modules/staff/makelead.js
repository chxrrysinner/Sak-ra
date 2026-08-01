import stateManager from '../../core/state.js';
import { findGuild } from '../../bridge.js';
import client from '../../core/client.js';
import config from '../../core/config.js';
import { styledEmbed, trimTo } from '../../core/embeds.js';
import {
  memberCanRunDemote, normalizeStaffWingId, staffWingNameFor,
  leadHierarchyPartForWing, leadCategoryRoleId,
  nonAssistantStaffWingIds, memberHierarchyPartsForWing,
  categoryRoleIdsByWing, syncCategoryRoleForWing, syncLeadCategoryRole,
  memberHasAnyRole, demoteCommandRoleIds
} from '../../core/permissions.js';

const ROLE_POLICY_FILE =       config.paths.rolePolicyFile || './role-policy.json';

async function makeLeadUser(author, targetUser, wing, guild) {
  const wingId = normalizeStaffWingId(wing);
  const wingName = staffWingNameFor(wing);
  const leadPart = leadHierarchyPartForWing(wingId);
  if (!leadPart) {
    return { ok: false, message: `The makelead command is missing an M staffHierarchy role for ${wingName} in ${ROLE_POLICY_FILE}.` };
  }
  const sharedLeadRoleId = leadCategoryRoleId();
  if (!sharedLeadRoleId) {
    return { ok: false, message: `The makelead command is missing leadCategoryRole in ${ROLE_POLICY_FILE}. Set it to the shared head-of-wing role ID.` };
  }

  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    return { ok: false, message: 'I could not find that user in this server.' };
  }

  const nonAssistantWings = nonAssistantStaffWingIds(targetMember);
  if (nonAssistantWings.length && !nonAssistantWings.includes(wingId)) {
    return { ok: false, message: `${targetUser.username} is already in the ${staffWingNameFor(nonAssistantWings[0])} wing. Cross-wing lead assignments must start from Assistants.` };
  }

  const leadRole = await guild.roles.fetch(leadPart.roleId).catch(() => null);
  if (!leadRole) {
    return { ok: false, message: `I could not find the ${wingName} lead role \`${leadPart.roleId}\`.` };
  }
  const sharedLeadRole = await guild.roles.fetch(sharedLeadRoleId).catch(() => null);
  if (!sharedLeadRole) {
    return { ok: false, message: `I could not find the shared head-of-wing role \`${sharedLeadRoleId}\`.` };
  }

  const targetWingRoleIds = memberHierarchyPartsForWing(targetMember, wingId).map((entry) => entry.roleId);
  const assistantRoleIds = memberHierarchyPartsForWing(targetMember, 'assistants').map((entry) => entry.roleId);
  if (!targetWingRoleIds.length && !assistantRoleIds.length) {
    return { ok: false, message: `${targetUser.username} must already be in ${wingName}${wingId === 'assistants' ? '' : ' or Assistants'} before becoming a lead.` };
  }

  const removeRoleIds = memberHierarchyPartsForWing(targetMember, wingId)
    .map((entry) => entry.roleId)
    .filter((roleId) => roleId !== leadPart.roleId);
  if (wingId !== 'assistants') {
    removeRoleIds.push(...memberHierarchyPartsForWing(targetMember, 'assistants').map((entry) => entry.roleId));
  }

  const auditReason = `Made ${wingName} lead by ${author.tag}`;
  const addRoles = [leadRole, sharedLeadRole].filter((role) => !targetMember.roles.cache.has(role.id));
  if (addRoles.length) {
    await targetMember.roles.add(addRoles, auditReason);
  }
  const uniqueRemoveRoleIds = [...new Set(removeRoleIds)].filter((roleId) => targetMember.roles.cache.has(roleId));
  if (uniqueRemoveRoleIds.length) {
    await targetMember.roles.remove(uniqueRemoveRoleIds, auditReason);
  }
  await syncCategoryRoleForWing(targetMember, wingId, auditReason);
  await syncLeadCategoryRole(targetMember, auditReason);

  const categoryRoleId = categoryRoleIdsByWing()[wingId];
  const assignedRoleIds = [
    leadRole.id,
    sharedLeadRole.id,
    categoryRoleId
  ].filter(Boolean);
  return { ok: true, message: `${targetUser.username} has been made ${wingName} lead with ${assignedRoleIds.map((roleId) => `<@&${roleId}>`).join(', ')}.` };
}

async function handleSlashCommand(interaction) {
  const allowed = await memberCanRunDemote(interaction);
  if (!allowed) {
    await interaction.reply({ content: '\u200b', ephemeral: true }).catch(() => {});
    return;
  }

  const wing = interaction.options.getString('wing', true);

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user', true);
  const guild = await findGuild();
  const result = await makeLeadUser(interaction.user, targetUser, wing, guild);
  const _sr = stateManager.getGuildSetting(interaction.guildId, 'success_response', '👍') || '👍'; await interaction.editReply(_sr);
}

async function handlePrefixCommand(message, args, guildId) {
  const allowed = await memberHasAnyRole(guildId, message.author.id, demoteCommandRoleIds());
  if (!allowed) return;

  if (args.length < 2) {
    await message.reply('Usage: `?makelead <@user> <wing>`');
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
  const result = await makeLeadUser(message.author, targetUser, wing, guild);
  const _sr = stateManager.getGuildSetting(guildId, 'success_response', '👍') || '👍'; await message.channel.send(_sr);
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
