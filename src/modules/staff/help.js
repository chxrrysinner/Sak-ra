import { EmbedBuilder } from 'discord.js';
import config from '../../core/config.js';
import { HALLOWS_ORANGE } from '../../core/embeds.js';
import { getPrefix } from '../../core/prefix.js';
import registry from '../../core/registry.js';
import { getTicketCommands } from '../tickets/commands.js';

async function handleHelpCommand(context) {
  const isMessage = !!context.author;
  const guildId = isMessage ? context.guild?.id : context.guildId;
  const prefix = getPrefix(guildId);

  const embed = new EmbedBuilder()
    .setColor(HALLOWS_ORANGE)
    .setTitle('Hallows Commands')
    .setDescription(`Prefix: \`${prefix}\` · Use \`/command\` for slash equivalents`)
    .setTimestamp();

  const modules = registry.getAll();
  for (const mod of modules) {
    const cmds = [];
    for (const pc of (mod.prefixCommands || [])) {
      const cmd = pc.command.startsWith('?') ? pc.command : prefix + pc.command;
      cmds.push('`' + cmd + '`');
    }
    for (const sc of (mod.slashCommands || [])) {
      cmds.push('`/' + sc.name + '`');
    }
    if (cmds.length) {
      embed.addFields({ name: mod.name.charAt(0).toUpperCase() + mod.name.slice(1), value: cmds.join(' · '), inline: false });
    }
  }

  const cmdCount = modules.reduce((sum, m) => sum + (m.prefixCommands?.length || 0) + (m.slashCommands?.length || 0), 0);
  embed.addFields({ name: cmdCount + ' commands across ' + modules.length + ' modules', value: 'Use `' + prefix + 'help <command>` for more info on a specific command.', inline: false });

  if (isMessage) {
    await context.reply({ embeds: [embed] });
  } else {
    await context.reply({ embeds: [embed], ephemeral: true });
  }
}

async function handlePrefixCommand(message, args, guildId) {
  return handleHelpCommand(message);
}

async function handleSlashCommand(interaction) {
  return handleHelpCommand(interaction);
}

export { handlePrefixCommand, handleSlashCommand };
export default handleHelpCommand;
