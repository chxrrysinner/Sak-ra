import { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import stateManager from '../../core/state.js';
import { caseEmbed } from './shared.js';

const CASE_SELECT_ID = 'mod_case_select';

function detectInputType(input) {
  const num = Number(input);
  if (!isNaN(num)) {
    return num >= 100000000000000000 ? 'userId' : 'caseId';
  }
  return 'username';
}

function showCaseResponse(caseRecord) {
  const embed = caseEmbed(caseRecord);
  const evidence = stateManager.getCaseEvidence(caseRecord.id);
  return { embeds: [embed], evidence };
}

function caseSelectMenu(cases) {
  const options = cases.slice(0, 25).map((c) => ({
    label: `#${c.id} — ${c.action}`,
    value: String(c.id),
    description: (c.reason || 'no reason').replace(/<[^>]+>/g, '').slice(0, 100)
  }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(CASE_SELECT_ID)
      .setPlaceholder('select a case...')
      .addOptions(options)
  );
}

async function sendCaseReply(dest, caseRecord) {
  const { embeds, evidence } = showCaseResponse(caseRecord);
  if (evidence.length) {
    await dest.reply({ embeds });
    for (const url of evidence.map((e) => e.url)) {
      await dest.channel?.send(url).catch(() => null);
    }
  } else {
    await dest.reply({ embeds });
  }
}

async function sendCaseEdit(interaction, caseRecord) {
  const { embeds: [embed], evidence } = showCaseResponse(caseRecord);
  const payload = { embeds: [embed], components: [] };
  await interaction.update(payload);
  if (evidence.length) {
    for (const url of evidence.map((e) => e.url)) {
      await interaction.followUp(url).catch(() => null);
    }
  }
}

async function handlePrefixCommand(message, args, guildId) {
  const query = args.trim();
  if (!query) {
    await message.reply('Usage: `case <number | @user | user ID>`');
    return;
  }

  const cleaned = query.replace(/[<@!>]/g, '');
  const type = detectInputType(cleaned);

  if (type === 'caseId') {
    const caseRecord = stateManager.getModCase(parseInt(cleaned, 10));
    if (!caseRecord || caseRecord.guild_id !== guildId) {
      await message.reply('Case not found.');
      return;
    }
    await sendCaseReply(message, caseRecord);
    return;
  }

  const userId = type === 'userId' ? cleaned : null;
  let resolvedUserId = userId;

  if (!resolvedUserId) {
    try {
      const { client } = await import('../../core/client.js');
      const user = await client.users.fetch(cleaned).catch(() => null);
      if (user) resolvedUserId = user.id;
    } catch { /* ignore */ }
  }

  if (!resolvedUserId) {
    await message.reply('Case not found.');
    return;
  }

  const allCases = stateManager.getModCases(guildId, resolvedUserId, null, 25);
  if (allCases.length === 0) {
    await message.reply('Case not found.');
    return;
  }

  if (allCases.length === 1) {
    await sendCaseReply(message, allCases[0]);
    return;
  }

  const userMention = `<@${resolvedUserId}>`;
  const listStr = allCases.slice(0, 25).map((c, i) =>
    `\`${i + 1}.\` **#${c.id}** — ${c.action}${c.reason ? `: ${c.reason.replace(/<[^>]+>/g, '').slice(0, 80)}` : ''}`
  ).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle(`Cases for ${userMention}`)
    .setDescription(`${allCases.length} case(s) found:\n\n${listStr}${allCases.length > 25 ? '\n\n*(showing first 25)*' : ''}`)
    .setFooter({ text: 'select a case from the dropdown' });

  await message.reply({ embeds: [embed], components: [caseSelectMenu(allCases)] });
}

async function handleSlashCommand(interaction) {
  const query = interaction.options.getString('query', true);
  const guildId = interaction.guildId;

  await interaction.deferReply();

  const cleaned = query.replace(/[<@!>]/g, '');
  const type = detectInputType(cleaned);

  if (type === 'caseId') {
    const caseRecord = stateManager.getModCase(parseInt(cleaned, 10));
    if (!caseRecord || caseRecord.guild_id !== guildId) {
      await interaction.editReply('Case not found.');
      return;
    }
    const { embeds: [embed], evidence } = showCaseResponse(caseRecord);
    await interaction.editReply({ embeds: [embed] });
    if (evidence.length) {
      for (const url of evidence.map((e) => e.url)) {
        await interaction.followUp(url).catch(() => null);
      }
    }
    return;
  }

  const userId = type === 'userId' ? cleaned : null;
  let resolvedUserId = userId;

  if (!resolvedUserId) {
    try {
      const { client } = await import('../../core/client.js');
      const user = await client.users.fetch(cleaned).catch(() => null);
      if (user) resolvedUserId = user.id;
    } catch { /* ignore */ }
  }

  if (!resolvedUserId) {
    await interaction.editReply('Case not found.');
    return;
  }

  const allCases = stateManager.getModCases(guildId, resolvedUserId, null, 25);
  if (allCases.length === 0) {
    await interaction.editReply('Case not found.');
    return;
  }

  if (allCases.length === 1) {
    const { embeds: [embed], evidence } = showCaseResponse(allCases[0]);
    await interaction.editReply({ embeds: [embed] });
    if (evidence.length) {
      for (const url of evidence.map((e) => e.url)) {
        await interaction.followUp(url).catch(() => null);
      }
    }
    return;
  }

  const userMention = `<@${resolvedUserId}>`;
  const listStr = allCases.slice(0, 25).map((c, i) =>
    `\`${i + 1}.\` **#${c.id}** — ${c.action}${c.reason ? `: ${c.reason.replace(/<[^>]+>/g, '').slice(0, 80)}` : ''}`
  ).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle(`Cases for ${userMention}`)
    .setDescription(`${allCases.length} case(s) found:\n\n${listStr}${allCases.length > 25 ? '\n\n*(showing first 25)*' : ''}`)
    .setFooter({ text: 'select a case from the dropdown' });

  await interaction.editReply({ embeds: [embed], components: [caseSelectMenu(allCases)] });
}

export async function handleComponentInteraction(interaction) {
  if (!interaction.isStringSelectMenu() || interaction.customId !== CASE_SELECT_ID) return;

  const caseId = parseInt(interaction.values[0], 10);
  const caseRecord = stateManager.getModCase(caseId);
  if (!caseRecord) {
    await interaction.update({ content: 'Case not found.', embeds: [], components: [] });
    return;
  }

  await sendCaseEdit(interaction, caseRecord);
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
