import stateManager from '../../core/state.js';
import { getSuccessResponse,  sendModerationDM, runModAction, checkHierarchy, parseDuration, formatDuration, extractUserAndReason } from './shared.js';

async function handlePrefixCommand(message, args, guildId) {
  const parts = args.trim().split(/\s+/);
  const userId = parts[0]?.replace(/[<@!>]/g, '');
  const durationStr = parts[1];
  const reason = parts.slice(2).join(' ') || 'No reason provided.';

  if (!userId || !durationStr) {
    await message.reply('Usage: `tempban <@user> <duration> [reason]`\nDurations: 10m, 1h, 1d, 1w');
    return;
  }

  const ms = parseDuration(durationStr);
  if (!ms) {
    await message.reply('Invalid duration. Use format like `10m`, `1h`, `1d`, `1w`.');
    return;
  }

  const member = await message.guild.members.fetch(userId).catch(() => null);
  if (member) {
    if (!member.bannable) {
      await message.reply('I cannot ban that member.');
      return;
    }
    const hierarchy = checkHierarchy(message.member, member);
    if (!hierarchy.allowed) {
      await message.reply(hierarchy.message);
      return;
    }
  }

  const unbanAt = new Date(Date.now() + ms);

  try {
    await sendModerationDM(userId, 'tempban', reason, guildId);
    await message.guild.members.ban(userId, { reason: `[Tempban ${formatDuration(ms)}] ${reason}`, deleteMessageDays: 0 });

    stateManager.run(
      'INSERT OR REPLACE INTO tempbans (guild_id, user_id, expires_at) VALUES (?, ?, ?)',
      guildId, userId, unbanAt.toISOString()
    );

    await runModAction(guildId, userId, message.author.id, 'tempban', reason, { duration: formatDuration(ms) }, message.guild);
    await message.channel.send(getSuccessResponse(guildId));
  } catch (error) {
    await message.channel.send('nuuu');
  }
}

async function handleSlashCommand(interaction) {
  const user = interaction.options.getUser('user', true);
  const durationStr = interaction.options.getString('duration', true);
  const reason = interaction.options.getString('reason') || 'No reason provided.';
  const guildId = interaction.guildId;

  const ms = parseDuration(durationStr);
  if (!ms) {
    await interaction.reply({ content: 'Invalid duration. Use format like `10m`, `1h`, `1d`, `1w`.', ephemeral: true });
    return;
  }

  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (member) {
    if (!member.bannable) {
      await interaction.reply({ content: 'I cannot ban that member.', ephemeral: true });
      return;
    }
    const hierarchy = checkHierarchy(interaction.member, member);
    if (!hierarchy.allowed) {
      await interaction.reply({ content: hierarchy.message, ephemeral: true });
      return;
    }
  }

  const unbanAt = new Date(Date.now() + ms);

  try {
    await interaction.deferReply();
    await sendModerationDM(user.id, 'tempban', reason, guildId);
    await interaction.guild.members.ban(user.id, { reason: `[Tempban ${formatDuration(ms)}] ${reason}`, deleteMessageDays: 0 });

    stateManager.run(
      'INSERT OR REPLACE INTO tempbans (guild_id, user_id, expires_at) VALUES (?, ?, ?)',
      guildId, user.id, unbanAt.toISOString()
    );

    await runModAction(guildId, user.id, interaction.user.id, 'tempban', reason, { duration: formatDuration(ms) }, interaction.guild);
    await interaction.editReply(getSuccessResponse(guildId));
  } catch (error) {
    await interaction.editReply('nuuu');
  }
}

async function restoreTempbans(core) {
  const expired = core.state.getExpiredTempbans();
  for (const tb of expired) {
    try {
      const guild = await core.client.guilds.fetch(tb.guild_id).catch(() => null);
      if (guild) {
        await guild.members.unban(tb.user_id, 'Tempban expired').catch(() => null);
      }
      core.state.removeTempban(tb.guild_id, tb.user_id);
    } catch { }
  }

  if (expired.length > 0) {
    core.logger.info({ count: expired.length }, 'Expired tempbans processed on startup');
  }

  setInterval(async () => {
    const expired = core.state.getExpiredTempbans();
    for (const tb of expired) {
      try {
        const guild = await core.client.guilds.fetch(tb.guild_id).catch(() => null);
        if (guild) {
          await guild.members.unban(tb.user_id, 'Tempban expired').catch(() => null);
        }
        core.state.removeTempban(tb.guild_id, tb.user_id);
      } catch { }
    }
    if (expired.length > 0) {
      core.logger.info({ count: expired.length }, 'Expired tempbans auto-unbanned');
    }
  }, 60000);
}

export { handlePrefixCommand, handleSlashCommand, restoreTempbans };
export default handlePrefixCommand;
