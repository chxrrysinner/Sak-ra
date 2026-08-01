import stateManager from '../../core/state.js';
import { getPrefix, setPrefix } from '../../core/prefix.js';
import { memberHasPermission, FAKE_PERMISSION_FLAGS, memberIsOwner, staffRoleHierarchyIds } from '../../core/permissions.js';
import config, { setOverride } from '../../core/config.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import logger from '../../core/logger.js';
import fs from 'node:fs';
import registry from '../../core/registry.js';
import client from '../../core/client.js';

const dashboardSessions = new Map();
const dashboardTimeouts = new Map();
const DASHBOARD_TTL = 10 * 60 * 1000;

async function autoExpireSession(messageId) {
  const entry = dashboardSessions.get(messageId);
  dashboardSessions.delete(messageId);
  dashboardTimeouts.delete(messageId);
  if (!entry?.channelId) return;
  try {
    const channel = await client.channels.fetch(entry.channelId).catch(() => null);
    if (!channel) return;
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (!msg?.editable) return;
    await msg.edit({
      embeds: [new EmbedBuilder().setColor(0xc67a3a).setDescription('ur too slow lol make another db').setTimestamp()],
      components: []
    }).catch(() => null);
  } catch {}
}

function scheduleAutoExpire(messageId) {
  if (dashboardTimeouts.has(messageId)) clearTimeout(dashboardTimeouts.get(messageId));
  const tid = setTimeout(() => autoExpireSession(messageId), DASHBOARD_TTL);
  dashboardTimeouts.set(messageId, tid);
}

function touchSession(messageId, userId, channelId) {
  if (!messageId) return;
  const existing = dashboardSessions.get(messageId);
  dashboardSessions.set(messageId, {
    userId,
    channelId: channelId || existing?.channelId,
    lastActivity: Date.now()
  });
  scheduleAutoExpire(messageId);
}

async function expireSession(interaction) {
  const msgId = interaction.message?.id;
  if (!msgId) return false;

  const session = dashboardSessions.get(msgId);
  if (!session || (Date.now() - session.lastActivity) > DASHBOARD_TTL) {
    dashboardSessions.delete(msgId);
    dashboardTimeouts.delete(msgId);
    await interaction.deferUpdate().catch(() => {});
    try {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xc67a3a).setDescription('ur too slow lol make another db').setTimestamp()],
        components: []
      });
    } catch {}
    return true;
  }

  if (session.userId !== interaction.user.id) {
    await interaction.reply({ content: 'nuuu', ephemeral: true }).catch(() => {});
    return true;
  }

  session.lastActivity = Date.now();
  scheduleAutoExpire(msgId);
  return false;
}

function mainPanel(guildId) {
  const prefix = getPrefix(guildId);
  const guild = globalThis.__HALLOWS_CLIENT__?.guilds?.cache?.get(guildId);
  const guildName = guild?.name || 'Server';
  const guildIcon = guild?.iconURL({ size: 64 }) || null;

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle(guildName)
    .setDescription('Hallows Dashboard\nPrefix: `' + prefix + '`\nNavigate using the buttons below.')
    .setTimestamp();
  if (guildIcon) embed.setThumbnail(guildIcon);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:channels').setLabel('📡 Channels').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:roles').setLabel('👤 Roles').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:hierarchy').setLabel('🏛 Hierarchy').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:permissions').setLabel('🔐 Permissions').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:moderation').setLabel('🛡 Moderation').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:security').setLabel('🔒 Security').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('dashboard:engagement').setLabel('🎮 Engagement').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dashboard:policies').setLabel('📋 Policies').setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:settings').setLabel('⚙ Settings').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:diagnostics').setLabel('🩺 Diagnostics').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row, row2, row3] };
}

function gs(guildId, key, fallback) {
  const val = stateManager.getGuildSetting(guildId, key, null);
  return val || fallback || null;
}

function channelsPanel(guildId) {
  const docChan = gs(guildId, 'DOCUMENTS_CHANNEL_ID');
  const modlogChan = stateManager.getModlogChannel(guildId);
  const pbanProp = gs(guildId, 'PBAN_PROPOSAL_CHANNEL_ID');
  const pbanLog = gs(guildId, 'PBAN_LOG_CHANNEL_ID');
  const breakChan = gs(guildId, 'BREAK_REQUEST_CHANNEL_ID');
  const autoMod = gs(guildId, 'ANTI_BOT_AUTOMOD_CHANNEL_ID');
  const jailChan = gs(guildId, 'jail_channel_id');

  const statsExcluded = gs(guildId, 'stats_excluded_channels', '[]');
  let statsExcludedStr;
  try { const ids = JSON.parse(statsExcluded); statsExcludedStr = ids.length ? ids.map((id) => '<#' + id + '>').join(', ') : 'None'; } catch { statsExcludedStr = 'None'; }

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('📡 Channel Configurations')
    .addFields(
      { name: 'Documents Evidence', value: docChan ? '<#' + docChan + '>' : 'Not set', inline: true },
      { name: 'Modlog Channel', value: modlogChan ? '<#' + modlogChan + '>' : 'Not set', inline: true },
      { name: 'PBAN Proposal', value: pbanProp ? '<#' + pbanProp + '>' : 'Not set', inline: true },
      { name: 'PBAN Log', value: pbanLog ? '<#' + pbanLog + '>' : 'Not set', inline: true },
      { name: 'Break Request', value: breakChan ? '<#' + breakChan + '>' : 'Not set', inline: true },
      { name: 'Automod Detection', value: autoMod ? '<#' + autoMod + '>' : 'Not set', inline: true },
      { name: 'Jail Channel', value: jailChan ? '<#' + jailChan + '>' : 'Not set', inline: true },
      { name: 'Stats Excluded', value: statsExcludedStr, inline: false }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:general:documents').setLabel('Documents').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:general:edit_modlog').setLabel('Modlog').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:general:edit_pban_prop').setLabel('PBAN Prop').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:general:edit_pban_log').setLabel('PBAN Log').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:general:edit_break_chan').setLabel('Break').setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:channels:set_automod').setLabel('Automod').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:channels:set_jail_channel').setLabel('Jail Chan').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:general:stats_exclude').setLabel('Stats Exc').setStyle(ButtonStyle.Secondary)
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row, row2, row3, row4] };
}

function rolesPanel(guildId) {
  const breakRole = gs(guildId, 'ON_BREAK_ROLE_ID');
  const jailRole = gs(guildId, 'jail_role_id');
  const demoExempt = gs(guildId, 'DEMOTE_EXEMPT_ROLES', '');
  const pbanProt = gs(guildId, 'PBAN_PROTECTED_ROLE_IDS', '');

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('👤 Role Configurations')
    .addFields(
      { name: 'On Break Role', value: breakRole ? '<@&' + breakRole + '>' : 'Not set', inline: true },
      { name: 'Jail Role', value: jailRole ? '<@&' + jailRole + '>' : 'Not set', inline: true },
      { name: 'Demote Exempt Roles', value: demoExempt ? demoExempt.split(',').map((id) => '<@&' + id.trim() + '>').join(', ') : 'Not set', inline: false },
      { name: 'PBAN Protected Roles', value: pbanProt ? pbanProt.split(',').map((id) => '<@&' + id.trim() + '>').join(', ') : 'Not set', inline: false }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:general:edit_break_role').setLabel('Break Role').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:roles:set_jail_role').setLabel('Jail Role').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:general:edit_demote').setLabel('Demote').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:general:edit_pban_prot').setLabel('PBAN Prot').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row, row2] };
}

function hierarchyPanel(guildId) {
  try {
    const wings = stateManager.getWings(guildId);
    const allFakePerms = stateManager.getAllFakePermissions(guildId);
    const fpsByRole = {};
    for (const fp of allFakePerms) {
      (fpsByRole[fp.role_id] ||= []).push(fp.permission_flag);
    }

    const embed = new EmbedBuilder()
      .setColor(0xc67a3a)
      .setTitle('Staff Management')
      .setDescription('Wings with roles and their fake permissions')
      .setTimestamp();

    if (!wings.length) {
      embed.setDescription('No wings configured. Click **Add Wing** to create one.');
    } else {
    const lines = wings.map((w) => {
      const roles = stateManager.getWingRoles(guildId, w.id);
      const categoryStr = w.category_id ? ' <#' + w.category_id + '>' : '';
      const roleStr = roles.length
        ? roles.map((r) => {
            const fps = fpsByRole[r.role_id] || [];
            const fpStr = fps.length ? ' `[' + fps.join(', ') + ']`' : '';
            return '  <@&' + r.role_id + '>' + (r.is_lead ? ' (lead)' : '') + ' rank ' + r.rank + fpStr;
          }).join('\n')
        : '  *No roles*';
      return '**' + (w.label || w.id) + '**' + categoryStr + '\n' + roleStr;
    });
    embed.setDescription(lines.join('\n\n'));
  }

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('dashboard:hierarchy:select')
      .setPlaceholder('Select a wing to edit')
      .addOptions(
        wings.length
          ? wings.map((w) => ({
              label: w.label || w.id,
              value: w.id,
              description: (w.description || '').slice(0, 100) || 'Edit this wing'
            }))
          : [{ label: 'No wings', value: '_none', description: 'Add a wing first' }]
      )
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:hierarchy:add').setLabel('Add Wing').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dashboard:hierarchy:reorder').setLabel('Reorder').setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

    return { embeds: [embed], components: [selectRow, row, row2] };
  } catch (error) {
    return { embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('Error').setDescription('Failed to load hierarchy: ' + error.message).setTimestamp()], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary))] };
  }
}

function hierarchyWingPanel(guildId, wingId) {
  const wing = stateManager.getWing(guildId, wingId);
  if (!wing) return hierarchyPanel(guildId);

  const roles = stateManager.getWingRoles(guildId, wingId);
  const allFakePerms = stateManager.getAllFakePermissions(guildId);
  const fpsByRole = {};
  for (const fp of allFakePerms) {
    (fpsByRole[fp.role_id] ||= []).push(fp.permission_flag);
  }

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Wing: ' + (wing.label || wingId))
    .addFields(
      { name: 'ID', value: wing.id, inline: true },
      { name: 'Prefix', value: wing.channel_prefix || 'none', inline: true },
      { name: 'Category', value: wing.category_id ? '<#' + wing.category_id + '>' : 'Not set', inline: true },
      { name: 'Description', value: wing.description || 'No description', inline: false }
    )
    .setTimestamp();

  if (roles.length) {
    const roleLines = roles.map((r) => {
      const fps = fpsByRole[r.role_id] || [];
      const fpStr = fps.length ? ' `[' + fps.join(', ') + ']`' : '';
      return '<@&' + r.role_id + '>' + (r.is_lead ? ' (lead)' : '') + ' rank ' + r.rank + fpStr;
    });
    embed.addFields({ name: 'Roles & Fake Perms (' + roles.length + ')', value: roleLines.join('\n').substring(0, 1000), inline: false });
  }

  const roleOptions = roles.length
    ? roles.map((r) => {
        const fps = fpsByRole[r.role_id] || [];
        const desc = (r.is_lead ? 'Lead, ' : '') + 'Rank ' + r.rank + (fps.length ? ', FP: ' + fps.join('/') : '');
        return {
          label: (r.label || r.role_id).slice(0, 100),
          value: r.role_id,
          description: desc.slice(0, 100)
        };
      })
    : [{ label: 'No roles', value: '_none', description: 'Add a role first' }];

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('dashboard:hierarchy:role_select:' + wingId)
      .setPlaceholder('Select a role to edit')
      .addOptions(roleOptions)
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:hierarchy:' + wingId + ':rename').setLabel('Rename').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:hierarchy:' + wingId + ':description').setLabel('Description').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:hierarchy:' + wingId + ':prefix').setLabel('Prefix').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:hierarchy:' + wingId + ':category').setLabel('Category').setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:hierarchy:' + wingId + ':role_add').setLabel('Add Role').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dashboard:hierarchy:' + wingId + ':delete').setLabel('Delete Wing').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('dashboard:hierarchy').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [selectRow, row, row2] };
}

function hierarchyRolePanel(guildId, wingId, roleId) {
  const wing = stateManager.getWing(guildId, wingId);
  const roles = stateManager.getWingRoles(guildId, wingId);
  const roleEntry = roles.find((r) => r.role_id === roleId);
  const allFakePerms = stateManager.getAllFakePermissions(guildId);
  const roleFps = allFakePerms.filter((fp) => fp.role_id === roleId).map((fp) => fp.permission_flag);

  const label = roleEntry ? roleEntry.label || 'Role: <@&' + roleId + '>' : 'Role: <@&' + roleId + '>';
  const fields = [
    { name: 'Wing', value: wing ? wing.label || wingId : wingId, inline: true },
    { name: 'Rank', value: roleEntry ? roleEntry.rank : '?', inline: true },
    { name: 'Lead', value: roleEntry?.is_lead ? 'Yes' : 'No', inline: true }
  ];

  if (roleFps.length) {
    fields.push({ name: 'Fake Permissions (' + roleFps.length + ')', value: '`' + roleFps.join('`, `') + '`', inline: false });
  } else {
    fields.push({ name: 'Fake Permissions', value: 'None', inline: false });
  }

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle(label)
    .addFields(fields)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:hierarchy:' + wingId + ':role:' + roleId + ':lead').setLabel('Toggle Lead').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:hierarchy:' + wingId + ':role:' + roleId + ':fps').setLabel('Fake Perms').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:hierarchy:' + wingId + ':role:' + roleId + ':remove').setLabel('Remove Role').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('dashboard:hierarchy:wing:' + wingId).setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function fakePermsPanel(guildId, page) {
  const entries = stateManager.getAllFakePermissions(guildId);
  const byFlag = {};
  for (const e of entries) {
    (byFlag[e.permission_flag] ||= []).push('<@&' + e.role_id + '>');
  }

  const flagEntries = Object.entries(FAKE_PERMISSION_FLAGS);
  const perPage = 10;
  const totalPages = Math.ceil(flagEntries.length / perPage);
  const currentPage = Math.max(0, Math.min(page || 0, totalPages - 1));
  const pageFlags = flagEntries.slice(currentPage * perPage, (currentPage + 1) * perPage);

  const lines = pageFlags.map(([flag, def]) => {
    const roles = byFlag[flag] || [];
    return '**' + def.label + '** (' + flag + ') \u2014 ' + (roles.length ? roles.join(', ') : '*none*');
  });

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Fake Permissions')
    .setDescription(lines.length ? lines.join('\n') : 'No flags on this page.')
    .setFooter({ text: 'Page ' + (currentPage + 1) + '/' + totalPages })
    .setTimestamp();

  const flagOptions = flagEntries.map(([flag, def]) =>
    new StringSelectMenuOptionBuilder().setLabel(def.label).setValue(flag)
  );
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('dashboard:fakeperms:select')
      .setPlaceholder('Select a permission to grant')
      .addOptions(flagOptions.slice(0, 20))
  );

  const navRow = new ActionRowBuilder();
  if (currentPage > 0) {
    navRow.addComponents(
      new ButtonBuilder().setCustomId('dashboard:fakeperms:page:' + (currentPage - 1)).setLabel('← Prev').setStyle(ButtonStyle.Secondary)
    );
  }
  if (currentPage < totalPages - 1) {
    navRow.addComponents(
      new ButtonBuilder().setCustomId('dashboard:fakeperms:page:' + (currentPage + 1)).setLabel('Next →').setStyle(ButtonStyle.Secondary)
    );
  }
  navRow.addComponents(
    new ButtonBuilder().setCustomId('dashboard:fakeperms:revoke_all').setLabel('Revoke All').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row, navRow] };
}

function moderationPanel(guildId) {
  const modlogChannel = stateManager.getModlogChannel(guildId);
  const jailRole = gs(guildId, 'jail_role_id');
  const jailChan = gs(guildId, 'jail_channel_id');
  const pbanProp = gs(guildId, 'PBAN_PROPOSAL_CHANNEL_ID');
  const pbanLog = gs(guildId, 'PBAN_LOG_CHANNEL_ID');
  const pbanProt = gs(guildId, 'PBAN_PROTECTED_ROLE_IDS', '');
  const pbanAppeal = gs(guildId, 'PBAN_APPEALS_INVITE', '');
  const autoMod = gs(guildId, 'ANTI_BOT_AUTOMOD_CHANNEL_ID');

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('🛡 Moderation')
    .addFields(
      { name: 'Modlog Channel', value: modlogChannel ? '<#' + modlogChannel + '>' : 'Not set', inline: true },
      { name: 'Jail Role', value: jailRole ? '<@&' + jailRole + '>' : 'Not set', inline: true },
      { name: 'Jail Channel', value: jailChan ? '<#' + jailChan + '>' : 'Not set', inline: true },
      { name: 'PBAN Proposal', value: pbanProp ? '<#' + pbanProp + '>' : 'Not set', inline: true },
      { name: 'PBAN Log', value: pbanLog ? '<#' + pbanLog + '>' : 'Not set', inline: true },
      { name: 'PBAN Protected', value: pbanProt ? pbanProt.split(',').map((id) => '<@&' + id.trim() + '>').join(', ') : 'Not set', inline: false },
      { name: 'PBAN Appeal', value: pbanAppeal || 'Not set', inline: true },
      { name: 'Automod Channel', value: autoMod ? '<#' + autoMod + '>' : 'Not set', inline: true }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:moderation:channel').setLabel('Modlog').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:roles:set_jail_role').setLabel('Jail Role').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:channels:set_jail_channel').setLabel('Jail Chan').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:channels:set_automod').setLabel('Automod').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:general:edit_pban_prop').setLabel('PBAN Prop').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:general:edit_pban_log').setLabel('PBAN Log').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:general:edit_pban_prot').setLabel('PBAN Prot').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:general:edit_pban_appeal').setLabel('PBAN Appeal').setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:general:pban_weights').setLabel('PBAN Wt').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row, row2, row3] };
}

function antiraidPanel(guildId) {
  const config = stateManager.getRaidConfig(guildId);
  const active = stateManager.getActiveRaidEvent(guildId);

  const embed = new EmbedBuilder()
    .setColor(config.enabled ? 0xed4245 : 0x95a5a6)
    .setTitle('Anti-Raid')
    .addFields(
      { name: 'Status', value: config.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Threshold', value: config.join_threshold + ' joins', inline: true },
      { name: 'Window', value: config.time_window_seconds + 's', inline: true },
      { name: 'Auto-Unlock', value: config.auto_lockout_minutes + ' min', inline: true },
      { name: 'Active Raid', value: active ? 'Yes' : 'No', inline: true }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:antiraid:toggle').setLabel(config.enabled ? 'Disable' : 'Enable').setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dashboard:antiraid:config').setLabel('Config').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function antinukePanel(guildId) {
  const config = stateManager.getAntinukeConfig(guildId);

  const embed = new EmbedBuilder()
    .setColor(config.enabled ? 0xed4245 : 0x95a5a6)
    .setTitle('Anti-Nuke')
    .addFields(
      { name: 'Status', value: config.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Ch Delete', value: String(config.channel_delete_threshold), inline: true },
      { name: 'Role Delete', value: String(config.role_delete_threshold), inline: true },
      { name: 'Ban Add', value: String(config.ban_add_threshold), inline: true },
      { name: 'Window', value: config.time_window_seconds + 's', inline: true },
      { name: 'Action', value: config.action_on_trigger, inline: true }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:antinuke:toggle').setLabel(config.enabled ? 'Disable' : 'Enable').setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dashboard:antinuke:config').setLabel('Config').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function levelsPanel(guildId) {
  const config = stateManager.getLevelConfig(guildId);
  const rewards = stateManager.getLevelRewards(guildId);

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Leveling')
    .addFields(
      { name: 'Status', value: config.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'XP Range', value: config.xp_min + '-' + config.xp_max, inline: true },
      { name: 'Cooldown', value: config.cooldown_seconds + 's', inline: true },
      { name: 'Factor', value: String(config.scaling_factor), inline: true },
      { name: 'Announce', value: config.announce_levelup ? 'On' : 'Off', inline: true }
    )
    .setTimestamp();

  if (rewards.length) {
    embed.addFields({ name: 'Rewards', value: rewards.map((r) => 'Lv ' + r.level + ' <@&' + r.role_id + '>').join('\n'), inline: false });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:levels:toggle').setLabel(config.enabled ? 'Disable' : 'Enable').setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dashboard:levels:config').setLabel('Config').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function starboardPanel(guildId) {
  const config = stateManager.getStarboardConfig(guildId);

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Starboard')
    .addFields(
      { name: 'Status', value: config.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Channel', value: config.channel_id ? '<#' + config.channel_id + '>' : 'Not set', inline: true },
      { name: 'Threshold', value: String(config.threshold), inline: true },
      { name: 'Emoji', value: config.emoji || 'star', inline: true }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:starboard:toggle').setLabel(config.enabled ? 'Disable' : 'Enable').setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dashboard:starboard:config').setLabel('Config').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function countersPanel(guildId) {
  const counters = stateManager.getCounters(guildId);

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Counters')
    .setTimestamp();

  if (!counters.length) {
    embed.setDescription('No counters configured.');
  } else {
    const lines = counters.map((c) => '<#' + c.channel_id + '> - **' + c.counter_type + '**');
    embed.setDescription(lines.join('\n'));
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:counters:create').setLabel('Create Counter').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function policiesPanel() {
  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Server Policies')
    .setDescription('Edit command permissions and staff role policy.')
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:policies:commands').setLabel('Command Perms').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:policies:rolepolicy').setLabel('Role Policy').setStyle(ButtonStyle.Primary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row, row2] };
}

function pj(guildId, key, fallback) {
  const val = stateManager.getGuildSetting(guildId, key, '');
  try { return val ? JSON.parse(val) : fallback; } catch { return fallback; }
}

function policyCommandsPanel(guildId) {
  const cmds = pj(guildId, '_policy_commands', {});
  const lines = Object.entries(cmds).map(([cmd, perms]) => '**' + cmd + '** — ' + (Array.isArray(perms) ? perms.map((p) => '`' + p + '`').join(', ') : String(perms)));
  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Command Permissions')
    .setDescription(lines.length ? lines.join('\n').substring(0, 4000) : 'No commands configured.')
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:policies:commands:edit').setLabel('Edit JSON').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:policies').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function policyRolePanel(guildId) {
  const json = pj(guildId, '_role_policy', config.policy.rolePolicy || {});
  const lines = [];
  if (json.staffHierarchy) {
    for (const [wing, entries] of Object.entries(json.staffHierarchy)) {
      lines.push(`**${wing}:** ${entries.join(', ')}`);
    }
  }
  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Staff Role Policy')
    .setDescription((lines.length ? lines.join('\n') : 'No role policy configured.') + '\n\nSet role IDs here in `rank,roleId` format (e.g. `1,123456789`). `M` = lead, `I` = internal.')
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:policies:rolepolicy:edit').setLabel('Edit JSON').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:policies').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

function confirmEmbed(guildId, message, backButton) {
  return {
    embeds: [new EmbedBuilder().setColor(0x57f287).setDescription('✅ ' + message).setTimestamp()],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(backButton || 'dashboard:main').setLabel('← Back').setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

function autorolesPanel(guildId) {
  const roleIds = stateManager.getAutoroles(guildId);
  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Auto-Roles')
    .setDescription(roleIds.length ? roleIds.map((id) => '<@&' + id + '>').join('\n') : 'No auto-roles configured.')
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:autoroles:add').setLabel('Add Role').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function pbanWeightsPanel(guildId) {
  const weights = stateManager.getPbanVoteWeights(guildId);
  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('PBAN Vote Weights')
    .setTimestamp();

  if (!weights.length) {
    embed.setDescription('No custom vote weights configured. Defaults apply.\n\nTotal weight needed to pass: **6**');
  } else {
    const lines = weights.map((w) => '<@&' + w.role_id + '> — **' + w.weight + '**' + (w.label ? ' (' + w.label + ')' : ''));
    embed.setDescription(lines.join('\n') + '\n\nTotal weight needed to pass: **6**');
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:moderation').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function appearancePanel(guildId) {
  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Appearance')
    .addFields(
      { name: 'Embed Color', value: '`#' + config.style.color.toString(16).padStart(6, '0') + '`', inline: true },
      { name: 'Title Prefix', value: config.style.titlePrefix ? '`' + config.style.titlePrefix + '`' : 'Not set', inline: true },
      { name: 'Footer', value: config.style.footer ? '`' + config.style.footer + '`' : 'Not set', inline: true }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:settings').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function diagnosticsPanel(guildId) {
  const prefix = getPrefix(guildId);
  const wings = stateManager.getWings(guildId);
  const modlogChan = stateManager.getModlogChannel(guildId);
  const modlogSet = modlogChan ? '✅ Modlog channel set' : '⚠️ No modlog channel';
  const wingSummary = wings.length ? '✅ ' + wings.length + ' wings configured' : '⚠️ No wings configured';

  const lines = ['✅ Bot token configured', '✅ Prefix: `' + prefix + '`', modlogSet, wingSummary];
  for (const w of wings) {
    const rs = stateManager.getWingRoles(guildId, w.id);
    const lead = rs.find((r) => r.is_lead);
    lines.push(lead ? '✅ ' + w.label + ': Has lead' : '⚠️ ' + w.label + ': No lead');
    lines.push(w.category_id ? '✅ ' + w.label + ': Has category' : '⚠️ ' + w.label + ': No category');
  }

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Setup Diagnostics')
    .setDescription(lines.join('\n'))
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── New Permission Node System (3-layer) ──

function permissionsPanel(guildId) {
  const nodes = stateManager.getAllPermissionNodes();
  const modules = [...new Set(nodes.map(n => n.module))];
  
  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Permissions (3-Layer System)')
    .setDescription(
      '**Layer 1 — Permission Nodes:** ' + nodes.length + ' nodes across ' + modules.length + ' modules\n' +
      '**Layer 2 — Role Assignments:** Grant/deny nodes to roles\n' +
      '**Layer 3 — Channel Overrides:** Restrict nodes in specific channels'
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:permissions:nodes').setLabel('View Nodes').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:permissions:roles').setLabel('Role Permissions').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:permissions:channels').setLabel('Channel Overrides').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:permissions:audit').setLabel('Audit Log').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row, row2] };
}

function permissionsNodesPanel(guildId, page = 0) {
  const nodes = stateManager.getAllPermissionNodes();
  const modules = [...new Set(nodes.map(n => n.module))];
  const perPage = 15;
  const totalPages = Math.ceil(nodes.length / perPage);
  const pagedNodes = nodes.slice(page * perPage, (page + 1) * perPage);

  const lines = pagedNodes.map(n => {
    const moduleLabel = n.module.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
    return '`'+ n.node +'` — **'+ n.label +'** ('+ moduleLabel +')';
  });

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Permission Nodes (Page ' + (page + 1) + '/' + totalPages + ')')
    .setDescription(lines.length ? lines.join('\n') : 'No permission nodes registered')
    .setTimestamp();

  const components = [];
  
  // Module filter select
  const moduleOptions = modules.map(m => 
    new StringSelectMenuOptionBuilder().setLabel(m.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())).setValue(m)
  );
  moduleOptions.unshift(new StringSelectMenuOptionBuilder().setLabel('All Modules').setValue('all'));
  
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('dashboard:permissions:nodes:filter')
      .setPlaceholder('Filter by module')
      .addOptions(moduleOptions.slice(0, 25))
  );
  components.push(row);

  // Pagination
  const navRow = new ActionRowBuilder();
  if (page > 0) {
    navRow.addComponents(new ButtonBuilder().setCustomId('dashboard:permissions:nodes:page:' + (page - 1)).setLabel('← Previous').setStyle(ButtonStyle.Secondary));
  }
  navRow.addComponents(new ButtonBuilder().setCustomId('dashboard:permissions').setLabel('Back').setStyle(ButtonStyle.Secondary));
  if (page < totalPages - 1) {
    navRow.addComponents(new ButtonBuilder().setCustomId('dashboard:permissions:nodes:page:' + (page + 1)).setLabel('Next →').setStyle(ButtonStyle.Secondary));
  }
  components.push(navRow);

  return { embeds: [embed], components };
}

function permissionsRolesPanel(guildId, page = 0) {
  const rolePerms = stateManager.getAllRolePermissions(guildId);
  const perPage = 10;
  const totalPages = Math.max(1, Math.ceil(rolePerms.length / perPage));
  const paged = rolePerms.slice(page * perPage, (page + 1) * perPage);

  const lines = paged.length
    ? paged.map(rp => '<@&' + rp.role_id + '> — `' + rp.node + '` — **' + rp.mode.toUpperCase() + '**' + (rp.granted_by ? ' (by <@' + rp.granted_by + '>)' : ''))
    : ['No role permissions configured'];

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Role Permissions (Page ' + (page + 1) + '/' + totalPages + ')')
    .setDescription(lines.join('\n'))
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:permissions:roles:grant').setLabel('Grant Permission').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dashboard:permissions:roles:revoke').setLabel('Revoke Permission').setStyle(ButtonStyle.Danger)
  );

  const navRow = new ActionRowBuilder();
  if (page > 0) {
    navRow.addComponents(new ButtonBuilder().setCustomId('dashboard:permissions:roles:page:' + (page - 1)).setLabel('← Previous').setStyle(ButtonStyle.Secondary));
  }
  navRow.addComponents(new ButtonBuilder().setCustomId('dashboard:permissions').setLabel('Back').setStyle(ButtonStyle.Secondary));
  if (page < totalPages - 1) {
    navRow.addComponents(new ButtonBuilder().setCustomId('dashboard:permissions:roles:page:' + (page + 1)).setLabel('Next →').setStyle(ButtonStyle.Secondary));
  }

  return { embeds: [embed], components: [row, navRow] };
}

function permissionsChannelsPanel(guildId) {
  const overrides = stateManager.query('SELECT * FROM channel_overrides WHERE guild_id = ? ORDER BY channel_id', guildId);
  const byChannel = {};
  for (const o of overrides) {
    if (!byChannel[o.channel_id]) byChannel[o.channel_id] = [];
    byChannel[o.channel_id].push('`' + o.node + '` — **' + (o.mode || 'deny').toUpperCase() + '**');
  }
  const chanLines = Object.entries(byChannel).map(([chId, nodes]) => '<#' + chId + '>\n' + nodes.join(', '));
  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Channel Overrides')
    .setDescription(chanLines.length ? chanLines.join('\n\n').substring(0, 4000) : 'No channel overrides configured.')
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:permissions:channels:add').setLabel('Add Override').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:permissions').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function permissionsAuditPanel(guildId, page = 0) {
  const entries = stateManager.getAuditLog(guildId, 10);
  const lines = entries.map(e => {
    const time = new Date(e.timestamp).toLocaleString();
    const target = e.target_type ? ' **' + e.target_type + ':** ' + (e.target_id ? '<@' + e.target_id + '>' : '') : '';
    return '`'+ time +'` <@' + e.actor_id + '> **' + e.action + '**' + target + (e.details ? ' — ' + e.details : '');
  });

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Permission Audit Log')
    .setDescription(lines.length ? lines.join('\n') : 'No audit entries')
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:permissions').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function antiraidConfigPanel(guildId) {
  const config = stateManager.getRaidConfig(guildId);

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Anti-Raid Config')
    .addFields(
      { name: 'Threshold', value: config.join_threshold + ' joins in ' + config.time_window_seconds + 's', inline: false },
      { name: 'Auto-Unlock', value: config.auto_lockout_minutes + ' minutes', inline: true },
      { name: 'Whitelisted Roles', value: config.whitelist_role_ids?.length ? config.whitelist_role_ids.map((id) => '<@&' + id + '>').join(', ') : 'None', inline: false }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:antiraid:threshold').setLabel('Set Threshold').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:antiraid:window').setLabel('Set Window').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:antiraid:lockout').setLabel('Set Lockout').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:antiraid').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function antinukeConfigPanel(guildId) {
  const config = stateManager.getAntinukeConfig(guildId);

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Anti-Nuke Config')
    .addFields(
      { name: 'Channel Delete', value: String(config.channel_delete_threshold) + ' in ' + config.time_window_seconds + 's', inline: false },
      { name: 'Role Delete', value: String(config.role_delete_threshold) + ' in ' + config.time_window_seconds + 's', inline: false },
      { name: 'Ban Add', value: String(config.ban_add_threshold) + ' in ' + config.time_window_seconds + 's', inline: false },
      { name: 'Action', value: config.action_on_trigger, inline: true },
      { name: 'Auto-Unlock', value: config.auto_lockout_minutes + ' min', inline: true }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:antinuke:chthreshold').setLabel('Ch Thresh').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:antinuke:rolethreshold').setLabel('Role Thresh').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:antinuke:banthreshold').setLabel('Ban Thresh').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:antinuke').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function levelsConfigPanel(guildId) {
  const config = stateManager.getLevelConfig(guildId);

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Leveling Config')
    .addFields(
      { name: 'XP Per Message', value: config.xp_min + ' - ' + config.xp_max, inline: true },
      { name: 'Cooldown', value: config.cooldown_seconds + 's', inline: true },
      { name: 'Scaling Factor', value: String(config.scaling_factor), inline: true },
      { name: 'Announce', value: config.announce_levelup ? 'On' : 'Off', inline: false }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:levels:xp').setLabel('Set XP').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:levels:cooldown').setLabel('Cooldown').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:levels:factor').setLabel('Factor').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:levels').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function starboardConfigPanel(guildId) {
  const config = stateManager.getStarboardConfig(guildId);

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('Starboard Config')
    .addFields(
      { name: 'Channel', value: config.channel_id ? '<#' + config.channel_id + '>' : 'Not set', inline: true },
      { name: 'Threshold', value: String(config.threshold), inline: true },
      { name: 'Emoji', value: config.emoji || 'star', inline: true }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:starboard:threshold').setLabel('Set Threshold').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:starboard:channel').setLabel('Set Channel').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:starboard').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function canManage(member) {
  if (!member) return false;
  if (config.ownerId && member.id === config.ownerId) return true;
  if (member.permissions?.has('Administrator')) return true;
  if (memberHasPermission(member, 'administrator')) return true;
  if (member.permissions?.has('ManageGuild')) return true;
  // Only Internals wing can use the dashboard
  const internalIds = staffRoleHierarchyIds('internals');
  return member.roles?.cache?.some((r) => internalIds.includes(r.id)) || false;
}

// ── Modal Trigger Builders ──

async function showPrefixModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:prefix')
    .setTitle('Change Prefix')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('prefix_value').setLabel('New prefix (1-3 chars)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3)
      )
    );
  await interaction.showModal(modal);
}

// Derived from FAKE_PERMISSION_FLAGS in core/permissions.js
const ALL_PERM_FLAGS = Object.entries(FAKE_PERMISSION_FLAGS).map(([flag, def]) => ({ flag, label: def.label }));

async function showGrantRoleSelect(interaction, flag) {
  const guildId = interaction.guildId;
  const wings = stateManager.getWings(guildId);
  const allRoles = [];
  for (const wing of wings) {
    const roles = stateManager.getWingRoles(guildId, wing.id);
    for (const r of roles) {
      const label = r.label || r.role_id;
      allRoles.push(new StringSelectMenuOptionBuilder().setLabel(label).setValue(r.role_id));
    }
  }
  if (!allRoles.length) {
    await interaction.reply({ content: 'No wing roles configured. Set up wings first.', ephemeral: true });
    return;
  }
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('dashboard:fakeperms:grant_role:' + flag)
      .setPlaceholder('Select a wing role to grant')
      .addOptions(allRoles)
  );
  await interaction.update({
    content: 'Grant **' + flag + '** to which wing role?',
    embeds: [],
    components: [row]
  });
}


async function showModlogChannelModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:modlog_channel')
    .setTitle('Set Modlog Channel')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('channel_id').setLabel('Channel ID').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
  await interaction.showModal(modal);
}

async function showRaidThresholdModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:raid_threshold')
    .setTitle('Set Join Threshold')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('value').setLabel('Number of joins').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
  await interaction.showModal(modal);
}

async function showRaidWindowModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:raid_window')
    .setTitle('Set Time Window')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('value').setLabel('Seconds').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
  await interaction.showModal(modal);
}

async function showRaidLockoutModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:raid_lockout')
    .setTitle('Set Auto-Unlock')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('value').setLabel('Minutes').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
  await interaction.showModal(modal);
}

async function showAntinukeThresholdModal(interaction, key, label) {
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:antinuke_threshold')
    .setTitle('Set ' + label + ' Threshold')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('threshold_key').setLabel('Key').setStyle(TextInputStyle.Short).setRequired(true).setValue(key).setPlaceholder(key)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('value').setLabel('Count').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
  await interaction.showModal(modal);
}

async function showLevelsXpModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:levels_xp')
    .setTitle('Set XP Range')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('xp_min').setLabel('Min XP').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('xp_max').setLabel('Max XP').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
  await interaction.showModal(modal);
}

async function showLevelsCooldownModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:levels_cooldown')
    .setTitle('Set Cooldown')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('value').setLabel('Seconds').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
  await interaction.showModal(modal);
}

async function showLevelsFactorModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:levels_factor')
    .setTitle('Set Scaling Factor')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('value').setLabel('Factor (e.g. 100)').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
  await interaction.showModal(modal);
}

async function showStarboardThresholdModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:starboard_threshold')
    .setTitle('Set Star Threshold')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('value').setLabel('Stars needed').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
  await interaction.showModal(modal);
}

async function showStarboardChannelModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:starboard_channel')
    .setTitle('Set Starboard Channel')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('channel_id').setLabel('Channel ID').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
  await interaction.showModal(modal);
}

// ── Wing Modals ──

async function showAddWingModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:hierarchy:add')
    .setTitle('Add Wing')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('wing_id').setLabel('Wing ID (lowercase, no spaces)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('wing_label').setLabel('Display Label').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('wing_description').setLabel('Description (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('wing_prefix').setLabel('Channel Prefix (e.g. general)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('wing_category').setLabel('Category Channel ID (optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(30)
      )
    );
  await interaction.showModal(modal);
}

async function showRenameWingModal(interaction, wingId) {
  const wing = stateManager.getWing(interaction.guildId, wingId);
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:hierarchy:rename:' + wingId)
    .setTitle('Rename Wing')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('wing_label').setLabel('New display label').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50).setValue(wing?.label || '')
      )
    );
  await interaction.showModal(modal);
}

async function showWingDescriptionModal(interaction, wingId) {
  const wing = stateManager.getWing(interaction.guildId, wingId);
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:hierarchy:description:' + wingId)
    .setTitle('Set Wing Description')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('wing_description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200).setValue(wing?.description || '')
      )
    );
  await interaction.showModal(modal);
}

async function showWingPrefixModal(interaction, wingId) {
  const wing = stateManager.getWing(interaction.guildId, wingId);
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:hierarchy:prefix:' + wingId)
    .setTitle('Set Channel Prefix')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('wing_prefix').setLabel('Channel prefix (e.g. general)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20).setValue(wing?.channel_prefix || '')
      )
    );
  await interaction.showModal(modal);
}

async function showWingCategoryModal(interaction, wingId) {
  const wing = stateManager.getWing(interaction.guildId, wingId);
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:hierarchy:category:' + wingId)
    .setTitle('Set Category Channel')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('wing_category').setLabel('Category Channel ID').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(30).setValue(wing?.category_id || '')
      )
    );
  await interaction.showModal(modal);
}

async function showReorderWingsModal(interaction) {
  const wings = stateManager.getWings(interaction.guildId);
  const currentOrder = wings.map((w) => w.id).join(', ');
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:hierarchy:reorder')
    .setTitle('Reorder Wings')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('wing_order').setLabel('Wing IDs in order (comma-separated)').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(currentOrder)
      )
    );
  await interaction.showModal(modal);
}

async function showAddWingRoleModal(interaction, wingId) {
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:hierarchy:role_add:' + wingId)
    .setTitle('Add Role to Wing')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('role_id').setLabel('Role ID').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('role_rank').setLabel('Rank (number, higher = more authority)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(5)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('role_lead').setLabel('Lead? (yes/no)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(5)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('role_category').setLabel('Category role? (yes/no)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(5)
      )
    );
  await interaction.showModal(modal);
}

// ── Policy Modals ──

async function showPolicyEditModal(interaction, policyKey) {
  const guildId = interaction.guildId;
  let currentData;

  const policyKeys = {
    commands: { gs: '_policy_commands', title: 'Edit Command Permissions', cfg: 'commands' },
    rolepolicy: { gs: '_role_policy', title: 'Edit Staff Role Policy', cfg: 'rolePolicy' }
  };
  const info = policyKeys[policyKey];
  if (!info) return;

  const stored = stateManager.getGuildSetting(guildId, info.gs, '');
  try { currentData = stored ? JSON.parse(stored) : null; } catch { currentData = null; }
  if (!currentData || Object.keys(currentData).length === 0) {
    currentData = info.cfg ? (config.policy?.[info.cfg] || {}) : {};
  }

  let currentJson = JSON.stringify(currentData, null, 2);
  if (currentJson.length > 4000) currentJson = currentJson.substring(0, 4000);

  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:policy:' + policyKey)
    .setTitle(info.title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('policy_json').setLabel('JSON content').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(currentJson)
      )
    );
  await interaction.showModal(modal);
}

// ── General Settings Modals ──

async function showSettingModal(interaction, key, label, currentValue) {
  const suffix = ' (ID or leave blank)';
  const maxLabelLen = 45 - suffix.length;
  const truncatedLabel = label.length > maxLabelLen ? label.substring(0, maxLabelLen - 1) + '…' : label;
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:setting:' + key)
    .setTitle('Set ' + label)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('setting_value').setLabel(truncatedLabel + suffix).setStyle(TextInputStyle.Short).setRequired(false).setValue(currentValue || '')
      )
    );
  await interaction.showModal(modal);
}

async function showSettingTextModal(interaction, key, label, currentValue) {
  const truncatedLabel = label.length > 45 ? label.substring(0, 44) + '…' : label;
  const modal = new ModalBuilder()
    .setCustomId('dashboard_modal:setting:' + key)
    .setTitle('Set ' + label)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('setting_value').setLabel(truncatedLabel).setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(currentValue || '')
      )
    );
  await interaction.showModal(modal);
}

// ── Toggle Helpers ──

function toggleRaid(interaction) {
  const config = stateManager.getRaidConfig(interaction.guildId);
  stateManager.setRaidConfig(interaction.guildId, { enabled: config.enabled ? 0 : 1 });
  interaction.update(securityPanel(interaction.guildId));
}

function toggleAntinuke(interaction) {
  const config = stateManager.getAntinukeConfig(interaction.guildId);
  stateManager.setAntinukeConfig(interaction.guildId, { enabled: config.enabled ? 0 : 1 });
  interaction.update(securityPanel(interaction.guildId));
}

function toggleLevels(interaction) {
  const config = stateManager.getLevelConfig(interaction.guildId);
  stateManager.setLevelConfig(interaction.guildId, { enabled: config.enabled ? 0 : 1 });
  interaction.update(engagementPanel(interaction.guildId));
}

function toggleStarboard(interaction) {
  const config = stateManager.getStarboardConfig(interaction.guildId);
  stateManager.setStarboardConfig(interaction.guildId, { enabled: config.enabled ? 0 : 1 });
  interaction.update(engagementPanel(interaction.guildId));
}

function engagementPanel(guildId) {
  const lvl = stateManager.getLevelConfig(guildId);
  const rewards = stateManager.getLevelRewards(guildId);
  const sb = stateManager.getStarboardConfig(guildId);
  const counters = stateManager.getCounters(guildId);

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('🎮 Engagement')
    .addFields(
      { name: 'Leveling', value: lvl.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'XP Range', value: lvl.xp_min + '-' + lvl.xp_max, inline: true },
      { name: 'Cooldown', value: lvl.cooldown_seconds + 's', inline: true },
      { name: 'Scaling Factor', value: String(lvl.scaling_factor), inline: true },
      { name: 'Announce', value: lvl.announce_levelup ? 'On' : 'Off', inline: true },
      { name: '\u200B', value: '\u200B', inline: false },
      { name: 'Starboard', value: sb.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Channel', value: sb.channel_id ? '<#' + sb.channel_id + '>' : 'Not set', inline: true },
      { name: 'Threshold', value: String(sb.threshold), inline: true },
      { name: 'Emoji', value: sb.emoji || 'star', inline: true }
    )
    .setTimestamp();

  if (rewards.length) {
    embed.addFields({ name: 'Level Rewards', value: rewards.map((r) => 'Lv ' + r.level + ' <@&' + r.role_id + '>').join('\n'), inline: false });
  }

  if (counters.length) {
    embed.addFields({ name: 'Counters', value: counters.map((c) => '<#' + c.channel_id + '> - **' + c.counter_type + '**').join('\n'), inline: false });
  } else {
    embed.addFields({ name: 'Counters', value: 'None configured', inline: false });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:levels:toggle').setLabel(lvl.enabled ? 'Levels Off' : 'Levels On').setStyle(lvl.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dashboard:levels:config').setLabel('Level Config').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:starboard:toggle').setLabel(sb.enabled ? 'Star Off' : 'Star On').setStyle(sb.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dashboard:starboard:config').setLabel('Star Config').setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:counters').setLabel('Counters').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row, row2] };
}

function securityPanel(guildId) {
  const raid = stateManager.getRaidConfig(guildId);
  const nuke = stateManager.getAntinukeConfig(guildId);

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('🔒 Security')
    .addFields(
      { name: 'Anti-Raid', value: raid.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
      { name: 'Join Threshold', value: raid.join_threshold + ' joins', inline: true },
      { name: 'Window', value: raid.time_window_seconds + 's', inline: true },
      { name: 'Auto-Unlock', value: raid.auto_lockout_minutes + ' min', inline: true },
      { name: '\u200B', value: '\u200B', inline: false },
      { name: 'Anti-Nuke', value: nuke.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
      { name: 'Ch Delete', value: String(nuke.channel_delete_threshold), inline: true },
      { name: 'Role Delete', value: String(nuke.role_delete_threshold), inline: true },
      { name: 'Ban Add', value: String(nuke.ban_add_threshold), inline: true },
      { name: 'Window', value: nuke.time_window_seconds + 's', inline: true },
      { name: 'Action', value: nuke.action_on_trigger, inline: true }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:antiraid:toggle').setLabel(raid.enabled ? 'Raid Off' : 'Raid On').setStyle(raid.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dashboard:antiraid:config').setLabel('Raid Config').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:antinuke:toggle').setLabel(nuke.enabled ? 'Nuke Off' : 'Nuke On').setStyle(nuke.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dashboard:antinuke:config').setLabel('Nuke Config').setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row, row2] };
}

function settingsPanel(guildId) {
  const prefix = getPrefix(guildId);
  const successResponse = gs(guildId, 'success_response', '👍');

  const embed = new EmbedBuilder()
    .setColor(0xc67a3a)
    .setTitle('⚙ Settings')
    .addFields(
      { name: 'Command Prefix', value: '`' + prefix + '`', inline: false },
      { name: 'Success Response', value: '`' + successResponse + '`', inline: false }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:general:prefix').setLabel('Prefix').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dashboard:general:success_response').setLabel('Success Resp').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dashboard:general:appearance').setLabel('Appearance').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard:main').setLabel('Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row, row2] };
}

// ── Command Handlers ──

async function handlePrefixCommand(message, args, guildId) {
  if (!guildId) {
    await message.reply('This command can only be used in a server.');
    return;
  }
  if (!canManage(message.member)) return;

  try {
    const sent = await message.reply(mainPanel(guildId));
    if (sent?.id) touchSession(sent.id, message.author.id, message.channel.id);
  } catch (error) {
    await message.reply('Failed to open dashboard.');
  }
}

async function handleSlashCommand(interaction) {
  if (!canManage(interaction.member)) {
    await interaction.reply({ content: '\u200b', ephemeral: true }).catch(() => {});
    return;
  }
  const payload = mainPanel(interaction.guildId);
  const sent = await interaction.reply(payload);
  if (sent?.id) touchSession(sent.id, interaction.user.id, interaction.channelId);
}

async function handleDashboardButton(interaction) {
  const { customId, guildId, member } = interaction;
  const messageId = interaction.message?.id;

  if (await expireSession(interaction)) return;
  touchSession(messageId, interaction.user.id, interaction.channelId);

  if (customId === 'dashboard:main') {
    await interaction.update(mainPanel(guildId));
    return;
  }

  if (!canManage(member)) {
    await interaction.reply({ content: 'nuuu', ephemeral: true });
    return;
  }

  switch (customId) {
    case 'dashboard:general':
    case 'dashboard:channels':
      await interaction.update(channelsPanel(guildId));
      return;
    case 'dashboard:general:more':
    case 'dashboard:roles':
      await interaction.update(rolesPanel(guildId));
      return;
    case 'dashboard:security':
    case 'dashboard:antiraid':
    case 'dashboard:antinuke':
      await interaction.update(securityPanel(guildId));
      return;
    case 'dashboard:engagement':
    case 'dashboard:levels':
    case 'dashboard:starboard':
      await interaction.update(engagementPanel(guildId));
      return;
    case 'dashboard:settings':
      await interaction.update(settingsPanel(guildId));
      return;
    case 'dashboard:hierarchy': {
      const payload = hierarchyPanel(guildId);
      if (interaction.isButton()) {
        await interaction.update(payload);
      } else {
        await interaction.reply(payload);
      }
      return;
    }
    case 'dashboard:fakeperms':
      await interaction.update(fakePermsPanel(guildId));
      return;
    case 'dashboard:moderation':
      await interaction.update(moderationPanel(guildId));
      return;
    case 'dashboard:counters':
      await interaction.update(countersPanel(guildId));
      return;
    case 'dashboard:general:prefix':
      await showPrefixModal(interaction);
      return;
    case 'dashboard:general:documents':
      await showSettingModal(interaction, 'DOCUMENTS_CHANNEL_ID', 'Documents Evidence Channel', gs(guildId, 'DOCUMENTS_CHANNEL_ID'));
      return;
    case 'dashboard:general:edit_break_chan':
      await showSettingModal(interaction, 'BREAK_REQUEST_CHANNEL_ID', 'Break Request Channel', gs(guildId, 'BREAK_REQUEST_CHANNEL_ID'));
      return;
    case 'dashboard:general:edit_break_role':
      await showSettingModal(interaction, 'ON_BREAK_ROLE_ID', 'On Break Role', gs(guildId, 'ON_BREAK_ROLE_ID'));
      return;
    case 'dashboard:general:edit_pban_prop':
      await showSettingModal(interaction, 'PBAN_PROPOSAL_CHANNEL_ID', 'PBAN Proposal Channel', gs(guildId, 'PBAN_PROPOSAL_CHANNEL_ID'));
      return;
    case 'dashboard:general:edit_pban_log':
      await showSettingModal(interaction, 'PBAN_LOG_CHANNEL_ID', 'PBAN Log Channel', gs(guildId, 'PBAN_LOG_CHANNEL_ID'));
      return;
    case 'dashboard:general:edit_pban_prot':
      await showSettingModal(interaction, 'PBAN_PROTECTED_ROLE_IDS', 'PBAN Protected Roles (comma-sep IDs)', gs(guildId, 'PBAN_PROTECTED_ROLE_IDS', ''));
      return;
    case 'dashboard:general:edit_pban_appeal':
      await showSettingModal(interaction, 'PBAN_APPEALS_INVITE', 'PBAN Appeals Invite Link', gs(guildId, 'PBAN_APPEALS_INVITE', ''));
      return;
    case 'dashboard:general:edit_modlog':
      await showSettingModal(interaction, 'modlog_channel', 'Modlog Channel', stateManager.getModlogChannel(guildId));
      return;
    case 'dashboard:general:edit_demote':
      await showSettingModal(interaction, 'DEMOTE_EXEMPT_ROLES', 'Demote Exempt Role IDs (comma-sep)', gs(guildId, 'DEMOTE_EXEMPT_ROLES', ''));
      return;
    case 'dashboard:general:appearance':
      await interaction.update(appearancePanel(guildId));
      return;
    case 'dashboard:general:pban_weights':
      await interaction.update(pbanWeightsPanel(guildId));
      return;
    case 'dashboard:general:stats_exclude':
      await showSettingModal(interaction, 'stats_excluded_channels', 'Stats Excluded Channel IDs (JSON array)', gs(guildId, 'stats_excluded_channels', '[]'));
      return;
    case 'dashboard:general:success_response':
      await showSettingModal(interaction, 'success_response', 'Success Emoji/Text', gs(guildId, 'success_response', '👍'));
      return;

    case 'dashboard:channels:set_automod':
      await showSettingModal(interaction, 'ANTI_BOT_AUTOMOD_CHANNEL_ID', 'Automod Channel', gs(guildId, 'ANTI_BOT_AUTOMOD_CHANNEL_ID'));
      return;
    case 'dashboard:channels:set_jail_channel':
      await showSettingModal(interaction, 'jail_channel_id', 'Jail Channel', gs(guildId, 'jail_channel_id'));
      return;
    case 'dashboard:roles:set_jail_role':
      await showSettingModal(interaction, 'jail_role_id', 'Jail Role', gs(guildId, 'jail_role_id'));
      return;
    case 'dashboard:autoroles':
      await interaction.update(autorolesPanel(guildId));
      return;
    case 'dashboard:autoroles:add':
      await showSettingModal(interaction, 'AUTOROLE_ADD', 'Role ID to auto-assign', '');
      return;
    case 'dashboard:fakeperms:select': {
      const flag = interaction.values[0];
      await showGrantRoleSelect(interaction, flag);
      return;
    }
    case 'dashboard:fakeperms:revoke_all':
      stateManager.revokeAllFakePermissions(guildId);
      await interaction.update(fakePermsPanel(guildId));
      return;
    case 'dashboard:fakeperms:page:0':
    case 'dashboard:fakeperms:page:1':
    case 'dashboard:fakeperms:page:2':
    case 'dashboard:fakeperms:page:3':
    case 'dashboard:fakeperms:page:4': {
      const pageNum = parseInt(customId.split(':')[3], 10);
      await interaction.update(fakePermsPanel(guildId, pageNum));
      return;
    }
    case 'dashboard:permissions':
      await interaction.update(permissionsPanel(guildId));
      return;
    case 'dashboard:permissions:nodes':
      await interaction.update(permissionsNodesPanel(guildId));
      return;
    case 'dashboard:permissions:nodes:page:0':
    case 'dashboard:permissions:nodes:page:1':
    case 'dashboard:permissions:nodes:page:2':
    case 'dashboard:permissions:nodes:page:3':
    case 'dashboard:permissions:nodes:page:4':
    case 'dashboard:permissions:nodes:page:5': {
      const nodePage = parseInt(customId.split(':')[4], 10);
      await interaction.update(permissionsNodesPanel(guildId, nodePage));
      return;
    }
    case 'dashboard:permissions:roles':
      await interaction.update(permissionsRolesPanel(guildId));
      return;
    case 'dashboard:permissions:roles:grant':
      await showSettingModal(interaction, 'PERM_GRANT', 'Grant: role_id,node,mode(allow/deny)', '');
      return;
    case 'dashboard:permissions:roles:revoke':
      await showSettingModal(interaction, 'PERM_REVOKE', 'Revoke: role_id,node', '');
      return;
    case 'dashboard:permissions:roles:page:0':
    case 'dashboard:permissions:roles:page:1':
    case 'dashboard:permissions:roles:page:2':
    case 'dashboard:permissions:roles:page:3':
    case 'dashboard:permissions:roles:page:4':
    case 'dashboard:permissions:roles:page:5': {
      const rolePage = parseInt(customId.split(':')[4], 10);
      await interaction.update(permissionsRolesPanel(guildId, rolePage));
      return;
    }
    case 'dashboard:permissions:channels':
      await interaction.update(permissionsChannelsPanel(guildId));
      return;
    case 'dashboard:permissions:channels:add':
      await showSettingModal(interaction, 'PERM_CHANNEL', 'Override: channel_id,node,mode(allow/deny)', '');
      return;
    case 'dashboard:permissions:audit':
      await interaction.update(permissionsAuditPanel(guildId));
      return;
    case 'dashboard:moderation:channel':
      await showModlogChannelModal(interaction);
      return;
    case 'dashboard:antiraid:toggle':
      toggleRaid(interaction);
      return;
    case 'dashboard:antiraid:config':
      await interaction.update(antiraidConfigPanel(guildId));
      return;
    case 'dashboard:antiraid:threshold':
      await showRaidThresholdModal(interaction);
      return;
    case 'dashboard:antiraid:window':
      await showRaidWindowModal(interaction);
      return;
    case 'dashboard:antiraid:lockout':
      await showRaidLockoutModal(interaction);
      return;
    case 'dashboard:antinuke:toggle':
      toggleAntinuke(interaction);
      return;
    case 'dashboard:antinuke:config':
      await interaction.update(antinukeConfigPanel(guildId));
      return;
    case 'dashboard:antinuke:chthreshold':
      await showAntinukeThresholdModal(interaction, 'channel_delete_threshold', 'Channel Deletion');
      return;
    case 'dashboard:antinuke:rolethreshold':
      await showAntinukeThresholdModal(interaction, 'role_delete_threshold', 'Role Deletion');
      return;
    case 'dashboard:antinuke:banthreshold':
      await showAntinukeThresholdModal(interaction, 'ban_add_threshold', 'Ban Add');
      return;
    case 'dashboard:levels:toggle':
      toggleLevels(interaction);
      return;
    case 'dashboard:levels:config':
      await interaction.update(levelsConfigPanel(guildId));
      return;
    case 'dashboard:levels:xp':
      await showLevelsXpModal(interaction);
      return;
    case 'dashboard:levels:cooldown':
      await showLevelsCooldownModal(interaction);
      return;
    case 'dashboard:levels:factor':
      await showLevelsFactorModal(interaction);
      return;
    case 'dashboard:starboard:toggle':
      toggleStarboard(interaction);
      return;
    case 'dashboard:starboard:config':
      await interaction.update(starboardConfigPanel(guildId));
      return;
    case 'dashboard:starboard:threshold':
      await showStarboardThresholdModal(interaction);
      return;
    case 'dashboard:starboard:channel':
      await showStarboardChannelModal(interaction);
      return;
    case 'dashboard:diagnostics':
      await interaction.update(diagnosticsPanel(guildId));
      return;
    case 'dashboard:autoroles':
      await interaction.update(autorolesPanel(guildId));
      return;
    case 'dashboard:autoroles:add':
      await showSettingModal(interaction, 'AUTOROLE_ADD', 'Role ID to auto-assign', '');
      return;
    case 'dashboard:policies':
      await interaction.update(policiesPanel());
      return;
    case 'dashboard:policies:commands':
      await interaction.update(policyCommandsPanel(guildId));
      return;
    case 'dashboard:policies:rolepolicy':
      await interaction.update(policyRolePanel(guildId));
      return;
    case 'dashboard:policies:rolepolicy:edit':
      await showPolicyEditModal(interaction, 'rolepolicy');
      return;
    case 'dashboard:policies:commands:edit':
      await showPolicyEditModal(interaction, 'commands');
      return;
    case 'dashboard:hierarchy:select': {
      const wingId = interaction.values?.[0];
      if (!wingId || wingId === '_none') {
        await interaction.reply({ content: 'No wing selected.', ephemeral: true });
        return;
      }
      await interaction.update(hierarchyWingPanel(guildId, wingId));
      return;
    }
    case 'dashboard:hierarchy:add':
      await showAddWingModal(interaction);
      return;
    case 'dashboard:hierarchy:reorder':
      await showReorderWingsModal(interaction);
      return;

    default: {
      const parts = customId.split(':');
      if (parts[1] === 'hierarchy') {
        if (parts[0] === 'dashboard_modal') break;
        if (parts.length === 4 && parts[3] === 'delete') {
          const wingId = parts[2];
          stateManager.deleteWing(guildId, wingId);
          await interaction.update(hierarchyPanel(guildId));
          return;
        }
        if (parts.length === 4) {
          const wingId = parts[2];
          const action = parts[3];
          switch (action) {
            case 'rename':
              await showRenameWingModal(interaction, wingId);
              return;
            case 'description':
              await showWingDescriptionModal(interaction, wingId);
              return;
            case 'prefix':
              await showWingPrefixModal(interaction, wingId);
              return;
            case 'category':
              await showWingCategoryModal(interaction, wingId);
              return;
            case 'role_add':
              await showAddWingRoleModal(interaction, wingId);
              return;
          }
        }
        if (parts.length === 4 && parts[2] === 'wing') {
          const wingId = parts[3];
          await interaction.update(hierarchyWingPanel(guildId, wingId));
          return;
        }
        if (parts.length >= 4 && parts[2] === 'role_select') {
          const wingId = parts[3];
          const roleId = interaction.values?.[0];
          if (roleId && roleId !== '_none') {
            await interaction.update(hierarchyRolePanel(guildId, wingId, roleId));
          }
          return;
        }
        if (parts.length >= 6 && parts[5] === 'fps_toggle') {
          const wingId = parts[2];
          const roleId = parts[4];
          const flag = interaction.values?.[0];
          if (flag) {
            const allFakePerms = stateManager.getAllFakePermissions(guildId);
            const has = allFakePerms.some((fp) => fp.role_id === roleId && fp.permission_flag === flag);
            if (has) {
              stateManager.revokeFakePermission(guildId, flag, roleId);
            } else {
              stateManager.grantFakePermission(guildId, flag, roleId);
            }
          }
          const allFakePerms = stateManager.getAllFakePermissions(guildId);
          const roleFps = allFakePerms.filter((fp) => fp.role_id === roleId).map((fp) => fp.permission_flag);
          const fpEntries = Object.entries(FAKE_PERMISSION_FLAGS);
          const fpSelect = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('dashboard:hierarchy:' + wingId + ':role:' + roleId + ':fps_toggle')
              .setPlaceholder('Toggle a fake permission')
              .addOptions(fpEntries.slice(0, 25).map(([flag2, def]) => {
                const has = roleFps.includes(flag2);
                return new StringSelectMenuOptionBuilder()
                  .setLabel((has ? '✓ ' : '') + def.label)
                  .setValue(flag2)
                  .setDescription(has ? 'Click to revoke' : 'Click to grant');
              }))
          );
          const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dashboard:hierarchy:wing:' + wingId).setLabel('Back').setStyle(ButtonStyle.Secondary)
          );
          const embed = new EmbedBuilder()
            .setColor(0xc67a3a)
            .setTitle('Fake Permissions for <@&' + roleId + '>')
            .setDescription('Current: ' + (roleFps.length ? '`' + roleFps.join('`, `') + '`' : '*None*'))
            .setTimestamp();
          await interaction.update({ embeds: [embed], components: [fpSelect, backRow] });
          return;
        }
        if (parts.length === 6 && parts[3] === 'role') {
          const wingId = parts[2];
          const roleId = parts[4];
          const action = parts[5];
          switch (action) {
            case 'lead': {
              const roles = stateManager.getWingRoles(guildId, wingId);
              const entry = roles.find((r) => r.role_id === roleId);
              if (entry) {
                stateManager.addWingRole(guildId, wingId, roleId, entry.rank, { isLead: !entry.is_lead, isCategory: !!entry.is_category, isInternal: !!entry.is_internal });
              }
              await interaction.update(hierarchyRolePanel(guildId, wingId, roleId));
              return;
            }
            case 'category': {
              const roles = stateManager.getWingRoles(guildId, wingId);
              const entry = roles.find((r) => r.role_id === roleId);
              if (entry) {
                stateManager.addWingRole(guildId, wingId, roleId, entry.rank, { isLead: !!entry.is_lead, isCategory: !entry.is_category, isInternal: !!entry.is_internal });
              }
              await interaction.update(hierarchyRolePanel(guildId, wingId, roleId));
              return;
            }
            case 'remove':
              stateManager.removeWingRole(guildId, wingId, roleId);
              await interaction.update(hierarchyWingPanel(guildId, wingId));
              return;
            case 'fps': {
              const allFakePerms = stateManager.getAllFakePermissions(guildId);
              const roleFps = allFakePerms.filter((fp) => fp.role_id === roleId).map((fp) => fp.permission_flag);
              const fpEntries = Object.entries(FAKE_PERMISSION_FLAGS);
              const fpSelect = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId('dashboard:hierarchy:' + wingId + ':role:' + roleId + ':fps_toggle')
                  .setPlaceholder('Toggle a fake permission')
                  .addOptions(fpEntries.slice(0, 25).map(([flag, def]) => {
                    const has = roleFps.includes(flag);
                    return new StringSelectMenuOptionBuilder()
                      .setLabel((has ? '✓ ' : '') + def.label)
                      .setValue(flag)
                      .setDescription(has ? 'Click to revoke' : 'Click to grant');
                  }))
              );
              const backRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('dashboard:hierarchy:wing:' + wingId).setLabel('Back').setStyle(ButtonStyle.Secondary)
              );
              const embed = new EmbedBuilder()
                .setColor(0xc67a3a)
                .setTitle('Fake Permissions for <@&' + roleId + '>')
                .setDescription('Current: ' + (roleFps.length ? '`' + roleFps.join('`, `') + '`' : '*None*'))
                .setTimestamp();
              await interaction.update({ embeds: [embed], components: [fpSelect, backRow] });
              return;
            }
          }
        }
      }
      await interaction.reply({ content: 'Unknown action.', ephemeral: true });
    }
  }
}

async function handleDashboardModal(interaction) {
  const { customId, guildId, member } = interaction;
  if (await expireSession(interaction)) return;
  touchSession(interaction.message?.id, interaction.user.id, interaction.channelId);
  if (!canManage(member)) {
    await interaction.reply({ content: 'nuuu', ephemeral: true });
    return;
  }

  const fields = interaction.fields;

  switch (customId) {
    case 'dashboard_modal:prefix': {
      const value = fields.getTextInputValue('prefix_value');
      if (!value || value.length > 3) {
        await interaction.reply({ content: 'Prefix must be 1-3 characters.', ephemeral: true });
        return;
      }
      setPrefix(guildId, value);
      await interaction.update(settingsPanel(guildId));
      break;
    }
case 'dashboard:fakeperms:grant_role':
    case 'dashboard:fakeperms:grant_role:banMembers':
    case 'dashboard:fakeperms:grant_role:kickMembers':
    case 'dashboard:fakeperms:grant_role:manageMessages':
    case 'dashboard:fakeperms:grant_role:manageChannels':
    case 'dashboard:fakeperms:grant_role:manageRoles':
    case 'dashboard:fakeperms:grant_role:manageNicknames':
    case 'dashboard:fakeperms:grant_role:moderateMembers':
    case 'dashboard:fakeperms:grant_role:moveMembers':
    case 'dashboard:fakeperms:grant_role:muteMembers':
    case 'dashboard:fakeperms:grant_role:deafenMembers':
    case 'dashboard:fakeperms:grant_role:manageWebhooks':
    case 'dashboard:fakeperms:grant_role:manageGuild':
    case 'dashboard:fakeperms:grant_role:mentionEveryone':
    case 'dashboard:fakeperms:grant_role:administrator': {
      const flag = customId.replace('dashboard:fakeperms:grant_role:', '');
      const roleId = interaction.values[0];
      stateManager.grantFakePermission(guildId, flag, roleId);
      await interaction.update(fakePermsPanel(guildId));
      return;
    }
    case 'dashboard:fakeperms:revoke_role': {
      const parts = customId.split(':');
      const flag = parts[3];
      const roleId = interaction.values[0];
      stateManager.revokeFakePermission(guildId, flag, roleId);
      await interaction.update(fakePermsPanel(guildId));
      return;
    }
    case 'dashboard_modal:modlog_channel':
    case 'dashboard_modal:modlog_channel': {
      const channelId = fields.getTextInputValue('channel_id');
      stateManager.setModlogChannel(guildId, channelId);
      await interaction.update(moderationPanel(guildId));
      break;
    }
    case 'dashboard_modal:raid_threshold': {
      const count = parseInt(fields.getTextInputValue('value'), 10);
      if (count > 0) stateManager.setRaidConfig(guildId, { join_threshold: count });
      await interaction.update(antiraidConfigPanel(guildId));
      break;
    }
    case 'dashboard_modal:raid_window': {
      const seconds = parseInt(fields.getTextInputValue('value'), 10);
      if (seconds > 0) stateManager.setRaidConfig(guildId, { time_window_seconds: seconds });
      await interaction.update(antiraidConfigPanel(guildId));
      break;
    }
    case 'dashboard_modal:raid_lockout': {
      const minutes = parseInt(fields.getTextInputValue('value'), 10);
      if (minutes > 0) stateManager.setRaidConfig(guildId, { auto_lockout_minutes: minutes });
      await interaction.update(antiraidConfigPanel(guildId));
      break;
    }
    case 'dashboard_modal:antinuke_threshold': {
      const thresholdKey = fields.getTextInputValue('threshold_key');
      const count = parseInt(fields.getTextInputValue('value'), 10);
      if (count > 0) stateManager.setAntinukeConfig(guildId, { [thresholdKey]: count });
      await interaction.update(antinukeConfigPanel(guildId));
      break;
    }
    case 'dashboard_modal:levels_xp': {
      const min = parseInt(fields.getTextInputValue('xp_min'), 10);
      const max = parseInt(fields.getTextInputValue('xp_max'), 10);
      if (min > 0 && max >= min) stateManager.setLevelConfig(guildId, { xp_min: min, xp_max: max });
      await interaction.update(levelsConfigPanel(guildId));
      break;
    }
    case 'dashboard_modal:levels_cooldown': {
      const seconds = parseInt(fields.getTextInputValue('value'), 10);
      if (seconds > 0) stateManager.setLevelConfig(guildId, { cooldown_seconds: seconds });
      await interaction.update(levelsConfigPanel(guildId));
      break;
    }
    case 'dashboard_modal:levels_factor': {
      const value = parseFloat(fields.getTextInputValue('value'));
      if (value > 0) stateManager.setLevelConfig(guildId, { scaling_factor: value });
      await interaction.update(levelsConfigPanel(guildId));
      break;
    }
    case 'dashboard_modal:starboard_threshold': {
      const count = parseInt(fields.getTextInputValue('value'), 10);
      if (count > 0) stateManager.setStarboardConfig(guildId, { threshold: count });
      await interaction.update(starboardConfigPanel(guildId));
      break;
    }
    case 'dashboard_modal:starboard_channel': {
      const channelId = fields.getTextInputValue('channel_id');
      stateManager.setStarboardConfig(guildId, { channel_id: channelId });
      await interaction.update(starboardConfigPanel(guildId));
      break;
    }
    case 'dashboard_modal:policy:commands': {
      try {
        const json = JSON.parse(fields.getTextInputValue('policy_json'));
        stateManager.setGuildSetting(guildId, '_policy_commands', JSON.stringify(json));
        await interaction.update(policyCommandsPanel(guildId));
      } catch (e) {
        await interaction.reply({ content: 'Invalid JSON: ' + e.message, ephemeral: true });
      }
      break;
    }
    case 'dashboard_modal:setting:PERM_GRANT': {
      const permVal = fields.getTextInputValue('setting_value').trim();
      const [roleId, node, mode] = permVal.split(',').map((s) => s.trim());
      if (roleId && node) {
        stateManager.grantRolePermission(guildId, roleId, node, mode || 'allow', interaction.user.id);
      }
      await interaction.update(confirmEmbed(guildId, 'Permission granted', 'dashboard:permissions:roles'));
      break;
    }
    case 'dashboard_modal:setting:PERM_REVOKE': {
      const revVal = fields.getTextInputValue('setting_value').trim();
      const [revRoleId, revNode] = revVal.split(',').map((s) => s.trim());
      if (revRoleId && revNode) {
        stateManager.revokeRolePermission(guildId, revRoleId, revNode);
      }
      await interaction.update(confirmEmbed(guildId, 'Permission revoked', 'dashboard:permissions:roles'));
      break;
    }
    case 'dashboard_modal:setting:PERM_CHANNEL': {
      const chVal = fields.getTextInputValue('setting_value').trim();
      const [chId, chNode, chMode] = chVal.split(',').map((s) => s.trim());
      if (chId && chNode) {
        stateManager.run('INSERT OR REPLACE INTO channel_overrides (guild_id, channel_id, node, mode) VALUES (?, ?, ?, ?)', guildId, chId, chNode, chMode || 'deny');
      }
      await interaction.update(confirmEmbed(guildId, 'Channel override added', 'dashboard:permissions:channels'));
      break;
    }
    case 'dashboard_modal:setting:AUTOROLE_ADD': {
      const roleId = fields.getTextInputValue('setting_value').trim();
      if (roleId) stateManager.addAutorole(guildId, roleId);
      await interaction.update(confirmEmbed(guildId, 'Auto-role added', 'dashboard:autoroles'));
      break;
    }
    case 'dashboard_modal:policy:commands': {
      try {
        const json = JSON.parse(fields.getTextInputValue('policy_json'));
        stateManager.setGuildSetting(guildId, '_policy_commands', JSON.stringify(json));
        await interaction.update(confirmEmbed(guildId, 'Command permissions saved', 'dashboard:policies:commands'));
      } catch (e) {
        await interaction.reply({ content: 'Invalid JSON: ' + e.message, ephemeral: true });
      }
      break;
    }
    case 'dashboard_modal:policy:rolepolicy': {
      try {
        const json = JSON.parse(fields.getTextInputValue('policy_json'));
        stateManager.setGuildSetting(guildId, '_role_policy', JSON.stringify(json));
        const { setOverride } = await import('../../core/config.js');
        setOverride('ROLE_POLICY_OVERRIDE', json);
        await interaction.update(confirmEmbed(guildId, 'Role policy saved', 'dashboard:policies:rolepolicy'));
      } catch (e) {
        await interaction.reply({ content: 'Invalid JSON: ' + e.message, ephemeral: true });
      }
      break;
    }
    case 'dashboard_modal:setting:BREAK_REQUEST_CHANNEL_ID':
    case 'dashboard_modal:setting:ON_BREAK_ROLE_ID':
    case 'dashboard_modal:setting:PBAN_PROPOSAL_CHANNEL_ID':
    case 'dashboard_modal:setting:PBAN_LOG_CHANNEL_ID':
    case 'dashboard_modal:setting:DOCUMENTS_CHANNEL_ID':
    case 'dashboard_modal:setting:modlog_channel':
    case 'dashboard_modal:setting:DEMOTE_EXEMPT_ROLES':
    case 'dashboard_modal:setting:PBAN_PROTECTED_ROLE_IDS':
    case 'dashboard_modal:setting:PBAN_APPEALS_INVITE':
    case 'dashboard_modal:setting:success_response':
    case 'dashboard_modal:setting:stats_excluded_channels': {
      const settingKey = customId.replace('dashboard_modal:setting:', '');
      const value = fields.getTextInputValue('setting_value').trim();
      setOverride(settingKey, value || null);
      stateManager.setGuildSetting(guildId, settingKey, value || null);
      if (settingKey === 'modlog_channel') stateManager.setModlogChannel(guildId, value || null);
      if (settingKey === 'DOCUMENTS_CHANNEL_ID') stateManager.setDocumentsChannel(guildId, value || null);
      await interaction.update(confirmEmbed(guildId, '`' + settingKey + '` saved', 'dashboard:main'));
      break;
    }
    case 'dashboard_modal:hierarchy:add': {
      const wingId = fields.getTextInputValue('wing_id').trim().toLowerCase().replace(/\s+/g, '_');
      const label = fields.getTextInputValue('wing_label').trim();
      const description = fields.getTextInputValue('wing_description').trim();
      const prefix = fields.getTextInputValue('wing_prefix').trim().toLowerCase();
      const categoryId = fields.getTextInputValue('wing_category').trim();
      if (!wingId || !label || !prefix) {
        await interaction.reply({ content: 'Wing ID, label, and prefix are required.', ephemeral: true });
        return;
      }
      const existing = stateManager.getWing(guildId, wingId);
      if (existing) {
        await interaction.reply({ content: 'A wing with that ID already exists.', ephemeral: true });
        return;
      }
      const wings = stateManager.getWings(guildId);
      stateManager.createWing(guildId, wingId, label, prefix, description, wings.length);
      if (categoryId) stateManager.setWingCategory(guildId, wingId, categoryId);
      await interaction.update(hierarchyPanel(guildId));
      break;
    }
    case 'dashboard_modal:hierarchy:reorder': {
      const orderStr = fields.getTextInputValue('wing_order');
      const wingIds = orderStr.split(',').map((s) => s.trim()).filter(Boolean);
      if (wingIds.length) {
        stateManager.reorderWings(guildId, wingIds);
      }
      await interaction.update(hierarchyPanel(guildId));
      break;
    }
    default: {
      if (customId.startsWith('dashboard_modal:hierarchy:rename:')) {
        const wingId = customId.split(':')[3];
        const label = fields.getTextInputValue('wing_label').trim();
        if (label) stateManager.updateWing(guildId, wingId, { label });
        await interaction.update(hierarchyWingPanel(guildId, wingId));
        break;
      }
      if (customId.startsWith('dashboard_modal:hierarchy:description:')) {
        const wingId = customId.split(':')[3];
        const description = fields.getTextInputValue('wing_description').trim();
        stateManager.updateWing(guildId, wingId, { description });
        await interaction.update(hierarchyWingPanel(guildId, wingId));
        break;
      }
      if (customId.startsWith('dashboard_modal:hierarchy:prefix:')) {
        const wingId = customId.split(':')[3];
        const prefix = fields.getTextInputValue('wing_prefix').trim().toLowerCase();
        if (prefix) stateManager.updateWing(guildId, wingId, { channelPrefix: prefix });
        await interaction.update(hierarchyWingPanel(guildId, wingId));
        break;
      }
      if (customId.startsWith('dashboard_modal:hierarchy:category:')) {
        const wingId = customId.split(':')[3];
        const categoryId = fields.getTextInputValue('wing_category').trim();
        stateManager.setWingCategory(guildId, wingId, categoryId || null);
        await interaction.update(hierarchyWingPanel(guildId, wingId));
        break;
      }
      if (customId.startsWith('dashboard_modal:hierarchy:role_add:')) {
        const wingId = customId.split(':')[4];
        const roleId = fields.getTextInputValue('role_id').trim();
        const rank = fields.getTextInputValue('role_rank').trim() || '1';
        const leadStr = fields.getTextInputValue('role_lead').trim().toLowerCase();
        const catStr = fields.getTextInputValue('role_category').trim().toLowerCase();
        if (!roleId) {
          await interaction.reply({ content: 'Role ID is required.', ephemeral: true });
          return;
        }
        stateManager.addWingRole(guildId, wingId, roleId, rank, {
          isLead: leadStr === 'yes' || leadStr === 'y' || leadStr === 'true',
          isCategory: catStr === 'yes' || catStr === 'y' || catStr === 'true'
        });
        await interaction.update(hierarchyWingPanel(guildId, wingId));
        break;
      }
      await interaction.reply({ content: 'Unknown modal.', ephemeral: true });
    }
  }
}

export { handlePrefixCommand, handleSlashCommand, handleDashboardButton, handleDashboardModal };
export default handlePrefixCommand;
