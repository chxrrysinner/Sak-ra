import config from '../../core/config.js';
import { styledEmbed, trimTo } from '../../core/embeds.js';
import { staffRoleHierarchyIds, memberHasAnyRole, memberHasPermission } from '../../core/permissions.js';
import { strikeRecordsFor } from './shared.js';

const ROLE_POLICY_FILE =       config.paths.rolePolicyFile || './role-policy.json';

async function strikesEmbedFor(targetUser) {
  const strikes = strikeRecordsFor(targetUser.id);
  const description = strikes.length
    ? trimTo(strikes.map((strike, index) => [
      `**Strike ${index + 1}**`,
      `**Reason:** ${strike.reason}`
    ].join('\n')).join('\n\n'), 3900)
    : 'This user does not have any strikes.';
  return styledEmbed(`${targetUser.username}'s Strikes`, description);
}

async function handleSlashCommand(interaction) {
  const hierarchyRoleIds = staffRoleHierarchyIds();
  if (!hierarchyRoleIds.length) {
    await interaction.reply({ content: `The strikes command is missing staffHierarchy roles in ${ROLE_POLICY_FILE}.`, ephemeral: true });
    return;
  }

  const requestedUser = interaction.options.getUser('user');
  const checkingAnotherUser = requestedUser && requestedUser.id !== interaction.user.id;
  const canCheckOthers = interaction.member && memberHasPermission(interaction.member, 'staff.strikesOthers');
  if (checkingAnotherUser && !canCheckOthers) {
    await interaction.reply({ content: '\u200b', ephemeral: true }).catch(() => {});
    return;
  }

  const canCheckOwnStrikes = await memberHasAnyRole(interaction.guildId, interaction.user.id, hierarchyRoleIds);
  if (!checkingAnotherUser && !canCheckOwnStrikes && !canCheckOthers) {
    await interaction.reply({ content: '\u200b', ephemeral: true }).catch(() => {});
    return;
  }

  const targetUser = requestedUser || interaction.user;
  const embed = await strikesEmbedFor(targetUser);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handlePrefixCommand(message, args, guildId) {
  const hierarchyRoleIds = staffRoleHierarchyIds();
  if (!hierarchyRoleIds.length) {
    await message.reply(`The strikes command is missing staffHierarchy roles in ${ROLE_POLICY_FILE}.`);
    return;
  }

  let targetUser = message.author;
  if (args.length > 0) {
    const canCheckOthers = message.member && memberHasPermission(message.member, 'staff.strikesOthers');
    if (!canCheckOthers) return;
    const first = args.trim().split(/\s+/)[0] || '';
    const userId = first.replace(/[<@!>]/g, '');
    try { targetUser = await message.client.users.fetch(userId); } catch {
      await message.reply('I could not find that user.');
      return;
    }
  }

  const canCheckOwn = await memberHasAnyRole(guildId, targetUser.id, hierarchyRoleIds);
  if (targetUser.id === message.author.id && !canCheckOwn && !memberHasPermission(message.member, 'staff.strikesOthers')) return;

  const embed = await strikesEmbedFor(targetUser);
  await message.channel.send({ embeds: [embed] });
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
