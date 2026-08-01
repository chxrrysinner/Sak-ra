import stateManager from '../../core/state.js';
import client from '../../core/client.js';
import { memberHasPermission } from '../../core/permissions.js';
import config from '../../core/config.js';
import { sendApplicationDecisionLog } from './reviewer.js';
async function rejectUser(author, targetUser, guild) {
  await targetUser.send({
    content: config.rejectDmMessage,
    allowedMentions: { parse: [] }
  }).catch(() => null);

  await sendApplicationDecisionLog({ action: 'Rejected', targetUser, moderator: author });
  return { ok: true, message: `Rejected ${targetUser.tag}.` };
}

async function handleSlashCommand(interaction) {
  const allowed = interaction.member && memberHasPermission(interaction.member, 'manageRoles');
  if (!allowed) {
    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user', true);
  const result = await rejectUser(interaction.user, targetUser, interaction.guild);
  const _sr = stateManager.getGuildSetting(interaction.guildId, 'success_response', '👍') || '👍'; await interaction.editReply(_sr);
}

async function handlePrefixCommand(message, args, guildId) {
  const allowed = message.member && memberHasPermission(message.member, 'manageRoles');
  if (!allowed) {
    await message.reply('You do not have permission to use this command.');
    return;
  }

  if (!args.length) {
    await message.reply('Usage: `?reject <@user>`');
    return;
  }

  const first = args.trim().split(/\s+/)[0] || '';
  const rawId = first.replace(/[<@!>]/g, '');
  let targetUser;
  if (/^\d{17,20}$/.test(rawId) && message.guild) {
    // Fetch by guild member — guaranteed to be in the right server
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

  const result = await rejectUser(message.author, targetUser, message.guild);
  const _sr = stateManager.getGuildSetting(guildId, 'success_response', '👍') || '👍'; await message.channel.send(_sr);
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
