import stateManager from '../../core/state.js';
import { getSuccessResponse,  postModlog } from './shared.js';

async function handlePrefixCommand(message, args, guildId) {
  const parts = args.trim().split(/\s+/);
  const count = parseInt(parts[0], 10);
  const targetId = parts[1]?.replace(/[<@!>]/g, '') || null;

  if (!count || count < 1 || count > 100) {
    await message.reply('Usage: `purge <1-100> [@user]`');
    return;
  }

  if (!message.channel.permissionsFor(message.guild.members.me).has('ManageMessages')) {
    await message.reply('I need the Manage Messages permission to purge.');
    return;
  }

  try {
    let deleted;
    if (targetId) {
      const fetched = await message.channel.messages.fetch({ limit: 100 });
      const userMsgs = fetched.filter((m) => m.author.id === targetId);
      const toDelete = [...userMsgs.values()].slice(0, count);
      if (toDelete.length === 0) {
        await message.reply('No messages found from that user.');
        return;
      }
      deleted = toDelete.length;
      if (toDelete.length === 1) {
        await toDelete[0].delete();
      } else {
        await message.channel.bulkDelete(toDelete, true);
      }
    } else {
      const result = await message.channel.bulkDelete(count, true);
      deleted = result.size;
    }

    const caseId = stateManager.createModCase(guildId, targetId || message.author.id, message.author.id, 'purge', null, {
      channelId: message.channel.id,
      messageCount: deleted
    });
    await postModlog(guildId, stateManager.getModCase(caseId));

    const reply = await message.channel.send(getSuccessResponse(guildId));
    setTimeout(() => reply.delete().catch(() => null), 3000);
  } catch (error) {
    if (error.code === 50013) {
      await message.reply('I need the Manage Messages permission to purge messages.');
    } else if (error.code === 50034) {
      await message.reply('Cannot delete messages older than 14 days.');
    } else {
      await message.channel.send('nuuu');
    }
  }
}

async function handleSlashCommand(interaction) {
  const count = interaction.options.getInteger('count', true);
  const targetUser = interaction.options.getUser('user');
  const guildId = interaction.guildId;

  if (count < 1 || count > 100) {
    await interaction.reply({ content: 'Count must be between 1 and 100.', ephemeral: true });
    return;
  }

  if (!interaction.channel.permissionsFor(interaction.guild.members.me).has('ManageMessages')) {
    await interaction.reply({ content: 'I need the Manage Messages permission to purge.', ephemeral: true });
    return;
  }

  try {
    let deleted;
    if (targetUser) {
      const fetched = await interaction.channel.messages.fetch({ limit: 100 });
      const userMsgs = fetched.filter((m) => m.author.id === targetUser.id);
      const toDelete = [...userMsgs.values()].slice(0, count);
      if (toDelete.length === 0) {
        await interaction.reply({ content: 'No messages found from that user.', ephemeral: true });
        return;
      }
      deleted = toDelete.length;
      if (toDelete.length === 1) {
        await toDelete[0].delete();
      } else {
        await interaction.channel.bulkDelete(toDelete, true);
      }
    } else {
      const result = await interaction.channel.bulkDelete(count, true);
      deleted = result.size;
    }

    const caseId = stateManager.createModCase(guildId, targetUser?.id || interaction.user.id, interaction.user.id, 'purge', null, {
      channelId: interaction.channel.id,
      messageCount: deleted
    });
    await postModlog(guildId, stateManager.getModCase(caseId));

    await interaction.reply(getSuccessResponse(guildId));
  } catch (error) {
    if (error.code === 50013) {
      await interaction.reply({ content: 'I need the Manage Messages permission to purge.', ephemeral: true });
    } else if (error.code === 50034) {
      await interaction.reply({ content: 'Cannot delete messages older than 14 days.', ephemeral: true });
    } else {
      await interaction.reply('nuuu');
    }
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
