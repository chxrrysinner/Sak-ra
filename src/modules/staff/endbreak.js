import stateManager from '../../core/state.js';
import { endStaffBreak } from './shared.js';

async function handleSlashCommand(interaction) {
  const brState = globalThis.__HALLOWS_BREAK_STATE__ || {};
  if (!interaction.guildId || !brState.activeByUserId?.[interaction.user.id]) {
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const result = await endStaffBreak(interaction.user.id, 'your break is ended, welcome back.');
  const _sr = stateManager.getGuildSetting(interaction.guildId, 'success_response', '👍') || '👍'; await interaction.editReply(_sr);
}

async function handlePrefixCommand(message, args, guildId) {
  const brState = globalThis.__HALLOWS_BREAK_STATE__ || {};
  if (!message.guildId || !brState.activeByUserId?.[message.author.id]) {
    await message.reply('Command failed.');
    return;
  }

  const result = await endStaffBreak(message.author.id, 'your break is ended, welcome back.');
  const _sr = stateManager.getGuildSetting(guildId, 'success_response', '👍') || '👍'; await message.channel.send(_sr);
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
