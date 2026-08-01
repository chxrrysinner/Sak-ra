import stateManager from '../../core/state.js';
import { memberHasPermission } from '../../core/permissions.js';
import { checkForNewApplications, isGoogleInvalidGrantError, googleInvalidGrantMessage } from './reviewer.js';

async function runRefresh() {
  if (!globalThis.__HALLOWS_REVIEWER_ENABLED__) {
    return { ok: false, message: 'The application reviewer is not configured.' };
  }

  if (globalThis.__HALLOWS_IS_POLLING__) {
    return { ok: false, message: 'A refresh is already running. Try again in a moment.' };
  }

  globalThis.__HALLOWS_IS_POLLING__ = true;

  try {
    const result = await checkForNewApplications();
    return { ok: true, message: `Refresh complete. Found ${result.found} response(s), ${result.new} new, posted ${result.posted}.` };
  } catch (error) {
    if (isGoogleInvalidGrantError(error)) {
      console.error(`Manual application refresh failed: ${googleInvalidGrantMessage()}`);
      return { ok: false, message: `Refresh failed: ${googleInvalidGrantMessage()}` };
    } else {
      console.error('Manual application refresh failed:', error);
      return { ok: false, message: `Refresh failed: ${error.message}` };
    }
  } finally {
    globalThis.__HALLOWS_IS_POLLING__ = false;
  }
}

async function handleSlashCommand(interaction) {
  const allowed = interaction.member && memberHasPermission(interaction.member, 'manageRoles');
  if (!allowed) {
    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const result = await runRefresh();
  const _sr = stateManager.getGuildSetting(interaction.guildId, 'success_response', '👍') || '👍'; await interaction.editReply(_sr);
}

async function handlePrefixCommand(message, args, guildId) {
  const allowed = message.member && memberHasPermission(message.member, 'manageRoles');
  if (!allowed) {
    await message.reply('You do not have permission to use this command.');
    return;
  }

  const result = await runRefresh();
  const _sr = stateManager.getGuildSetting(guildId, 'success_response', '👍') || '👍'; await message.channel.send(_sr);
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
