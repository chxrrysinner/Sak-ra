import stateManager from '../../core/state.js';
import { findGuild } from '../../bridge.js';
import client from '../../core/client.js';
import { styledEmbed, trimTo } from '../../core/embeds.js';
import { staffRoleHierarchyIds, memberHasPermission } from '../../core/permissions.js';
import { strikeRecordsFor } from './shared.js';

const ROLE_POLICY_FILE = process.env.ROLE_POLICY_FILE || './role-policy.json';

async function giveStrike(author, targetUser, reason, guild) {
  const hierarchyRoleIds = staffRoleHierarchyIds();

  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    return { ok: false, message: 'I could not find that user in this server.' };
  }

  const isStaffMember = hierarchyRoleIds.some((roleId) => targetMember.roles.cache.has(roleId));
  if (!isStaffMember) {
    return { ok: false, message: `${targetUser.username} does not have a configured staff role.` };
  }

  const strikes = strikeRecordsFor(targetUser.id);
  strikes.push({ reason });
  const state = globalThis.__HALLOWS_STATE__ || {};
  state.strikesByUserId = state.strikesByUserId || {};
  state.strikesByUserId[targetUser.id] = strikes;
  if (typeof globalThis.__HALLOWS_SAVE_STATE__ === 'function') {
    await globalThis.__HALLOWS_SAVE_STATE__();
  }

  await targetUser.send({
    content: [
      'You have been given a strike.',
      '',
      `**Reason:** ${reason}`,
      '',
      'If you think this is a mistake, please open a ticket under the "Internals" section.'
    ].join('\n'),
    allowedMentions: { parse: [] }
  }).catch(() => null);

  return { ok: true, message: `Gave ${targetUser.tag} a strike. They now have ${strikes.length} strike${strikes.length === 1 ? '' : 's'}.` };
}

async function handleSlashCommand(interaction) {
  const allowed = interaction.member && memberHasPermission(interaction.member, 'staff.strike');
  if (!allowed) {
    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    return;
  }

  const hierarchyRoleIds = staffRoleHierarchyIds();
  if (!hierarchyRoleIds.length) {
    await interaction.reply({ content: `The strike command is missing staffHierarchy roles in ${ROLE_POLICY_FILE}.`, ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);
  const guild = await findGuild();
  const result = await giveStrike(interaction.user, targetUser, reason, guild);
  const _sr = stateManager.getGuildSetting(interaction.guildId, 'success_response', '👍') || '👍'; await interaction.editReply(_sr);
}

async function handlePrefixCommand(message, args, guildId) {
  if (!message.member || !memberHasPermission(message.member, 'staff.strike')) {
    await message.reply('You do not have permission to use this command.');
    return;
  }

  const hierarchyRoleIds = staffRoleHierarchyIds();
  if (!hierarchyRoleIds.length) {
    await message.reply(`The strike command is missing staffHierarchy roles in ${ROLE_POLICY_FILE}.`);
    return;
  }

  if (args.length < 2) {
    await message.reply('Usage: `?strike <@user> <reason>`');
    return;
  }

  const first = args.trim().split(/\s+/)[0] || '';
  const userId = first.replace(/[<@!>]/g, '');
  let targetUser;
  try { targetUser = await message.client.users.fetch(userId); } catch {
    await message.reply('I could not find that user.');
    return;
  }

  const reason = args.slice(1).join(' ');
  const guild = await findGuild();
  const result = await giveStrike(message.author, targetUser, reason, guild);
  const _sr = stateManager.getGuildSetting(guildId, 'success_response', '👍') || '👍'; await message.channel.send(_sr);
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;
