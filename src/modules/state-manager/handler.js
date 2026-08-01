import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import stateManager from '../../core/state.js';
import { styledEmbed } from '../../core/embeds.js';

const sessionOwners = new Map();

const CATEGORIES = [
  { id: 'breaks', label: 'staff breaks', emoji: '☕' },
  { id: 'strikes', label: 'strike records', emoji: '⚠️' },
  { id: 'pban', label: 'pban proposals', emoji: '🔨' },
  { id: 'banprofiles', label: 'ban profiles', emoji: '📁' },
  { id: 'tempbans', label: 'tempbans', emoji: '🔒' }
];

function mainMenuEmbed() {
  const lines = CATEGORIES.map(c => `${c.emoji} **${c.label}**`);
  lines.push('', 'select a category below to view entries, or flush everything.');
  return styledEmbed('State Manager', lines.join('\n'));
}

function mainMenuRows() {
  const rows = [];
  for (let i = 0; i < CATEGORIES.length; i += 5) {
    const chunk = CATEGORIES.slice(i, i + 5);
    rows.push(new ActionRowBuilder().addComponents(
      chunk.map(c => new ButtonBuilder()
        .setCustomId(`state_show_category:${c.id}`)
        .setLabel(c.emoji + ' ' + c.label)
        .setStyle(ButtonStyle.Secondary))
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('state_flush_all')
      .setLabel('🗑️ flush everything')
      .setStyle(ButtonStyle.Danger)
  ));
  return rows;
}

async function getCategoryData(categoryId) {
  const data = {};
  switch (categoryId) {
    case 'breaks': {
      const brState = globalThis.__HALLOWS_BREAK_STATE__ || {};
      data.active = Object.entries(brState.activeByUserId || {}).map(([uid, b]) => ({
        id: uid,
        label: `active — ${uid.slice(0, 8)}`,
        summary: `<@${uid}> — ${b.reason ? b.reason.slice(0, 60) : 'no reason'}`,
        detail: `ends <t:${Math.floor((b.endsAt || 0) / 1000)}:R>`
      }));
      data.pending = Object.entries(brState.requestsByUserId || {}).map(([uid, r]) => ({
        id: uid,
        label: `pending — ${uid.slice(0, 8)}`,
        summary: `<@${uid}> — ${r.reason ? r.reason.slice(0, 60) : 'no reason'}`,
        detail: `${r.durationText || '?'} pending`
      }));
      break;
    }
    case 'strikes': {
      const state = globalThis.__HALLOWS_STATE__ || {};
      data.records = Object.entries(state.strikesByUserId || {}).map(([uid, strikes]) => ({
        id: uid,
        label: `${uid.slice(0, 8)} — ${strikes.length}`,
        summary: `<@${uid}> — ${strikes.length} strike${strikes.length === 1 ? '' : 's'}`,
        detail: strikes.map(s => s.reason?.slice(0, 40)).join('; ').slice(0, 100)
      }));
      break;
    }
    case 'pban': {
      const state = globalThis.__HALLOWS_STATE__ || {};
      data.proposals = Object.entries(state.pbanProposalsByMessageId || {}).map(([mid, p]) => ({
        id: mid,
        label: `${p.targetUserId.slice(0, 8)} — ${p.status || '?'}`,
        summary: `<@${p.targetUserId}> — ${p.status || 'unknown'}`,
        detail: p.reason?.slice(0, 60) || ''
      }));
      break;
    }
    case 'banprofiles': {
      const state = globalThis.__HALLOWS_STATE__ || {};
      data.profiles = Object.entries(state.banProfilesByGuildUser || {}).map(([key, bp]) => ({
        id: key,
        label: `${bp.userId.slice(0, 8)} — ${(bp.proofUrls || []).length}p`,
        summary: `<@${bp.userId}> — ${(bp.proofUrls || []).length} proof(s)`,
        detail: bp.guildId ? `guild: ${bp.guildId.slice(0, 8)}` : ''
      }));
      break;
    }
    case 'tempbans': {
      const gId = process.env.GUILD_ID;
      if (gId) {
        const rows = stateManager.getPendingTempbans(gId);
        if (rows) {
          data.bans = rows.map(b => ({
            id: b.user_id,
            label: `${b.user_id.slice(0, 8)}`,
            summary: `<@${b.user_id}>`,
            detail: `expires <t:${Math.floor(new Date(b.expires_at).getTime() / 1000)}:R>`
          }));
        }
      }
      break;
    }
  }
  return data;
}

function allEntries(data) {
  return Object.values(data).flat();
}

function categoryEmbed(categoryId, data, page = 0) {
  const cat = CATEGORIES.find(c => c.id === categoryId);
  if (!cat) return styledEmbed('Unknown', 'unknown category.');

  const entries = allEntries(data);
  const total = entries.length;
  const perPage = 10;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = page * perPage;
  const pageEntries = entries.slice(start, start + perPage);

  const lines = [];
  if (total === 0) {
    lines.push('no entries found.');
  } else {
    lines.push(`**total:** ${total}`, '');
    for (const e of pageEntries) {
      lines.push(`• ${e.summary}`);
      if (e.detail) lines.push(`  └ ${e.detail}`);
    }
    if (totalPages > 1) lines.push('', `page ${page + 1}/${totalPages}`);
  }
  if (total > 0) lines.push('', 'use the dropdown below to flush a single entry.');

  return styledEmbed(`${cat.emoji} ${cat.label}`, lines.join('\n'));
}

function categoryRows(categoryId, data, page = 0) {
  const rows = [];
  const entries = allEntries(data);
  const total = entries.length;

  if (total > 0) {
    const options = entries.slice(page * 10, page * 10 + 10).map(e => ({
      label: e.label || e.id.slice(0, 80),
      value: `${categoryId}:${e.id}`,
      description: (e.detail || e.summary || '').replace(/<[^>]+>/g, '').slice(0, 80)
    }));
    if (options.length > 0) {
      rows.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('state_select_entry')
          .setPlaceholder('select an entry to flush...')
          .addOptions(options)
      ));
    }
  }

  const btnRow = new ActionRowBuilder();
  if (page > 0) {
    btnRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`state_page_category:${categoryId}:${page - 1}`)
        .setLabel('◀ prev')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  btnRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`state_flush_category:${categoryId}`)
      .setLabel('🗑️ flush all')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`state_refresh_category:${categoryId}:${page}`)
      .setLabel('🔄 refresh')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('state_back')
      .setLabel('◀ back')
      .setStyle(ButtonStyle.Secondary)
  );
  rows.push(btnRow);
  return rows;
}

async function flushCategory(categoryId) {
  switch (categoryId) {
    case 'breaks': {
      const brState = globalThis.__HALLOWS_BREAK_STATE__ || {};
      const count = Object.keys(brState.activeByUserId || {}).length + Object.keys(brState.requestsByUserId || {}).length;
      brState.activeByUserId = {};
      brState.requestsByUserId = {};
      if (typeof globalThis.__HALLOWS_SAVE_BREAK_STATE__ === 'function') await globalThis.__HALLOWS_SAVE_BREAK_STATE__();
      return `flushed ${count} staff break(s).`;
    }
    case 'strikes': {
      const state = globalThis.__HALLOWS_STATE__ || {};
      const count = Object.keys(state.strikesByUserId || {}).length;
      state.strikesByUserId = {};
      if (typeof globalThis.__HALLOWS_SAVE_STATE__ === 'function') await globalThis.__HALLOWS_SAVE_STATE__();
      return `flushed ${count} strike record(s).`;
    }
    case 'pban': {
      const state = globalThis.__HALLOWS_STATE__ || {};
      const count = Object.keys(state.pbanProposalsByMessageId || {}).length;
      state.pbanProposalsByMessageId = {};
      if (typeof globalThis.__HALLOWS_SAVE_STATE__ === 'function') await globalThis.__HALLOWS_SAVE_STATE__();
      return `flushed ${count} pban proposal(s).`;
    }
    case 'banprofiles': {
      const state = globalThis.__HALLOWS_STATE__ || {};
      const count = Object.keys(state.banProfilesByGuildUser || {}).length;
      state.banProfilesByGuildUser = {};
      if (typeof globalThis.__HALLOWS_SAVE_STATE__ === 'function') await globalThis.__HALLOWS_SAVE_STATE__();
      return `flushed ${count} ban profile(s).`;
    }
    case 'tempbans': {
      const gId = process.env.GUILD_ID;
      if (gId) {
        const rows = stateManager.getPendingTempbans(gId);
        for (const b of (rows || [])) stateManager.removeTempban(gId, b.user_id);
        return `flushed ${rows?.length || 0} tempban(s).`;
      }
      return 'no guild configured.';
    }
  }
  return 'unknown category.';
}

async function flushOneEntry(categoryId, entryId) {
  switch (categoryId) {
    case 'breaks': {
      const brState = globalThis.__HALLOWS_BREAK_STATE__ || {};
      let found = false;
      if (brState.activeByUserId?.[entryId]) { delete brState.activeByUserId[entryId]; found = true; }
      if (brState.requestsByUserId?.[entryId]) { delete brState.requestsByUserId[entryId]; found = true; }
      if (found && typeof globalThis.__HALLOWS_SAVE_BREAK_STATE__ === 'function') await globalThis.__HALLOWS_SAVE_BREAK_STATE__();
      return found ? `flushed break for \`${entryId}\`.` : `entry \`${entryId}\` not found.`;
    }
    case 'strikes': {
      const state = globalThis.__HALLOWS_STATE__ || {};
      if (state.strikesByUserId?.[entryId]) {
        delete state.strikesByUserId[entryId];
        if (typeof globalThis.__HALLOWS_SAVE_STATE__ === 'function') await globalThis.__HALLOWS_SAVE_STATE__();
        return `flushed strikes for \`${entryId}\`.`;
      }
      return `entry \`${entryId}\` not found.`;
    }
    case 'pban': {
      const state = globalThis.__HALLOWS_STATE__ || {};
      if (state.pbanProposalsByMessageId?.[entryId]) {
        delete state.pbanProposalsByMessageId[entryId];
        if (typeof globalThis.__HALLOWS_SAVE_STATE__ === 'function') await globalThis.__HALLOWS_SAVE_STATE__();
        return `flushed pban proposal \`${entryId.slice(0, 12)}\`.`;
      }
      return `entry \`${entryId.slice(0, 12)}\` not found.`;
    }
    case 'banprofiles': {
      const state = globalThis.__HALLOWS_STATE__ || {};
      if (state.banProfilesByGuildUser?.[entryId]) {
        delete state.banProfilesByGuildUser[entryId];
        if (typeof globalThis.__HALLOWS_SAVE_STATE__ === 'function') await globalThis.__HALLOWS_SAVE_STATE__();
        return `flushed ban profile \`${entryId}\`.`;
      }
      return `entry \`${entryId}\` not found.`;
    }
    case 'tempbans': {
      const gId = process.env.GUILD_ID;
      if (gId) {
        stateManager.removeTempban(gId, entryId);
        return `flushed tempban for \`${entryId}\`.`;
      }
      return 'no guild configured.';
    }
  }
  return 'unknown category.';
}

async function flushAll() {
  for (const cat of CATEGORIES) await flushCategory(cat.id);
}

function isSessionOwner(interaction) {
  const ownerId = sessionOwners.get(interaction.message?.id);
  return ownerId && interaction.user?.id === ownerId;
}

async function refreshCategoryData(categoryId, page) {
  const data = await getCategoryData(categoryId);
  return { embeds: [categoryEmbed(categoryId, data, page)], components: categoryRows(categoryId, data, page) };
}

export default async function handlePrefixCommand(message, args, guildId) {
  try {
    if (!guildId) { await message.reply('nuuu'); return; }

    const parts = args.trim().split(/\s+/);

    if (parts[0]?.toLowerCase() === 'flush') {
      const categoryId = parts[1];
      const entryId = parts.slice(2).join(' ');

      if (!categoryId || !CATEGORIES.find(c => c.id === categoryId)) {
        await message.reply('usage: `?state flush <category> [entry_id]`\ncategories: ' + CATEGORIES.map(c => c.id).join(', '));
        return;
      }

      if (entryId) {
        const msg = await flushOneEntry(categoryId, entryId);
        await message.reply(msg);
      } else {
        const msg = await flushCategory(categoryId);
        await message.reply(msg);
      }
      return;
    }

    const sent = await message.channel.send({
      embeds: [mainMenuEmbed()],
      components: mainMenuRows()
    });
    sessionOwners.set(sent.id, message.author.id);
  } catch (error) {
    console.error('?state error:', error?.message || error);
    await message.channel.send('nuuu').catch(() => null);
  }
}

export async function handleDashboardButton(interaction) {
  const sessionOwner = sessionOwners.get(interaction.message?.id);
  if (sessionOwner && interaction.user?.id !== sessionOwner) return;
  try {
    const customId = interaction.customId;
    const parts = customId.split(':');

    if (customId === 'state_back') {
      await interaction.update({ embeds: [mainMenuEmbed()], components: mainMenuRows() });
      return;
    }

    if (customId === 'state_flush_all') {
      await interaction.deferReply({ ephemeral: true });
      await flushAll();
      await interaction.editReply('🗑️ flushed all persistent state.');
      return;
    }

    if (parts[0] === 'state_flush_category') {
      const categoryId = parts[1];
      await interaction.deferReply({ ephemeral: true });
      const msg = await flushCategory(categoryId);
      await interaction.editReply(msg);
      const payload = await refreshCategoryData(categoryId, 0);
      await interaction.message.edit(payload).catch(() => null);
      return;
    }

    if (parts[0] === 'state_show_category') {
      const categoryId = parts[1];
      const payload = await refreshCategoryData(categoryId, 0);
      await interaction.update(payload);
      return;
    }

    if (parts[0] === 'state_page_category') {
      const categoryId = parts[1];
      const page = parseInt(parts[2], 10) || 0;
      const payload = await refreshCategoryData(categoryId, page);
      await interaction.update(payload);
      return;
    }

    if (parts[0] === 'state_refresh_category') {
      const categoryId = parts[1];
      const page = parseInt(parts[2], 10) || 0;
      const payload = await refreshCategoryData(categoryId, page);
      await interaction.update(payload);
      return;
    }
  } catch (error) {
    console.error('state button error:', error?.message || error);
    try { await interaction.reply({ content: 'nuuu', ephemeral: true }); } catch {}
  }
}

export async function handleComponentInteraction(interaction) {
  const sessionOwner = sessionOwners.get(interaction.message?.id);
  if (sessionOwner && interaction.user?.id !== sessionOwner) return;
  try {
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'state_select_entry') return;

    const [categoryId, ...rest] = interaction.values[0].split(':');
    const entryId = rest.join(':');

    await interaction.deferReply({ ephemeral: true });
    const msg = await flushOneEntry(categoryId, entryId);
    await interaction.editReply(msg);

    const pageStr = interaction.message.embeds?.[0]?.description?.match(/page (\d+)\/(\d+)/)?.[1];
    const page = parseInt(pageStr, 10) ? parseInt(pageStr, 10) - 1 : 0;
    const payload = await refreshCategoryData(categoryId, page);
    await interaction.message.edit(payload).catch(() => null);
  } catch (error) {
    console.error('state select error:', error?.message || error);
    try { await interaction.reply({ content: 'nuuu', ephemeral: true }); } catch {}
  }
}
