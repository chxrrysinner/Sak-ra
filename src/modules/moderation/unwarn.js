import stateManager from '../../core/state.js';
import { getSuccessResponse,  checkHierarchy, extractUserAndReason } from './shared.js';

async function handlePrefixCommand(message, args, guildId) {
  const parts = args.trim().split(/\s+/);
  const caseIdStr = parts[0];
  const reason = parts.slice(1).join(' ') || 'No reason provided.';

  if (!caseIdStr || isNaN(parseInt(caseIdStr))) {
    await message.reply('Usage: `unwarn <case ID> [reason]`\nUse `?case <id>` to find the warn case ID.');
    return;
  }

  const caseId = parseInt(caseIdStr, 10);
  const caseRecord = stateManager.getModCase(caseId);

  if (!caseRecord || caseRecord.guild_id !== guildId) {
    await message.reply('Case not found.');
    return;
  }

  if (caseRecord.action !== 'warn') {
    await message.reply('That case is not a warning.');
    return;
  }

  const member = message.guild.members.cache.get(caseRecord.moderator_id);
  const hierarchy = checkHierarchy(message.member, member);
  if (!hierarchy.allowed) {
    await message.reply(hierarchy.message);
    return;
  }

  try {
    stateManager.run('UPDATE mod_cases SET reason = ? WHERE id = ?',
      reason + ' [Removed by ' + message.author.tag + ']', caseId);
    await message.channel.send(getSuccessResponse(guildId));
  } catch (error) {
    await message.channel.send('nuuu');
  }
}

async function handleSlashCommand(interaction) {
  const caseId = interaction.options.getInteger('case_id', true);
  const reason = interaction.options.getString('reason') || 'No reason provided.';
  const guildId = interaction.guildId;

  const caseRecord = stateManager.getModCase(caseId);
  if (!caseRecord || caseRecord.guild_id !== guildId) {
    await interaction.reply({ content: 'Case not found.', ephemeral: true });
    return;
  }

  if (caseRecord.action !== 'warn') {
    await interaction.reply({ content: 'That case is not a warning.', ephemeral: true });
    return;
  }

  try {
    stateManager.run('UPDATE mod_cases SET reason = ? WHERE id = ?',
      reason + ' [Removed by ' + interaction.user.tag + ']', caseId);
    await interaction.reply(getSuccessResponse(guildId));
  } catch (error) {
    await interaction.reply({ content: `Failed: ${error.message}`, ephemeral: true });
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
