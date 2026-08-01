import stateManager from '../../core/state.js';
import { EmbedBuilder } from 'discord.js';
import { getPrefix } from '../../core/prefix.js';
import { caseEmbed, ACTION_LABELS } from './shared.js';

async function handlePrefixCommand(message, args, guildId) {
  const parts = args.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();

  switch (subcommand) {
    case 'setchannel':
      return handleSetChannel(message, guildId, parts.slice(1));
    case 'case':
      return handleViewCase(message, guildId, parts.slice(1));
    case 'history':
      return handleHistory(message, guildId, parts.slice(1));
    default:
      const prefix = getPrefix(guildId);
      await message.reply(
        `Modlog management:\n` +
        `\`${prefix}modlog setchannel #channel\` — set modlog channel\n` +
        `\`${prefix}modlog case <id>\` — view a case\n` +
        `\`${prefix}modlog history <@user>\` — view user's history`
      );
  }
}

async function handleSetChannel(message, guildId, args) {
  const channelMention = args[0];
  if (!channelMention) {
    await message.reply('Usage: `modlog setchannel #channel`');
    return;
  }
  const channelId = channelMention.replace(/[<#>]/g, '');
  stateManager.setModlogChannel(guildId, channelId);
  await message.reply(`Modlog channel set to <#${channelId}>.`);
}

async function handleViewCase(message, guildId, args) {
  const id = parseInt(args[0], 10);
  if (!id) {
    await message.reply('Usage: `modlog case <id>`');
    return;
  }

  const caseRecord = stateManager.getModCase(id);
  if (!caseRecord || caseRecord.guild_id !== guildId) {
    await message.reply('Case not found.');
    return;
  }

  await message.reply({ embeds: [caseEmbed(caseRecord)] });
}

async function handleHistory(message, guildId, args) {
  const userId = args[0]?.replace(/[<@!>]/g, '');
  if (!userId) {
    await message.reply('Usage: `modlog history <@user>`');
    return;
  }

  const cases = stateManager.getModCases(guildId, userId);
  if (!cases.length) {
    await message.reply('No moderation history for this user.');
    return;
  }

  const lines = cases.slice(0, 20).map((c) =>
    `#${c.id} — **${ACTION_LABELS[c.action] || c.action}** — ${c.reason || 'No reason'} — ${new Date(c.created_at).toLocaleDateString()}`
  );

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle(`Moderation History for <@${userId}>`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${cases.length} total case${cases.length === 1 ? '' : 's'}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleSlashCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'setchannel': {
      const channel = interaction.options.getChannel('channel', true);
      stateManager.setModlogChannel(interaction.guildId, channel.id);
      await interaction.reply({ content: `Modlog channel set to ${channel}.`, ephemeral: true });
      break;
    }
    case 'case': {
      const id = interaction.options.getInteger('id', true);
      const caseRecord = stateManager.getModCase(id);
      if (!caseRecord || caseRecord.guild_id !== interaction.guildId) {
        await interaction.reply({ content: 'Case not found.', ephemeral: true });
        return;
      }
      await interaction.reply({ embeds: [caseEmbed(caseRecord)], ephemeral: true });
      break;
    }
    case 'history': {
      const user = interaction.options.getUser('user', true);
      const cases = stateManager.getModCases(interaction.guildId, user.id);
      if (!cases.length) {
        await interaction.reply({ content: 'No moderation history for this user.', ephemeral: true });
        return;
      }
      const lines = cases.slice(0, 20).map((c) =>
        `#${c.id} — **${ACTION_LABELS[c.action] || c.action}** — ${c.reason || 'No reason'} — ${new Date(c.created_at).toLocaleDateString()}`
      );
      const embed = new EmbedBuilder()
        .setColor(0xc67a3a)
        .setTitle(`Moderation History for ${user.tag}`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${cases.length} total case${cases.length === 1 ? '' : 's'}` })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
