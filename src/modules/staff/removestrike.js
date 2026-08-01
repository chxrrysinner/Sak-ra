import stateManager from '../../core/state.js';
import { styledEmbed, trimTo } from '../../core/embeds.js';
import { memberHasPermission } from '../../core/permissions.js';
import { strikeRecordsFor } from './shared.js';

async function removeStrike(targetUser) {
  const strikes = strikeRecordsFor(targetUser.id);
  if (!strikes.length) {
    return { ok: false, message: `${targetUser.username} does not have any strikes.` };
  }

  strikes.pop();
  const state = globalThis.__HALLOWS_STATE__ || {};
  if (strikes.length) {
    state.strikesByUserId = state.strikesByUserId || {};
    state.strikesByUserId[targetUser.id] = strikes;
  } else {
    if (state.strikesByUserId) {
      delete state.strikesByUserId[targetUser.id];
    }
  }
  if (typeof globalThis.__HALLOWS_SAVE_STATE__ === 'function') {
    await globalThis.__HALLOWS_SAVE_STATE__();
  }

  await targetUser.send({
    content: 'A strike has been removed from your profile.',
    allowedMentions: { parse: [] }
  }).catch(() => null);

  return { ok: true, message: `Removed a strike from ${targetUser.tag}. They now have ${strikes.length} strike${strikes.length === 1 ? '' : 's'}.` };
}

async function handleSlashCommand(interaction) {
  const allowed = interaction.member && memberHasPermission(interaction.member, 'staff.removeStrike');
  if (!allowed) {
    await interaction.reply({ content: '\u200b', ephemeral: true }).catch(() => {});
    return;
  }

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user', true);
  const result = await removeStrike(targetUser);
  const _sr = stateManager.getGuildSetting(interaction.guildId, 'success_response', '👍') || '👍'; await interaction.editReply(_sr);
}

async function handlePrefixCommand(message, args, guildId) {
  if (!message.member || !memberHasPermission(message.member, 'staff.removeStrike')) return;

  if (!args.length) {
    await message.reply('Usage: `?removestrike <@user>`');
    return;
  }

  const first = args.trim().split(/\s+/)[0] || '';
  const userId = first.replace(/[<@!>]/g, '');
  let targetUser;
  try { targetUser = await message.client.users.fetch(userId); } catch {
    await message.reply('I could not find that user.');
    return;
  }

  const result = await removeStrike(targetUser);
  const _sr = stateManager.getGuildSetting(guildId, 'success_response', '👍') || '👍'; await message.channel.send(_sr);
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
