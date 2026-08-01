import { findGuild } from '../../bridge.js';
import client from '../../core/client.js';
import stateManager from '../../core/state.js';
import { styledEmbed, trimTo } from '../../core/embeds.js';
import {
  normalizeStaffWingId, staffWingNameFor, inferredStaffWingId,
  staffRoleHierarchyIds, memberHasAnyCachedRole, memberHasPermission
} from '../../core/permissions.js';
import {
  parseBreakDuration, performancePlanStatusLabel, performancePlanEmbed,
  memberCanManagePerformancePlans, performancePlanTargetMember
} from './shared.js';

async function pplanStart(author, targetUser, guildId, reason, goals, durationText, wingOpt, guild) {
  const durationMs = parseBreakDuration(durationText);
  if (!durationMs) return { ok: false, message: 'Use a due duration like `3d`, `1 week`, or `12h`.' };

  const member = await performancePlanTargetMember({ guildId, guild, client }, targetUser);
  if (!member) return { ok: false, message: 'That user is not a configured staff member.' };

  const inferredWing = wingOpt
    ? { wingId: normalizeStaffWingId(wingOpt), ambiguous: false }
    : inferredStaffWingId(member);
  if (inferredWing.ambiguous) return { ok: false, message: `${targetUser.tag} has roles in multiple staff wings. Use the optional wing field to choose which wing this plan applies to.` };
  const wingId = inferredWing.wingId;
  if (!wingId) return { ok: false, message: "I could not detect that staff member's wing." };

  const ppState = globalThis.__HALLOWS_PERFORMANCE_PLAN_STATE__ || {};
  if (ppState.plansByUserId?.[targetUser.id]?.status === 'active') return { ok: false, message: `${targetUser.tag} already has an active performance plan.` };

  const now = Date.now();
  const plan = {
    userId: targetUser.id, userTag: targetUser.tag, guildId, wingId,
    status: 'active', startedByUserId: author.id, startedByTag: author.tag,
    startedAt: now, dueAt: now + durationMs, reason, goals, notes: []
  };
  ppState.plansByUserId = ppState.plansByUserId || {};
  ppState.plansByUserId[targetUser.id] = plan;
  if (typeof globalThis.__HALLOWS_SAVE_PERFORMANCE_PLAN_STATE__ === 'function') {
    await globalThis.__HALLOWS_SAVE_PERFORMANCE_PLAN_STATE__();
  }

  await targetUser.send({
    embeds: [styledEmbed('Performance Plan Started', [
      `A performance plan has been started for you in the **${staffWingNameFor(wingId)}** wing.`,
      `**Due:** <t:${Math.floor(plan.dueAt / 1000)}:F>`,
      `**Reason:** ${trimTo(reason, 1000)}`,
      `**Goals:** ${trimTo(goals, 1000)}`
    ].join('\n'))],
    allowedMentions: { parse: [] }
  }).catch(() => null);

  return { ok: true, message: `Started a performance plan for ${targetUser.tag}.`, embed: performancePlanEmbed(plan, targetUser) };
}

async function checkStaffMember(guild, targetUser) {
  const member = guild ? await guild.members.fetch(targetUser.id).catch(() => null) : null;
  return member && memberHasAnyCachedRole(member, staffRoleHierarchyIds()) ? member : null;
}

async function pplanView(targetUser, guild) {
  const member = await checkStaffMember(guild, targetUser);
  if (!member) return { ok: false, message: 'That user is not a configured staff member.' };

  const ppState = globalThis.__HALLOWS_PERFORMANCE_PLAN_STATE__ || {};
  const plan = ppState.plansByUserId?.[targetUser.id];
  if (!plan) return { ok: false, message: `${targetUser.tag} does not have a performance plan on record.` };

  return { ok: true, embed: performancePlanEmbed(plan, targetUser) };
}

async function pplanNote(author, targetUser, content, guild) {
  const member = await checkStaffMember(guild, targetUser);
  if (!member) return { ok: false, message: 'That user is not a configured staff member.' };

  const ppState = globalThis.__HALLOWS_PERFORMANCE_PLAN_STATE__ || {};
  const plan = ppState.plansByUserId?.[targetUser.id];
  if (!plan || plan.status !== 'active') return { ok: false, message: `${targetUser.tag} does not have an active performance plan.` };

  plan.notes ||= [];
  plan.notes.push({ authorUserId: author.id, authorTag: author.tag, createdAt: Date.now(), content });
  plan.notes = plan.notes.slice(-100);
  if (typeof globalThis.__HALLOWS_SAVE_PERFORMANCE_PLAN_STATE__ === 'function') {
    await globalThis.__HALLOWS_SAVE_PERFORMANCE_PLAN_STATE__();
  }

  return { ok: true, message: `Added a note to ${targetUser.tag}'s performance plan.` };
}

async function pplanComplete(author, targetUser, result, note, guild) {
  const member = await checkStaffMember(guild, targetUser);
  if (!member) return { ok: false, message: 'That user is not a configured staff member.' };

  const ppState = globalThis.__HALLOWS_PERFORMANCE_PLAN_STATE__ || {};
  const plan = ppState.plansByUserId?.[targetUser.id];
  if (!plan || plan.status !== 'active') return { ok: false, message: `${targetUser.tag} does not have an active performance plan.` };

  plan.status = result;
  plan.completedByUserId = author.id;
  plan.completedByTag = author.tag;
  plan.completedAt = Date.now();
  plan.resultNote = note;
  if (typeof globalThis.__HALLOWS_SAVE_PERFORMANCE_PLAN_STATE__ === 'function') {
    await globalThis.__HALLOWS_SAVE_PERFORMANCE_PLAN_STATE__();
  }

  await targetUser.send({
    embeds: [styledEmbed('Performance Plan Updated', [
      `Your performance plan has been marked **${performancePlanStatusLabel(result)}**.`,
      `**Note:** ${trimTo(note, 1000)}`
    ].join('\n'))],
    allowedMentions: { parse: [] }
  }).catch(() => null);

  return { ok: true, message: `Marked ${targetUser.tag}'s performance plan as ${performancePlanStatusLabel(result)}.`, embed: performancePlanEmbed(plan, targetUser) };
}

async function pplanList(wingOpt) {
  const wingId = wingOpt ? normalizeStaffWingId(wingOpt) : null;
  const ppState = globalThis.__HALLOWS_PERFORMANCE_PLAN_STATE__ || {};
  const plans = Object.values(ppState.plansByUserId || {})
    .filter((plan) => plan.status === 'active')
    .filter((plan) => !wingId || plan.wingId === wingId)
    .sort((a, b) => a.dueAt - b.dueAt);
  const lines = plans.map((plan) =>
    `- <@${plan.userId}> ${staffWingNameFor(plan.wingId)} due <t:${Math.floor(plan.dueAt / 1000)}:R>`
  );

  return styledEmbed('Active Performance Plans', lines.length ? trimTo(lines.join('\n'), 3900) : 'No active performance plans.');
}

async function handleSlashCommand(interaction) {
  const allowed = await memberCanManagePerformancePlans(interaction);
  if (!allowed) {
    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'start') {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true).trim();
    const goals = interaction.options.getString('goals', true).trim();
    const durationText = interaction.options.getString('due', true).trim();
    const wing = interaction.options.getString('wing');

    await interaction.deferReply({ ephemeral: true });
    const guild = await findGuild();
    const result = await pplanStart(interaction.user, targetUser, interaction.guildId, reason, goals, durationText, wing, guild);
    if (!result.ok) { await interaction.editReply('nuuu'); return; }
    const _sr = result.embed ? stateManager.getGuildSetting(interaction.guildId, 'success_response', '👍') || '👍' : result.message;
    await interaction.editReply({ content: _sr, embeds: result.embed ? [result.embed] : [], allowedMentions: { parse: [] } });
    return;
  }

  if (subcommand === 'view') {
    const targetUser = interaction.options.getUser('user', true);
    const member = await performancePlanTargetMember(interaction, targetUser);
    if (!member) { await interaction.reply({ content: 'That user is not a configured staff member.', ephemeral: true }); return; }

    const ppState = globalThis.__HALLOWS_PERFORMANCE_PLAN_STATE__ || {};
    const plan = ppState.plansByUserId?.[targetUser.id];
    if (!plan) { await interaction.reply({ content: `${targetUser.tag} does not have a performance plan on record.`, ephemeral: true }); return; }

    await interaction.reply({ embeds: [performancePlanEmbed(plan, targetUser)], ephemeral: true, allowedMentions: { parse: [] } });
    return;
  }

  if (subcommand === 'note') {
    const targetUser = interaction.options.getUser('user', true);
    const member = await performancePlanTargetMember(interaction, targetUser);
    if (!member) { await interaction.reply({ content: 'That user is not a configured staff member.', ephemeral: true }); return; }

    const content = interaction.options.getString('note', true).trim();
    const ppState = globalThis.__HALLOWS_PERFORMANCE_PLAN_STATE__ || {};
    const plan = ppState.plansByUserId?.[targetUser.id];
    if (!plan || plan.status !== 'active') { await interaction.reply({ content: `${targetUser.tag} does not have an active performance plan.`, ephemeral: true }); return; }

    plan.notes ||= [];
    plan.notes.push({ authorUserId: interaction.user.id, authorTag: interaction.user.tag, createdAt: Date.now(), content });
    plan.notes = plan.notes.slice(-100);
    if (typeof globalThis.__HALLOWS_SAVE_PERFORMANCE_PLAN_STATE__ === 'function') {
      await globalThis.__HALLOWS_SAVE_PERFORMANCE_PLAN_STATE__();
    }

    await interaction.reply({ content: `Added a note to ${targetUser.tag}'s performance plan.`, ephemeral: true });
    return;
  }

  if (subcommand === 'complete') {
    const targetUser = interaction.options.getUser('user', true);
    const member = await performancePlanTargetMember(interaction, targetUser);
    if (!member) { await interaction.reply({ content: 'That user is not a configured staff member.', ephemeral: true }); return; }

    const result = interaction.options.getString('result', true);
    const note = interaction.options.getString('note', true).trim();
    const ppState = globalThis.__HALLOWS_PERFORMANCE_PLAN_STATE__ || {};
    const plan = ppState.plansByUserId?.[targetUser.id];
    if (!plan || plan.status !== 'active') { await interaction.reply({ content: `${targetUser.tag} does not have an active performance plan.`, ephemeral: true }); return; }

    plan.status = result;
    plan.completedByUserId = interaction.user.id;
    plan.completedByTag = interaction.user.tag;
    plan.completedAt = Date.now();
    plan.resultNote = note;
    if (typeof globalThis.__HALLOWS_SAVE_PERFORMANCE_PLAN_STATE__ === 'function') {
      await globalThis.__HALLOWS_SAVE_PERFORMANCE_PLAN_STATE__();
    }

    await targetUser.send({
      embeds: [styledEmbed('Performance Plan Updated', [
        `Your performance plan has been marked **${performancePlanStatusLabel(result)}**.`,
        `**Note:** ${trimTo(note, 1000)}`
      ].join('\n'))],
      allowedMentions: { parse: [] }
    }).catch(() => null);

    await interaction.reply({ content: `Marked ${targetUser.tag}'s performance plan as ${performancePlanStatusLabel(result)}.`, embeds: [performancePlanEmbed(plan, targetUser)], ephemeral: true, allowedMentions: { parse: [] } });
    return;
  }

  if (subcommand === 'list') {
    const wing = interaction.options.getString('wing');
    const embed = await pplanList(wing);
    await interaction.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
  }
}

async function handlePrefixCommand(message, args, guildId) {
  if (!message.member || !memberHasPermission(message.member, 'staff.performancePlans')) {
    await message.reply('You do not have permission to use this command.');
    return;
  }

  const parts = args.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase() || '';
  const rest = parts.slice(1);

  if (subcommand === 'start') {
    if (rest.length < 4) { await message.reply('Usage: `?pplan start <@user> <reason> / <goals> / <due> [wing]`'); return; }
    const userId = rest[0].replace(/[<@!>]/g, '');
    let targetUser;
    try { targetUser = await message.client.users.fetch(userId); } catch { await message.reply('I could not find that user.'); return; }
    const combined = rest.slice(1).join(' ');
    const parts = combined.split('/').map((s) => s.trim());
    const reason = parts[0] || '';
    const goals = parts[1] || '';
    const durationText = parts[2] || '';
    const wing = parts[3] || null;
    if (!reason || !goals || !durationText) { await message.reply('Usage: `?pplan start <@user> <reason> / <goals> / <due> [wing]`'); return; }
    const guild = await findGuild();
    const result = await pplanStart(message.author, targetUser, message.guildId, reason, goals, durationText, wing, guild);
    if (!result.ok) { await message.channel.send('nuuu'); return; }
    const _sr2 = result.embed ? stateManager.getGuildSetting(guildId, 'success_response', '👍') || '👍' : result.message;
    await message.channel.send({ content: _sr2, embeds: result.embed ? [result.embed] : [], allowedMentions: { parse: [] } });
    return;
  }

  if (subcommand === 'view') {
    if (!rest.length) { await message.reply('Usage: `?pplan view <@user>`'); return; }
    const userId = rest[0].replace(/[<@!>]/g, '');
    let targetUser;
    try { targetUser = await message.client.users.fetch(userId); } catch { await message.reply('I could not find that user.'); return; }
    const result = await pplanView(targetUser, message.guild);
    if (!result.ok) { await message.channel.send(result.message); return; }
    await message.channel.send({ embeds: [result.embed], allowedMentions: { parse: [] } });
    return;
  }

  if (subcommand === 'note') {
    if (rest.length < 2) { await message.reply('Usage: `?pplan note <@user> <content>`'); return; }
    const userId = rest[0].replace(/[<@!>]/g, '');
    let targetUser;
    try { targetUser = await message.client.users.fetch(userId); } catch { await message.reply('I could not find that user.'); return; }
    const content = rest.slice(1).join(' ');
    const result = await pplanNote(message.author, targetUser, content, message.guild);
    if (!result.ok) { await message.channel.send(result.message); return; }
    await message.channel.send(result.message);
    return;
  }

  if (subcommand === 'complete') {
    if (rest.length < 3) { await message.reply('Usage: `?pplan complete <@user> <result> <note>`'); return; }
    const userId = rest[0].replace(/[<@!>]/g, '');
    let targetUser;
    try { targetUser = await message.client.users.fetch(userId); } catch { await message.reply('I could not find that user.'); return; }
    const result = rest[1].toLowerCase();
    const note = rest.slice(2).join(' ');
    const compResult = await pplanComplete(message.author, targetUser, result, note, message.guild);
    if (!compResult.ok) { await message.channel.send(compResult.message); return; }
    await message.channel.send({ content: compResult.message, embeds: [compResult.embed], allowedMentions: { parse: [] } });
    return;
  }

  if (subcommand === 'list') {
    const wing = rest.length ? rest[0] : null;
    const embed = await pplanList(wing);
    await message.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    return;
  }

  await message.reply('Usage: `?pplan start|view|note|complete|list ...`');
}

export { handlePrefixCommand, handleSlashCommand };
export default handlePrefixCommand;