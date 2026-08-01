import { memberCanVotePban, highestPbanVote } from '../../core/permissions.js';
import {
  expirePbanProposal,
  clearPbanTimeout,
  completePbanProposal,
  pbanProposalEmbed,
  pbanComponents,
  pbanPassed,
  pbanVoteRow,
  pbanCleanupRow
} from './shared.js';

export default async function handlePbanVoteButton(interaction) {
  const customId = interaction.customId;
  const [actionName, messageId] = customId.split(':');
  const action = actionName === 'pban_abstain' ? 'abstain' : 'vote';

  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  const state = globalThis.__HALLOWS_STATE__ || {};
  const proposal = state.pbanProposalsByMessageId[messageId];
  if (!proposal || proposal.messageId !== interaction.message.id || !['voting', 'passed'].includes(proposal.status)) {
    await interaction.reply({ content: 'This pban proposal is no longer active.', ephemeral: true });
    return;
  }

  if (proposal.status === 'passed') {
    await interaction.reply({ content: 'This pban proposal has already passed.', ephemeral: true });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member || !memberCanVotePban(member)) {
    await interaction.reply({ content: 'You do not have permission to vote on this pban proposal.', ephemeral: true });
    return;
  }

  if (Number(proposal.expiresAt) <= Date.now()) {
    await expirePbanProposal(messageId);
    await interaction.reply({ content: 'This pban proposal has expired.', ephemeral: true });
    return;
  }

  const pbanVote = highestPbanVote(member);
  if (!pbanVote) {
    await interaction.reply({ content: 'You do not have permission to vote on this pban proposal.', ephemeral: true });
    return;
  }
  if (action === 'abstain') {
    proposal.abstains[interaction.user.id] = {
      userId: interaction.user.id,
      tag: interaction.user.tag,
      rank: pbanVote.rank,
      votedAt: Date.now()
    };
    delete proposal.votes[interaction.user.id];
    proposal.status = 'cancelled';
    proposal.cancelledByUserId = interaction.user.id;
    proposal.cancelledAt = Date.now();
    proposal.cancelledReason = 'A staff member abstained.';
    clearPbanTimeout(messageId);
    if (typeof globalThis.__HALLOWS_SAVE_STATE__ === 'function') {
      await globalThis.__HALLOWS_SAVE_STATE__();
    }
    await interaction.update({
      embeds: [pbanProposalEmbed(proposal)],
      components: [],
      allowedMentions: { users: [proposal.targetUserId, proposal.executorUserId] }
    });
    return;
  }

  proposal.votes[interaction.user.id] = {
    userId: interaction.user.id,
    tag: interaction.user.tag,
    rank: pbanVote.rank,
    votedAt: Date.now()
  };
  delete proposal.abstains[interaction.user.id];
  if (typeof globalThis.__HALLOWS_SAVE_STATE__ === 'function') {
    await globalThis.__HALLOWS_SAVE_STATE__();
  }

  if (pbanPassed(proposal)) {
    await interaction.deferUpdate();
    const result = await completePbanProposal(proposal, interaction.user);
    await interaction.followUp({
      content: result.message,
      ephemeral: !result.ok,
      allowedMentions: { parse: [] }
    }).catch(() => null);
    return;
  }

  await interaction.update({
    embeds: [pbanProposalEmbed(proposal)],
    components: pbanComponents(proposal),
    allowedMentions: { users: [proposal.targetUserId, proposal.executorUserId] }
  });
}
