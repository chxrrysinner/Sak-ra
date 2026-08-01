import { getPrefix, setPrefix } from '../../core/prefix.js';

async function handlePrefixCommand(message, args) {
  const guildId = message.guild?.id;
  if (!guildId) {
    await message.reply('This command can only be used in a server.');
    return;
  }

  const subcommand = args.split(/\s+/)[0]?.toLowerCase();

  if (!subcommand || subcommand === 'view') {
    const current = getPrefix(guildId);
    await message.reply(`Current prefix: \`${current}\`\nUse \`${current}prefix set <new>\` to change it.`);
    return;
  }

  if (subcommand === 'set') {
    const newPrefix = args.split(/\s+/).slice(1).join(' ');
    if (!newPrefix || newPrefix.length > 3) {
      await message.reply('Prefix must be 1-3 characters.');
      return;
    }
    setPrefix(guildId, newPrefix);
    await message.reply(`Prefix changed to \`${newPrefix}\``);
    return;
  }

  await message.reply(`Usage: \`${getPrefix(guildId)}prefix [view|set <prefix>]\``);
}

export { handlePrefixCommand };
export default handlePrefixCommand;
