import { memberHasPermission } from '../../core/permissions.js';
import { normalizeAttachments } from '../../core/embeds.js';
import { validDiscordUserId, ensureBanProfileForUser, banProfileEmbed, sendBanProofReplies } from './shared.js';

export default async function handleCbanCommand(interaction) {
  const allowed = interaction.member && memberHasPermission(interaction.member, 'security.cban');
  if (!allowed) {
    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  const userId = interaction.options.getString('userid', true).trim();
  if (!validDiscordUserId(userId)) {
    await interaction.reply({ content: 'Use a valid Discord user ID.', ephemeral: true });
    return;
  }

  await interaction.deferReply();
  const profile = await ensureBanProfileForUser(interaction.guild, userId);
  if (!profile) {
    await interaction.editReply(`I could not find \`${userId}\` in the server ban list.`);
    return;
  }

  const banMessage = await interaction.editReply({
    embeds: [banProfileEmbed(profile)],
    allowedMentions: { parse: [] }
  });
  if (normalizeAttachments(profile.proofUrls || []).length) {
    await sendBanProofReplies(banMessage, profile.proofUrls || []);
  }
}
