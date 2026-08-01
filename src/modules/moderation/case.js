import stateManager from '../../core/state.js';
import { EmbedBuilder } from 'discord.js';
import { caseEmbed } from './shared.js';

function detectInputType(input) {
  const num = Number(input);
  if (!isNaN(num)) {
    return num >= 100000000000000000 ? 'userId' : 'caseId';
  }
  return 'username';
}

async function resolveCase(guildId, query) {
  const type = detectInputType(query.trim());

  if (type === 'caseId') {
    const caseRecord = stateManager.getModCase(parseInt(query, 10));
    if (caseRecord && caseRecord.guild_id === guildId) return caseRecord;
    return null;
  }

  if (type === 'userId') {
    const cases = stateManager.getModCases(guildId, query.trim(), null, 1);
    return cases.length ? cases[0] : null;
  }

  try {
    const { client } = await import('../../core/client.js');
    const users = await client.users.fetch(query.trim()).catch(() => null);
    if (users) {
      const cases = stateManager.getModCases(guildId, users.id, null, 1);
      return cases.length ? cases[0] : null;
    }
  } catch { /* ignore */ }

  return null;
}

async function handlePrefixCommand(message, args, guildId) {
  const query = args.trim();
  if (!query) {
    await message.reply('Usage: `case <number | @user | user ID>`');
    return;
  }

  const caseRecord = await resolveCase(guildId, query.replace(/[<@!>]/g, ''));
  if (!caseRecord) {
    await message.reply('Case not found.');
    return;
  }

  const embed = caseEmbed(caseRecord);
  const evidence = stateManager.getCaseEvidence(caseRecord.id);

  if (evidence.length) {
    const urls = evidence.map((e) => e.url);
    await message.reply({ embeds: [embed] });
    for (const url of urls) {
      await message.channel.send(url).catch(() => null);
    }
  } else {
    await message.reply({ embeds: [embed] });
  }
}

async function handleSlashCommand(interaction) {
  const query = interaction.options.getString('query', true);
  const guildId = interaction.guildId;

  await interaction.deferReply();

  const caseRecord = await resolveCase(guildId, query.replace(/[<@!>]/g, ''));
  if (!caseRecord) {
    await interaction.editReply('Case not found.');
    return;
  }

  const embed = caseEmbed(caseRecord);
  const evidence = stateManager.getCaseEvidence(caseRecord.id);

  if (evidence.length) {
    await interaction.editReply({ embeds: [embed] });
    for (const url of evidence.map((e) => e.url)) {
      await interaction.followUp(url).catch(() => null);
    }
  } else {
    await interaction.editReply({ embeds: [embed] });
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
