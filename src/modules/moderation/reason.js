import stateManager from '../../core/state.js';
import { getSuccessResponse } from './shared.js';

async function handlePrefixCommand(message, args, guildId) {
  const parts = args.trim().split(/\s+/);
  const caseIdStr = parts[0];
  const newReason = parts.slice(1).join(' ');

  if (!caseIdStr || isNaN(parseInt(caseIdStr)) || !newReason) {
    await message.reply('Usage: `reason <case ID> <new reason>`');
    return;
  }

  const caseId = parseInt(caseIdStr, 10);
  const caseRecord = stateManager.getModCase(caseId);

  if (!caseRecord || caseRecord.guild_id !== guildId) {
    await message.reply('Case not found.');
    return;
  }

  try {
    stateManager.run('UPDATE mod_cases SET reason = ? WHERE id = ?',
      newReason + ` [updated by ${message.author.tag}]`, caseId);
    await message.channel.send(getSuccessResponse(guildId));
  } catch (error) {
    await message.channel.send('nuuu');
  }
}

async function handleSlashCommand(interaction) {
  const caseId = interaction.options.getInteger('case_id', true);
  const newReason = interaction.options.getString('reason', true);
  const guildId = interaction.guildId;

  const caseRecord = stateManager.getModCase(caseId);
  if (!caseRecord || caseRecord.guild_id !== guildId) {
    await interaction.reply({ content: 'Case not found.', ephemeral: true });
    return;
  }

  try {
    stateManager.run('UPDATE mod_cases SET reason = ? WHERE id = ?',
      newReason + ` [updated by ${interaction.user.tag}]`, caseId);
    await interaction.reply(getSuccessResponse(guildId));
  } catch (error) {
    await interaction.reply({ content: `Failed: ${error.message}`, ephemeral: true });
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
