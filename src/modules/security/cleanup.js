import {
  pbanProposalEmbed,
  pbanComponents,
  cleanupUserMessagesInGuild,
  editPbanProposalMessage
} from './shared.js';

export default async function handlePbanCleanupButton(interaction) {
  const customId = interaction.customId;
  const messageId = customId.split(':')[1];

  if (!interaction.guildId || !interaction.guild) {
    await interaction.deferUpdate().catch(() => null);
    console.error('PBAN cleanup failed: interaction has no guild context.');
    return;
  }

  const state = globalThis.__HALLOWS_STATE__ || {};
  const proposal = state.pbanProposalsByMessageId[messageId];
  if (!proposal || proposal.messageId !== interaction.message.id || proposal.status !== 'passed') {
    await interaction.deferUpdate().catch(() => null);
    console.error(`PBAN cleanup ignored for inactive proposal ${messageId}.`);
    return;
  }

  if (proposal.messageCleanupCompletedAt) {
    await interaction.update({
      embeds: [pbanProposalEmbed(proposal)],
      components: pbanComponents(proposal),
      allowedMentions: { users: [proposal.targetUserId, proposal.executorUserId] }
    }).catch(() => null);
    return;
  }

  await interaction.deferUpdate();
  const result = await cleanupUserMessagesInGuild(interaction.guild, proposal.targetUserId, 10);
  proposal.messageCleanupCompletedAt = Date.now();
  proposal.messageCleanupCompletedByUserId = interaction.user.id;
  proposal.messageCleanupResult = result;
  if (typeof globalThis.__HALLOWS_SAVE_STATE__ === 'function') {
    await globalThis.__HALLOWS_SAVE_STATE__();
  }

  await editPbanProposalMessage(proposal);
  console.log(
    `PBAN cleanup completed for ${proposal.targetUserId} from proposal ${proposal.messageId}: `
    + `${result.messagesDeleted} messages deleted across ${result.channelsScanned} scanned channel(s); `
    + `${result.channelErrors} channel error(s).`
  );
}
