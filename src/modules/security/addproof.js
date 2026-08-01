import stateManager from '../../core/state.js';
import { memberHasPermission } from '../../core/permissions.js';
import client from '../../core/client.js';
import { isImageAttachment } from '../../core/embeds.js';
import { validDiscordUserId, addProofToBanProfile } from './shared.js';

async function handlePrefixCommand(message, args, guildId) {
  const member = message.member;
  if (!member || !memberHasPermission(member, 'security.addproof')) return;

  const userId = args.trim();
  if (!userId || !validDiscordUserId(userId.replace(/[<@!>]/g, ''))) {
    await message.reply('Usage: `?addproof <user ID>` with at least one image attached.');
    return;
  }

  const cleanId = userId.replace(/[<@!>]/g, '');
  const uploads = [...message.attachments.values()];
  const screenshots = uploads.filter((a) => isImageAttachment(a));
  if (!screenshots.length) {
    await message.reply('Attach at least one screenshot image with this command.');
    return;
  }

  if (screenshots.length !== uploads.length) {
    await message.reply('Only image attachments can be added as proof screenshots.');
    return;
  }

  const { addProofToBanProfile } = await import('./shared.js');
  const result = await addProofToBanProfile({
    guild: message.guild,
    userId: cleanId,
    screenshots,
    addedBy: message.author
  });

  const _sr = stateManager.getGuildSetting(guildId, 'success_response', '👍') || '👍'; await message.channel.send(_sr);
}

export default async function handleAddProofCommand(interaction) {
  const allowed = interaction.member && memberHasPermission(interaction.member, 'security.addproof');
  if (!allowed) {
    await interaction.reply({ content: '\u200b', ephemeral: true }).catch(() => {});
    return;
  }

  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({ content: 'Command failed.' });
    return;
  }

  const userId = interaction.options.getString('userid', true).trim();
  if (!validDiscordUserId(userId)) {
    await interaction.reply({ content: 'Use a valid Discord user ID.' });
    return;
  }

  const uploads = [];
  for (let index = 1; index <= 10; index += 1) {
    const optionName = index === 1 ? 'image' : `image${index}`;
    const attachment = interaction.options.getAttachment(optionName, index === 1);
    if (attachment) uploads.push(attachment);
  }

  const screenshots = uploads.filter(isImageAttachment);
  if (!screenshots.length) {
    await interaction.reply({ content: 'Attach at least one screenshot image file with this command.' });
    return;
  }

  if (screenshots.length !== uploads.length) {
    await interaction.reply({ content: 'Only image attachments can be added as proof screenshots.' });
    return;
  }

  await interaction.deferReply();
  const result = await addProofToBanProfile({
    guild: interaction.guild,
    userId,
    screenshots,
    addedBy: interaction.user
  });

  const _sr = stateManager.getGuildSetting(interaction.guildId, 'success_response', '👍') || '👍'; await interaction.editReply(_sr);
}

export { handlePrefixCommand };
