import stateManager from '../../core/state.js';
import client from '../../core/client.js';
import logger from '../../core/logger.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getPrefix } from '../../core/prefix.js';

function parseGiveawayDuration(input) {
  if (!input) return null;
  const match = input.toLowerCase().match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * (multipliers[unit] || 60000);
}

const giveawayTimers = new Map();

function scheduleGiveawayEnd(giveawayId, endsAt) {
  const delay = endsAt.getTime() - Date.now();
  if (delay <= 0) return;

  const timer = setTimeout(async () => {
    await endGiveaway(giveawayId);
  }, delay);
  giveawayTimers.set(giveawayId, timer);
}

async function endGiveaway(giveawayId) {
  const giveaway = stateManager.getGiveaway(giveawayId);
  if (!giveaway || giveaway.ended) return;

  stateManager.endGiveaway(giveawayId);
  const timer = giveawayTimers.get(giveawayId);
  if (timer) { clearTimeout(timer); giveawayTimers.delete(giveawayId); }

  const entries = stateManager.getGiveawayEntries(giveawayId);
  const validEntries = entries.filter((id) => id !== giveaway.host_id);

  if (!validEntries.length) {
    const guild = await client.guilds.fetch(giveaway.guild_id).catch(() => null);
    if (guild) {
      const channel = guild.channels.cache.get(giveaway.channel_id);
      if (channel && giveaway.message_id) {
        const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
        if (msg) {
          const embed = EmbedBuilder.from(msg.embeds[0] || {})
            .setColor(0x95a5a6)
            .setDescription('No valid entries. Giveaway cancelled.');
          await msg.edit({ embeds: [embed], components: [] });
        }
      }
    }
    return;
  }

  const winnerCount = Math.min(giveaway.winner_count, validEntries.length);
  const winners = [];
  const pool = [...validEntries];
  for (let i = 0; i < winnerCount; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }

  const guild = await client.guilds.fetch(giveaway.guild_id).catch(() => null);
  if (!guild) return;

  const channel = guild.channels.cache.get(giveaway.channel_id);
  if (!channel) return;

  if (giveaway.message_id) {
    const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
    if (msg) {
      const embed = EmbedBuilder.from(msg.embeds[0] || {})
        .setColor(0x57f287)
        .setDescription(`Ended: <t:${Math.floor(Date.now() / 1000)}:R>\n**Winners:** ${winners.map((id) => `<@${id}>`).join(', ')}`);
      await msg.edit({ embeds: [embed], components: [] });
    }
  }

  await channel.send(`🎉 **${giveaway.prize}**\nCongratulations ${winners.map((id) => `<@${id}>`).join(', ')}!`);
}

async function restoreGiveawayTimers(core) {
  const active = stateManager.getActiveGiveaways();
  for (const g of active) {
    const endsAt = new Date(g.ends_at);
    if (endsAt > new Date()) {
      scheduleGiveawayEnd(g.id, endsAt);
      logger.info({ giveawayId: g.id, prize: g.prize }, 'Restored giveaway timer');
    } else {
      await endGiveaway(g.id);
    }
  }
}

async function handleGiveawayButton(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'giveaway_enter') return;

  const messageId = interaction.message.id;
  const giveaways = stateManager.getActiveGiveaways(interaction.guildId);
  const giveaway = giveaways.find((g) => g.message_id === messageId);
  if (!giveaway) {
    await interaction.reply({ content: 'This giveaway is no longer active.', ephemeral: true });
    return;
  }

  if (stateManager.hasGiveawayEntry(giveaway.id, interaction.user.id)) {
    await interaction.reply({ content: 'You are already entered!', ephemeral: true });
    return;
  }

  stateManager.addGiveawayEntry(giveaway.id, interaction.user.id);
  await interaction.reply({ content: '🎉 You entered the giveaway!', ephemeral: true });
}

async function handlePrefixCommand(message, args, guildId) {
  if (!guildId) {
    await message.reply('This command can only be used in a server.');
    return;
  }

  const parts = args.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();

  switch (subcommand) {
    case 'start':
      return handleStart(message, guildId, parts.slice(1));
    case 'end':
      return handleEnd(message, guildId, parts.slice(1));
    case 'reroll':
      return handleReroll(message, guildId, parts.slice(1));
    default:
      const prefix = getPrefix(guildId);
      await message.reply(
        `Giveaway management:\n` +
        `\`${prefix}giveaway start <prize> <duration> [winners] [description]\`\n` +
        `\`${prefix}giveaway end <message_id>\`\n` +
        `\`${prefix}giveaway reroll <message_id>\``
      );
  }
}

async function handleStart(message, guildId, args) {
  const prizeEndIndex = args.findIndex((a) => /^\d+\s*(s|m|h|d)$/i.test(a));
  if (prizeEndIndex < 0) {
    await message.reply('Usage: `giveaway start <prize> <duration> [winners] [description]`\nExample: `giveaway start Nitro 1d 2`');
    return;
  }

  const prize = args.slice(0, prizeEndIndex).join(' ');
  const durationStr = args[prizeEndIndex];
  const winnerCount = parseInt(args[prizeEndIndex + 1], 10) || 1;
  const description = args.slice(prizeEndIndex + 2).join(' ') || null;

  const ms = parseGiveawayDuration(durationStr);
  if (!ms || ms < 10000) {
    await message.reply('Invalid duration. Use format like `30m`, `1h`, `1d`.');
    return;
  }

  const endsAt = new Date(Date.now() + ms);
  const giveawayId = stateManager.createGiveaway(guildId, message.channel.id, prize, description, winnerCount, endsAt.toISOString(), message.author.id);

  const enterButton = new ButtonBuilder()
    .setCustomId('giveaway_enter')
    .setLabel('🎉 Enter')
    .setStyle(ButtonStyle.Primary);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`🎉 ${prize}`)
    .setDescription(`${description || ''}\n\n**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>\n**Winners:** ${winnerCount}\n**Hosted by:** ${message.author}`)
    .setTimestamp();

  const giveawayMsg = await message.channel.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(enterButton)]
  });

  stateManager.setGiveawayMessageId(giveawayId, giveawayMsg.id);
  scheduleGiveawayEnd(giveawayId, endsAt);
  await message.reply(`👍 Giveaway started! Prize: **${prize}**`);
}

async function handleEnd(message, guildId, args) {
  const messageId = args[0]?.trim();
  if (!messageId) {
    await message.reply('Usage: `giveaway end <message_id>`');
    return;
  }

  const active = stateManager.getActiveGiveaways(guildId);
  const giveaway = active.find((g) => g.message_id === messageId);
  if (!giveaway) {
    await message.reply('Giveaway not found or already ended.');
    return;
  }

  await endGiveaway(giveaway.id);
  await message.reply('👍 Giveaway ended.');
}

async function handleReroll(message, guildId, args) {
  const messageId = args[0]?.trim();
  if (!messageId) {
    await message.reply('Usage: `giveaway reroll <message_id>`');
    return;
  }

  const allGiveaways = stateManager.getActiveGiveaways(guildId);
  const endedGiveaways = stateManager.query(
    "SELECT * FROM giveaways WHERE guild_id = ? AND ended = 1", guildId
  );
  const giveaway = [...(allGiveaways || []), ...(endedGiveaways || [])].find((g) => g.message_id === messageId);
  if (!giveaway) {
    await message.reply('Giveaway not found.');
    return;
  }

  const entries = stateManager.getGiveawayEntries(giveaway.id);
  const valid = entries.filter((id) => id !== giveaway.host_id);
  if (!valid.length) {
    await message.reply('No valid entries to reroll.');
    return;
  }

  const winner = valid[Math.floor(Math.random() * valid.length)];
  await message.channel.send(`🎉 **Reroll for ${giveaway.prize}** — New winner: <@${winner}>!`);
}

async function handleSlashCommand(interaction) {
  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'start': {
      const prize = interaction.options.getString('prize', true);
      const durationStr = interaction.options.getString('duration', true);
      const winnerCount = interaction.options.getInteger('winners') || 1;
      const description = interaction.options.getString('description');

      const ms = parseGiveawayDuration(durationStr);
      if (!ms || ms < 10000) {
        await interaction.reply({ content: 'Invalid duration. Use `30m`, `1h`, `1d`, etc.', ephemeral: true });
        return;
      }

      const endsAt = new Date(Date.now() + ms);
      const giveawayId = stateManager.createGiveaway(guildId, interaction.channel.id, prize, description, winnerCount, endsAt.toISOString(), interaction.user.id);

      const enterButton = new ButtonBuilder()
        .setCustomId('giveaway_enter')
        .setLabel('🎉 Enter')
        .setStyle(ButtonStyle.Primary);

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`🎉 ${prize}`)
        .setDescription(`${description || ''}\n\n**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>\n**Winners:** ${winnerCount}\n**Hosted by:** ${interaction.user}`)
        .setTimestamp();

      await interaction.reply({ content: 'Giveaway starting...', ephemeral: true });
      const giveawayMsg = await interaction.channel.send({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(enterButton)]
      });

      stateManager.setGiveawayMessageId(giveawayId, giveawayMsg.id);
      scheduleGiveawayEnd(giveawayId, endsAt);
      break;
    }
    case 'end': {
      const messageId = interaction.options.getString('message_id', true);
      const active = stateManager.getActiveGiveaways(guildId);
      const giveaway = active.find((g) => g.message_id === messageId);
      if (!giveaway) {
        await interaction.reply({ content: 'Giveaway not found or already ended.', ephemeral: true });
        return;
      }
      await endGiveaway(giveaway.id);
      await interaction.reply({ content: '👍 Giveaway ended.', ephemeral: true });
      break;
    }
    case 'reroll': {
      const messageId = interaction.options.getString('message_id', true);
      const endedGiveaways = stateManager.query(
        "SELECT * FROM giveaways WHERE guild_id = ? AND ended = 1", guildId
      );
      const giveaway = (endedGiveaways || []).find((g) => g.message_id === messageId);
      if (!giveaway) {
        await interaction.reply({ content: 'Giveaway not found.', ephemeral: true });
        return;
      }
      const entries = stateManager.getGiveawayEntries(giveaway.id);
      const valid = entries.filter((id) => id !== giveaway.host_id);
      if (!valid.length) {
        await interaction.reply({ content: 'No valid entries.', ephemeral: true });
        return;
      }
      const winner = valid[Math.floor(Math.random() * valid.length)];
      await interaction.channel.send(`🎉 **Reroll for ${giveaway.prize}** — New winner: <@${winner}>!`);
      await interaction.reply({ content: 'Reroll done!', ephemeral: true });
      break;
    }
  }
}

export { handlePrefixCommand, handleSlashCommand, handleGiveawayButton, endGiveaway, restoreGiveawayTimers };
export default handlePrefixCommand;
