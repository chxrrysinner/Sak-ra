import stateManager from '../../core/state.js';
import client from '../../core/client.js';
import { styledEmbed, trimTo, isImageAttachment, normalizeAttachments, imageProofDataFromAttachment } from '../../core/embeds.js';
import { memberCanStartPban, memberHasPermission, memberHasAnyCachedRole, pbanProtectedTargetRoleIds, staffRoleHierarchyIds } from '../../core/permissions.js';
import config from '../../core/config.js';
import {
  pbanProposalEmbed,
  pbanComponents,
  schedulePbanExpiration
} from './shared.js';

async function openPbanProposal(executor, targetUser, reason, guild, guildId) {
  const guildMember = await guild.members.fetch(executor.id).catch(() => null);
  if (!guildMember || (!memberCanStartPban(guildMember) && !memberHasPermission(guildMember, 'security.pban'))) {
    return { ok: false, message: 'You do not have permission to use this command.' };
  }

  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (targetMember && memberHasAnyCachedRole(targetMember, pbanProtectedTargetRoleIds())) {
    return { ok: false, message: 'You cannot open a pban proposal for staff or protected users.' };
  }

  const proposalChannelId = config.pban.proposalChannelId;
  const proposalChannel = await client.channels.fetch(proposalChannelId).catch(() => null);
  if (!proposalChannel?.isTextBased() || !proposalChannel.send) {
    return { ok: false, message: `I could not access the pban proposal channel \`${proposalChannelId}\`.` };
  }

  const proposal = {
    guildId, channelId: proposalChannel.id, messageId: null,
    targetUserId: targetUser.id, targetUserTag: targetUser.tag,
    executorUserId: executor.id, executorTag: executor.tag, reason,
    status: 'proof_pending', proofUrls: [], votes: {}, abstains: {},
    createdAt: Date.now(), expiresAt: Date.now() + config.pban.expiresAfterMs
  };

  const pingRoleIds = [...new Set([
    ...staffRoleHierarchyIds('assistants'),
    ...staffRoleHierarchyIds('moderation')
  ])];
  const proposalMessage = await proposalChannel.send({
    content: pingRoleIds.map((roleId) => `<@&${roleId}>`).join(' '),
    embeds: [pbanProposalEmbed(proposal)],
    allowedMentions: { roles: pingRoleIds }
  });
  proposal.messageId = proposalMessage.id;
  const state = globalThis.__HALLOWS_STATE__ || {};
  state.pbanProposalsByMessageId[proposal.messageId] = proposal;
  if (typeof globalThis.__HALLOWS_SAVE_STATE__ === 'function') {
    await globalThis.__HALLOWS_SAVE_STATE__();
  }
  schedulePbanExpiration(proposal.messageId);

  await proposalMessage.edit({
    embeds: [pbanProposalEmbed(proposal)],
    components: [],
    allowedMentions: { users: [targetUser.id, executor.id] }
  }).catch(() => null);

  return { ok: true, message: `Permanent ban proposal opened in <#${proposalChannel.id}>.` };
}

async function handleSlashCommand(interaction) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const targetUser = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true).trim();
  const result = await openPbanProposal(interaction.user, targetUser, reason, interaction.guild, interaction.guildId);
  const _sr = stateManager.getGuildSetting(interaction.guildId, 'success_response', '👍') || '👍'; await interaction.editReply(_sr);
}

async function handlePrefixCommand(message, args, guildId) {
  if (!message.guildId || !message.guild) {
    await message.reply('Command failed.');
    return;
  }

  if (args.length < 2) {
    await message.reply('Usage: `?pban <@user> <reason>`');
    return;
  }

  const first = args.trim().split(/\s+/)[0] || '';
  const userId = first.replace(/[<@!>]/g, '');
  let targetUser;
  try { targetUser = await message.client.users.fetch(userId); } catch {
    await message.reply('I could not find that user.');
    return;
  }
  const reason = args.slice(1).join(' ').trim();
  const result = await openPbanProposal(message.author, targetUser, reason, message.guild, message.guildId);
  const _sr = stateManager.getGuildSetting(guildId, 'success_response', '👍') || '👍'; await message.channel.send(_sr);
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
