import stateManager from '../../core/state.js';
import { memberHasPermission, numberedHierarchyPartsForWing, staffRoleHierarchyIds } from '../../core/permissions.js';
import { findGuild } from '../../bridge.js';
import client from '../../core/client.js';
import config from '../../core/config.js';
import { sendApplicationDecisionLog } from './reviewer.js';

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function approveUser(author, targetUser, guild) {
  const targetMember = await guild.members.fetch({ user: targetUser.id, cache: true, force: true }).catch(() => null);
  if (!targetMember) return { ok: false, message: 'I could not find that user in this server. They may not be a member of this guild.' };

  // Block approval if user already has any wing role — can't approve someone already on staff
  const staffRoleIds = staffRoleHierarchyIds();
  const hasStaffRole = targetMember.roles.cache.some((r) => staffRoleIds.includes(r.id));
  if (hasStaffRole) return { ok: false, message: 'That user already has a staff role and cannot be approved.' };

  const assistantRankOnePart = numberedHierarchyPartsForWing('assistants')
    .find((entry) => entry.level === 1);
  if (!assistantRankOnePart) return { ok: false, message: `The approve command is missing Assistant rank 1 in staffHierarchy.assistants in ${config.paths.rolePolicyFile}.` };

  const assistantRole = await guild.roles.fetch(assistantRankOnePart.roleId).catch(() => null);
  if (!assistantRole) return { ok: false, message: `I could not find the Assistant rank 1 role \`${assistantRankOnePart.roleId}\`.` };

  const approvedRoleId = config.approvedApplicantRoleId;
  const approvedRole = approvedRoleId && approvedRoleId !== assistantRankOnePart.roleId
    ? await guild.roles.fetch(approvedRoleId).catch(() => null)
    : null;
  if (approvedRoleId && approvedRoleId !== assistantRankOnePart.roleId && !approvedRole) return { ok: false, message: `I could not find the optional approved applicant role \`${approvedRoleId}\`.` };

  const ghostPingChannelId = config.approveGhostPingChannelId;
  const ghostPingChannel = await client.channels.fetch(ghostPingChannelId).catch(() => null);
  if (!ghostPingChannel?.isTextBased() || !ghostPingChannel.send) return { ok: false, message: `I could not access the ghost ping channel \`${ghostPingChannelId}\`.` };

  await targetUser.send({
    content: config.approveDmMessage.replace('<user>', `<@${targetUser.id}>`),
    allowedMentions: { users: [targetUser.id] }
  }).catch(() => null);

  const rolesToAdd = [assistantRole, approvedRole].filter(Boolean);
  await targetMember.roles.add(rolesToAdd, `Application approved by ${author.tag}`).catch(() => null);

  const ghostPing = await ghostPingChannel.send({
    content: `<@${targetUser.id}>`,
    allowedMentions: { users: [targetUser.id] }
  }).catch(() => null);
  if (ghostPing) { await sleep(500); await ghostPing.delete().catch(() => null); }

  await sendApplicationDecisionLog({ action: 'Approved', targetUser, moderator: author });
  return { ok: true, message: `Approved ${targetUser.tag}.` };
}

async function handleSlashCommand(interaction) {
  const allowed = interaction.member && memberHasPermission(interaction.member, 'manageRoles');
  if (!allowed) {
    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    return;
  }

  const ghostPingChannelId = config.approveGhostPingChannelId;
  if (!ghostPingChannelId) {
    await interaction.reply({ content: 'The approve command is missing APPROVE_GHOST_PING_CHANNEL_ID in the environment.', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user', true);
  const guild = interaction.guild || await findGuild();
  const result = await approveUser(interaction.user, targetUser, guild);
  const _sr = stateManager.getGuildSetting(interaction.guildId, 'success_response', '👍') || '👍'; await interaction.editReply(_sr);
}

async function handlePrefixCommand(message, args, guildId) {
  const allowed = message.member && memberHasPermission(message.member, 'manageRoles');
  if (!allowed) {
    await message.reply('You do not have permission to use this command.');
    return;
  }

  if (!args.length) {
    await message.reply('Usage: `?approve <@user>`');
    return;
  }

  const first = args.trim().split(/\s+/)[0] || '';
  const rawId = first.replace(/[<@!>]/g, '');
  let targetUser;
  if (/^\d{17,20}$/.test(rawId) && message.guild) {
    const member = await message.guild.members.fetch(rawId).catch(() => null);
    if (member) targetUser = member.user;
  }
  if (!targetUser && message.guild) {
    try {
      const members = await message.guild.members.fetch({ query: rawId, limit: 1 });
      if (members.size) targetUser = members.first().user;
    } catch {}
  }
  if (!targetUser) {
    await message.reply('Could not find that user. Use a user ID or mention them.');
    return;
  }

  if (!message.guild) {
    await message.reply('This command must be used in a server.');
    return;
  }
  const result = await approveUser(message.author, targetUser, message.guild);
  const _sr = stateManager.getGuildSetting(guildId, 'success_response', '👍') || '👍'; await message.channel.send(_sr);
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
