import { ChannelType } from 'discord.js';
import stateManager from '../../core/state.js';

const JAIL_ROLE_SETTING = 'jail_role_id';
const JAIL_CHANNEL_SETTING = 'jail_channel_id';

async function getJailRole(guild) {
  const roleId = stateManager.getGuildSetting(guild.id, JAIL_ROLE_SETTING);
  if (roleId) {
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (role) return role;
  }
  return null;
}

async function getOrCreateJailRole(guild) {
  const existing = await getJailRole(guild);
  if (existing) return existing;
  const role = await guild.roles.create({
    name: 'Jailed',
    color: 0x2c2f33,
    permissions: [],
    reason: 'Jail system: creating jailed role'
  });
  stateManager.setGuildSetting(guild.id, JAIL_ROLE_SETTING, role.id);
  return role;
}

async function applyJailPermissions(guild, jailRole, jailChannel) {
  let updated = 0;

  for (const channel of guild.channels.cache.values()) {
    try {
      if (channel.id === jailChannel.id) {
        await channel.permissionOverwrites.edit(jailRole, {
          ViewChannel: true,
          SendMessages: true,
          AttachFiles: true,
          ReadMessageHistory: true
        });
        updated++;
      } else if (channel.type === ChannelType.GuildCategory) {
        await channel.permissionOverwrites.edit(jailRole, {
          ViewChannel: false
        });
        updated++;
      } else if (channel.isTextBased() || channel.isVoiceBased() || channel.isThread()) {
        await channel.permissionOverwrites.edit(jailRole, {
          ViewChannel: false
        });
        updated++;
      }
    } catch { }
  }

  return updated;
}

async function handlePrefixCommand(message, args) {
  const channelId = args.trim().replace(/[<#>]/g, '');
  let jailChannel;

  if (channelId) {
    jailChannel = await message.guild.channels.fetch(channelId).catch(() => null);
    if (!jailChannel) {
      await message.reply('Could not find that channel.');
      return;
    }
  } else {
    jailChannel = message.channel;
  }

  if (!jailChannel.isTextBased()) {
    await message.reply('The jail channel must be a text channel.');
    return;
  }

  await message.channel.sendTyping();

  try {
    const role = await getOrCreateJailRole(message.guild);
    stateManager.setGuildSetting(message.guildId, JAIL_CHANNEL_SETTING, jailChannel.id);

    const count = await applyJailPermissions(message.guild, role, jailChannel);

    await message.reply(
      `Jail set up.\nRole: ${role}\nChannel: ${jailChannel}\nPermissions applied to ${count} channel(s). Jailed users can only see & talk in ${jailChannel}.`
    );
  } catch (error) {
    await message.reply('nuuu');
  }
}

async function handleSlashCommand(interaction) {
  const jailChannel = interaction.options.getChannel('channel') || interaction.channel;

  if (jailChannel && !jailChannel.isTextBased()) {
    await interaction.reply({ content: 'The jail channel must be a text channel.', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const role = await getOrCreateJailRole(interaction.guild);
    stateManager.setGuildSetting(interaction.guildId, JAIL_CHANNEL_SETTING, jailChannel.id);

    const count = await applyJailPermissions(interaction.guild, role, jailChannel);

    await interaction.editReply(
      `Jail set up.\nRole: ${role}\nChannel: ${jailChannel}\nPermissions applied to ${count} channel(s). Jailed users can only see & talk in ${jailChannel}.`
    );
  } catch (error) {
    await interaction.editReply('nuuu');
  }
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
