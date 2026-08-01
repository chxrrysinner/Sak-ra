import { PermissionsBitField } from 'discord.js';
import config from './config.js';
import client from './client.js';
import stateManager from './state.js';

const FAKE_PERMISSION_FLAGS = {
  viewAuditLog: { bit: PermissionsBitField.Flags.ViewAuditLog, label: 'View Audit Log' },
  banMembers: { bit: PermissionsBitField.Flags.BanMembers, label: 'Ban Members' },
  kickMembers: { bit: PermissionsBitField.Flags.KickMembers, label: 'Kick Members' },
  manageMessages: { bit: PermissionsBitField.Flags.ManageMessages, label: 'Manage Messages' },
  manageChannels: { bit: PermissionsBitField.Flags.ManageChannels, label: 'Manage Channels' },
  manageRoles: { bit: PermissionsBitField.Flags.ManageRoles, label: 'Manage Roles' },
  manageNicknames: { bit: PermissionsBitField.Flags.ManageNicknames, label: 'Manage Nicknames' },
  moderateMembers: { bit: PermissionsBitField.Flags.ModerateMembers, label: 'Moderate Members' },
  moveMembers: { bit: PermissionsBitField.Flags.MoveMembers, label: 'Move Members' },
  muteMembers: { bit: PermissionsBitField.Flags.MuteMembers, label: 'Mute Members' },
  deafenMembers: { bit: PermissionsBitField.Flags.DeafenMembers, label: 'Deafen Members' },
  manageWebhooks: { bit: PermissionsBitField.Flags.ManageWebhooks, label: 'Manage Webhooks' },
  manageGuild: { bit: PermissionsBitField.Flags.ManageGuild, label: 'Manage Server' },
  mentionEveryone: { bit: PermissionsBitField.Flags.MentionEveryone, label: 'Mention @everyone' },
  administrator: { bit: PermissionsBitField.Flags.Administrator, label: 'Administrator' },
  'staff.stafflist': { bit: null, label: 'View Staff List' },
  'staff.strike': { bit: null, label: 'Manage Strikes' },
  'staff.strikesOthers': { bit: null, label: 'View Others Strikes' },
  'staff.removeStrike': { bit: null, label: 'Remove Strikes' },
  'staff.breaks.manage': { bit: null, label: 'Manage Staff Breaks' },
  'security.pban': { bit: null, label: 'Start PBAN Proposals' },
  'security.addproof': { bit: null, label: 'Add Ban Proof' },
  'admin.hideMessage': { bit: null, label: 'Hide Bot Messages' },
  'state.manage': { bit: null, label: 'Manage Persistent State' }
};

const WING_ORDER = ['internals', 'hr', 'partnership', 'moderation', 'assistants'];

const STAFF_HIERARCHY_WINGS = {
  internals: 'Internals',
  hr: 'HR',
  partnership: 'Partnership',
  moderation: 'Moderation',
  assistants: 'Assistants'
};

const STAFF_HIERARCHY_ALIASES = {
  int: 'internals',
  internal: 'internals',
  executive: 'internals',
  exec: 'internals',
  regional: 'internals',
  regions: 'internals',
  executive_regional: 'internals',
  part: 'partnership',
  partner: 'partnership',
  partnerships: 'partnership',
  mod: 'moderation',
  mods: 'moderation',
  report: 'moderation',
  reports: 'moderation',
  assi: 'assistants',
  assistant: 'assistants',
  general: 'assistants'
};

const INTERNAL_HIERARCHY_LEVEL = 2_000_000;

function ROLE_POLICY() {
  const override = config.getOverride?.('ROLE_POLICY_OVERRIDE') || config.getOverride?.('_role_policy');
  if (override && typeof override === 'string') {
    try { return JSON.parse(override); } catch {}
  }
  if (override && typeof override === 'object') return override;
  return config.policy.rolePolicy || {};
}

function normalizeStaffWingId(value) {
  if (!value) return null;
  return STAFF_HIERARCHY_WINGS[value] ? value : STAFF_HIERARCHY_ALIASES[value] || null;
}

function rolePolicyValueParts(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (/^M\d+$/.test(text)) {
    return { roleId: text.slice(1), isLead: true, isInternal: false, level: null };
  }
  return { roleId: text, isLead: false, isInternal: false, level: null };
}

function configuredRoleIdForToken(token) {
  const rp = ROLE_POLICY();
  return rp.wingRoleIds?.[token]
    || rp.staffRoleIds?.[token]
    || rp.roles?.[token]
    || null;
}

function rolePolicyEntryParts(entry, fallbackLevel = null, options = {}) {
  const rawText = typeof entry === 'string' ? entry.trim() : '';
  const internalMatch = rawText.match(/^I,(.+)$/);
  const leadMatch = internalMatch ? null : rawText.match(/^M,(.+)$/);
  const hierarchyMatch = internalMatch || leadMatch ? null : rawText.match(/^(?:(M)?)(\d+),(.+)$/);
  const hierarchyLevel = hierarchyMatch ? Number(hierarchyMatch[2]) : null;
  const hierarchyLead = Boolean(hierarchyMatch?.[1] || leadMatch);
  const roleEntry = internalMatch ? internalMatch[1].trim() : leadMatch ? leadMatch[1].trim() : hierarchyMatch ? hierarchyMatch[3].trim() : rawText;
  const explicitLevel = internalMatch
    ? INTERNAL_HIERARCHY_LEVEL + (fallbackLevel || 0)
    : Number.isSafeInteger(hierarchyLevel) && hierarchyLevel > 0 ? hierarchyLevel : fallbackLevel;
  const direct = rolePolicyValueParts(roleEntry);
  const mappedRoleId = options.resolveHierarchyReference === false ? null : configuredRoleIdForToken(roleEntry);
  const mapped = rolePolicyValueParts(mappedRoleId);
  const result = mapped.roleId
    ? { roleId: mapped.roleId, isLead: mapped.isLead || direct.isLead || hierarchyLead, isInternal: Boolean(internalMatch) || mapped.isInternal || direct.isInternal }
    : { roleId: direct.roleId, isLead: direct.isLead || hierarchyLead, isInternal: Boolean(internalMatch) || direct.isInternal };
  return { ...result, level: explicitLevel };
}

function roleIdForPolicyEntry(entry) {
  return rolePolicyEntryParts(entry).roleId || null;
}

function staffHierarchyEntriesForWing(wingId = null) {
  const hierarchy = ROLE_POLICY().staffHierarchy;
  if (Array.isArray(hierarchy)) return hierarchy;
  if (!hierarchy || typeof hierarchy !== 'object') return [];
  if (wingId) return hierarchy[normalizeStaffWingId(wingId)] || [];
  return Object.values(hierarchy).flatMap((entries) => Array.isArray(entries) ? entries : []);
}

function sortedStaffHierarchyPartsForWing(wingId) {
  const normalizedWingId = normalizeStaffWingId(wingId);
  return staffHierarchyEntriesForWing(wingId)
    .map((entry, index) => rolePolicyEntryParts(entry, index + 1, { resolveHierarchyReference: false }))
    .map((entry) => ({ ...entry, wingId: normalizedWingId, isInternal: entry.isInternal || normalizedWingId === 'internals' }))
    .filter((entry) => entry.roleId)
    .sort((a, b) => (a.level || 0) - (b.level || 0));
}

function allStaffHierarchyParts() {
  return WING_ORDER.flatMap((wingId) => sortedStaffHierarchyPartsForWing(wingId));
}

function hierarchyReferencePartsForEntry(entry) {
  const text = typeof entry === 'string' ? entry.trim() : '';
  const allMatch = text.match(/^all(?:-(.+))?$/);
  if (allMatch) {
    const excludedWingId = normalizeStaffWingId(allMatch[1]);
    return allStaffHierarchyParts()
      .filter((part) => !excludedWingId || excludedWingId === 'internals' || part.wingId !== excludedWingId);
  }

  const internalMatch = text.match(/^I,(.+)$/);
  const leadMatch = internalMatch ? null : text.match(/^M,(.+)$/);
  const numberedMatch = internalMatch || leadMatch ? null : text.match(/^(\d+),(.+)$/);
  const bareWingId = internalMatch || leadMatch || numberedMatch ? null : normalizeStaffWingId(text);
  const wingId = bareWingId || normalizeStaffWingId(internalMatch?.[1] || leadMatch?.[1] || numberedMatch?.[2]);
  if (!wingId) return [];

  const parts = sortedStaffHierarchyPartsForWing(wingId);
  if (bareWingId) return parts;
  if (internalMatch) return parts.filter((part) => part.isInternal);
  if (leadMatch) return parts.filter((part) => part.isLead);
  const level = Number(numberedMatch?.[1]);
  return parts.filter((part) => !part.isLead && part.level === level);
}

function roleIdsForPolicyEntry(entry) {
  const hierarchyRoleIds = hierarchyReferencePartsForEntry(entry).map((part) => part.roleId);
  if (hierarchyRoleIds.length) return hierarchyRoleIds;
  const roleId = roleIdForPolicyEntry(entry);
  return roleId ? [roleId] : [];
}

function roleIdsForRankNames(rankNames) {
  if (!Array.isArray(rankNames)) return [];
  return [...new Set(rankNames.flatMap((rankName) => roleIdsForPolicyEntry(rankName)).filter(Boolean))];
}

function staffRoleHierarchyIds(wingId = null) {
  if (wingId) return [...new Set(sortedStaffHierarchyPartsForWing(wingId).map((entry) => entry.roleId))];
  return [...new Set(WING_ORDER.flatMap((staffWingId) => sortedStaffHierarchyPartsForWing(staffWingId).map((entry) => entry.roleId)))];
}

function roleAuthorityForWing(member, wingId) {
  const roleParts = sortedStaffHierarchyPartsForWing(wingId);
  const authorityValues = roleParts
    .filter((entry) => member.roles.cache.has(entry.roleId))
    .map((entry) => entry.isInternal ? INTERNAL_HIERARCHY_LEVEL : entry.isLead ? 1_000_000 : entry.level || 0);
  return authorityValues.length ? Math.max(...authorityValues) : 0;
}

function commandRoleIds(commandName) {
  return roleIdsForRankNames(ROLE_POLICY().commands?.[commandName]);
}

function leadHierarchyPartForWing(wingId) {
  return sortedStaffHierarchyPartsForWing(wingId).find((entry) => entry.isLead) || null;
}

function leadHierarchyRoleIds() {
  return [...new Set(WING_ORDER.map((wingId) => leadHierarchyPartForWing(wingId)?.roleId).filter(Boolean))];
}

function categoryRoleIdsByWing() {
  const configured = ROLE_POLICY().categoryRoles || {};
  return Object.fromEntries(Object.entries(configured)
    .map(([wingId, roleId]) => [normalizeStaffWingId(wingId), rolePolicyValueParts(roleId).roleId])
    .filter(([wingId, roleId]) => wingId && roleId));
}

function leadCategoryRoleId() {
  return rolePolicyValueParts(ROLE_POLICY().leadCategoryRole).roleId;
}

function categoryRoleIds() {
  return [...new Set(Object.values(categoryRoleIdsByWing()).filter(Boolean))];
}

function numberedHierarchyPartsForWing(wingId) {
  return sortedStaffHierarchyPartsForWing(wingId).filter((entry) => !entry.isLead);
}

function memberHierarchyPartsForWing(member, wingId) {
  return sortedStaffHierarchyPartsForWing(wingId).filter((entry) => member.roles.cache.has(entry.roleId));
}

function memberNumberedHierarchyPartForWing(member, wingId) {
  return numberedHierarchyPartsForWing(wingId)
    .filter((entry) => member.roles.cache.has(entry.roleId))
    .sort((a, b) => (b.level || 0) - (a.level || 0))[0] || null;
}

function memberLeadHierarchyPartForWing(member, wingId) {
  const leadPart = leadHierarchyPartForWing(wingId);
  return leadPart && member.roles.cache.has(leadPart.roleId) ? leadPart : null;
}

function memberStaffWingIds(member) {
  return WING_ORDER.filter((wingId) => memberHierarchyPartsForWing(member, wingId).length);
}

function nonAssistantStaffWingIds(member) {
  return memberStaffWingIds(member).filter((wingId) => wingId !== 'assistants');
}

function inferredStaffWingId(member) {
  const nonAssistantWings = nonAssistantStaffWingIds(member);
  if (nonAssistantWings.length === 1) return { wingId: nonAssistantWings[0], ambiguous: false };
  if (nonAssistantWings.length > 1) return { wingId: null, ambiguous: true };
  const staffWings = memberStaffWingIds(member);
  if (staffWings.includes('assistants')) return { wingId: 'assistants', ambiguous: false };
  return { wingId: null, ambiguous: false };
}

function memberHasAnyCachedRole(member, roleIds) {
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

async function memberHasAnyRole(guildId, userId, roleIds) {
  if (!roleIds.length) return false;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return false;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return false;

  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

async function syncCategoryRoleForWing(member, wingId, auditReason) {
  const byWing = categoryRoleIdsByWing();
  const targetRoleId = byWing[wingId] || null;
  const removeRoleIds = categoryRoleIds().filter((roleId) => roleId !== targetRoleId && member.roles.cache.has(roleId));
  if (removeRoleIds.length) {
    await member.roles.remove(removeRoleIds, auditReason);
  }
  if (targetRoleId && !member.roles.cache.has(targetRoleId)) {
    await member.roles.add(targetRoleId, auditReason);
  }
}

async function syncLeadCategoryRole(member, auditReason = 'Lead category role sync') {
  const targetRoleId = leadCategoryRoleId();
  if (!targetRoleId) return;

  const hasLeadRole = leadHierarchyRoleIds().some((roleId) => member.roles.cache.has(roleId));
  if (hasLeadRole && !member.roles.cache.has(targetRoleId)) {
    await member.roles.add(targetRoleId, auditReason);
    return;
  }

  if (!hasLeadRole && member.roles.cache.has(targetRoleId)) {
    await member.roles.remove(targetRoleId, auditReason);
  }
}

async function removeCategoryRoleForWing(member, wingId, auditReason) {
  const roleId = categoryRoleIdsByWing()[wingId];
  if (roleId && member.roles.cache.has(roleId)) {
    await member.roles.remove(roleId, auditReason);
  }
}

function demoteCommandRoleIds() {
  return [...new Set([
    ...staffRoleHierarchyIds('hr'),
    ...staffRoleHierarchyIds('internals')
  ])];
}

function demoteExemptRoleIds() {
  return roleIdsForRankNames(ROLE_POLICY().demoteExempt);
}

async function memberCanRunDemote(interaction) {
  if (!interaction.guildId) return false;
  return memberHasAnyRole(interaction.guildId, interaction.user.id, demoteCommandRoleIds());
}

function pbanVoteRankForHierarchyPart(part) {
  if (!part?.roleId || part.wingId === 'partnership') return null;
  if (part.wingId === 'assistants' && !part.isLead && part.level === 1) return '1,assistants';
  if (part.wingId === 'assistants' && part.isLead) return 'M,assistants';
  if (part.wingId === 'moderation' && !part.isLead && part.level === 1) return '1,moderation';
  if (part.wingId === 'hr' && !part.isLead && part.level === 1) return '1,hr';
  if (part.wingId === 'hr' && part.isLead) return 'M,hr';
  return 'staff';
}

function pbanVoteWeight(rank, guildId, roleId) {
  if (guildId && roleId) {
    const dbWeight = stateManager.getPbanVoteWeight(guildId, roleId);
    if (dbWeight !== null) return dbWeight;
  }
  const weights = {
    assistant: 2,
    brew: 3,
    elevated: 6,
    '1,assistants': 2,
    'M,assistants': 3,
    '1,moderation': 3,
    '1,hr': 2,
    'M,hr': 4,
    staff: 6
  };
  return weights[rank] || 0;
}

function highestPbanVote(member) {
  const guildId = member.guild?.id;
  return allStaffHierarchyParts()
    .filter((part) => member.roles.cache.has(part.roleId))
    .map((part) => ({
      rank: pbanVoteRankForHierarchyPart(part),
      roleId: part.roleId
    }))
    .filter((entry) => entry.rank)
    .map((entry) => ({ rank: entry.rank, weight: pbanVoteWeight(entry.rank, guildId, entry.roleId) }))
    .filter((vote) => vote.weight > 0)
    .sort((a, b) => b.weight - a.weight)[0] || null;
}

function memberCanStartPban(member) {
  return memberHasAnyCachedRole(member, [
    ...staffRoleHierarchyIds('moderation'),
    ...staffRoleHierarchyIds('hr'),
    ...staffRoleHierarchyIds('internals')
  ]);
}

function memberCanVotePban(member) {
  return Boolean(highestPbanVote(member));
}

function allPolicyRoleIds() {
  const rp = ROLE_POLICY();
  return [...new Set([
    ...Object.values(rp.roles || {}),
    ...Object.values(rp.wingRoleIds || {}),
    ...Object.values(rp.staffRoleIds || {})
  ].map((roleId) => rolePolicyValueParts(roleId).roleId).filter(Boolean))];
}

function allConfiguredStaffRoleIds() {
  return [...new Set([
    ...allPolicyRoleIds(),
    ...staffRoleHierarchyIds()
  ])];
}

function pbanProtectedTargetRoleIds() {
  return [...new Set([
    ...allConfiguredStaffRoleIds(),
    ...(config.pban.protectedRoleIds || [])
  ])];
}

function allBreakRemovableStaffRoleIds() {
  return [...new Set([
    ...staffRoleHierarchyIds(),
    ...allConfiguredStaffRoleIds()
  ])];
}

function staffListRoleIdsForGroup(group) {
  return group.staffWingId ? staffRoleHierarchyIds(group.staffWingId) : [];
}

function staffListPartsForRoleIds(wingId, roleIds) {
  return sortedStaffHierarchyPartsForWing(wingId)
    .filter((entry) => roleIds.includes(entry.roleId));
}

function staffListBestPart(parts) {
  return [...parts].sort((a, b) => {
    const authorityA = a.isInternal ? INTERNAL_HIERARCHY_LEVEL : a.isLead ? 1_000_000 : a.level || 0;
    const authorityB = b.isInternal ? INTERNAL_HIERARCHY_LEVEL : b.isLead ? 1_000_000 : b.level || 0;
    return authorityB - authorityA;
  })[0] || null;
}

function staffListSortValue(parts) {
  const bestPart = staffListBestPart(parts);
  if (!bestPart) return Number.MAX_SAFE_INTEGER;
  if (bestPart.isInternal) return -INTERNAL_HIERARCHY_LEVEL;
  if (bestPart.isLead) return -1_000_000;
  return -(bestPart.level || 0);
}

function staffListRankLabel(parts) {
  const bestPart = staffListBestPart(parts);
  if (!bestPart) return '';
  if (bestPart.isInternal) return ' (internal)';
  if (bestPart.isLead) return ' (lead)';
  return bestPart.level ? ` (rank ${bestPart.level})` : '';
}

function staffWingNameFor(value) {
  const id = normalizeStaffWingId(value);
  return id ? STAFF_HIERARCHY_WINGS[id] || id : value;
}

function resolveWings(guildId) {
  if (!guildId || !stateManager.initialized) return {};
  const dbWings = stateManager.getWings(guildId);
  if (!dbWings.length) return {};
  const result = {};
  for (const w of dbWings) {
    result[w.id] = {
      label: w.label,
      description: w.description || '',
      channelPrefix: w.channel_prefix
    };
  }
  return result;
}

function resolveWingOrder(guildId) {
  if (!guildId || !stateManager.initialized) return [];
  const dbWings = stateManager.getWings(guildId);
  if (!dbWings.length) return [];
  return dbWings.map((w) => w.id);
}

function resolveWingRoles(guildId, wingId) {
  if (!guildId || !stateManager.initialized) return [];
  return stateManager.getWingRoles(guildId, wingId);
}

function wingsToStaffListDepartments(guildId) {
  const order = resolveWingOrder(guildId);
  const wings = resolveWings(guildId);
  return order.map((wingId) => ({
    heading: (wings[wingId]?.label || wingId) + ' Wing',
    staffWingId: wingId
  }));
}

function memberIsOwner(member) {
  return member?.id && config.ownerId && member.id === config.ownerId;
}

function memberHasGlobalWing(member) {
  if (!member?.guild?.id) return false;
  if (memberIsOwner(member)) return true;
  const guildId = member.guild.id;
  const wings = stateManager.getWings(guildId);
  for (const wing of wings) {
    const isGlobal = stateManager.getGuildSetting(guildId, `branch_${wing.id}_global`, '') === 'true';
    if (!isGlobal) continue;
    const roles = stateManager.getWingRoles(guildId, wing.id);
    for (const r of roles) {
      if (member.roles.cache.has(r.role_id)) return true;
    }
  }
  return false;
}

function memberHasFakePermission(member, flag) {
  if (memberHasGlobalWing(member)) return true;
  const roleIds = stateManager.getFakePermissionRoles(member.guild.id, flag);
  if (!roleIds.length) return false;
  return memberHasAnyCachedRole(member, roleIds);
}

function memberHasPermission(member, flag) {
  if (memberHasGlobalWing(member)) return true;
  const flagDef = FAKE_PERMISSION_FLAGS[flag];
  if (flagDef && flagDef.bit !== null && member.permissions.has(flagDef.bit)) return true;
  return memberHasFakePermission(member, flag);
}

export {
  WING_ORDER,
  STAFF_HIERARCHY_WINGS,
  STAFF_HIERARCHY_ALIASES,
  INTERNAL_HIERARCHY_LEVEL,
  normalizeStaffWingId,
  rolePolicyValueParts,
  configuredRoleIdForToken,
  rolePolicyEntryParts,
  roleIdForPolicyEntry,
  staffHierarchyEntriesForWing,
  sortedStaffHierarchyPartsForWing,
  allStaffHierarchyParts,
  hierarchyReferencePartsForEntry,
  roleIdsForPolicyEntry,
  roleIdsForRankNames,
  staffRoleHierarchyIds,
  roleAuthorityForWing,
  commandRoleIds,
  leadHierarchyPartForWing,
  leadHierarchyRoleIds,
  categoryRoleIdsByWing,
  leadCategoryRoleId,
  categoryRoleIds,
  numberedHierarchyPartsForWing,
  memberHierarchyPartsForWing,
  memberNumberedHierarchyPartForWing,
  memberLeadHierarchyPartForWing,
  memberStaffWingIds,
  nonAssistantStaffWingIds,
  inferredStaffWingId,
  memberHasAnyCachedRole,
  memberHasAnyRole,
  syncCategoryRoleForWing,
  syncLeadCategoryRole,
  removeCategoryRoleForWing,
  demoteCommandRoleIds,
  demoteExemptRoleIds,
  memberCanRunDemote,
  pbanVoteRankForHierarchyPart,
  pbanVoteWeight,
  highestPbanVote,
  memberCanStartPban,
  memberCanVotePban,
  allPolicyRoleIds,
  allConfiguredStaffRoleIds,
  pbanProtectedTargetRoleIds,
  allBreakRemovableStaffRoleIds,
  staffListRoleIdsForGroup,
  staffListPartsForRoleIds,
  staffListBestPart,
  staffListSortValue,
  staffListRankLabel,
  staffWingNameFor,
  resolveWings,
  resolveWingOrder,
  resolveWingRoles,
  wingsToStaffListDepartments,
  FAKE_PERMISSION_FLAGS,
  memberIsOwner,
  memberHasGlobalWing,
  memberHasFakePermission,
  memberHasPermission
};
