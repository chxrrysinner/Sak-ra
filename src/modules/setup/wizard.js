import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import logger from '../../core/logger.js';
import stateManager from '../../core/state.js';
import config, { setOverride } from '../../core/config.js';
import { getPrefix, setPrefix } from '../../core/prefix.js';
import { HALLOWS_ORANGE } from '../../core/embeds.js';
import {
  wizardEmbed, navRow, channelOptions, roleOptions,
  defaultWings, ALL_PERM_FLAGS, wingCountChoices,
  WIZARD_KEY, COMPLETE_KEY
} from './wizard-helpers.js';
import { renderStep as renderStepInner } from './wizard-steps.js';

async function renderStep(guildId, step, guild) {
  return renderStepInner(guildId, step, guild);
}

function resolveWingRef(guildId, input) {
  const raw = (input || '').trim().replace(/[<@&>]/g, '');
  if (!raw) return null;
  if (/^\d{16,20}$/.test(raw)) return raw;
  const leadMatch = raw.match(/^M,(.+)$/i);
  const rankMatch = leadMatch ? null : raw.match(/^(\d+),(.+)$/);
  const wingId = (leadMatch?.[1] || rankMatch?.[2] || raw).trim().toLowerCase();
  const wings = stateManager.getWings(guildId);
  const wing = wings.find((w) => w.id.toLowerCase() === wingId || w.label?.toLowerCase() === wingId);
  if (!wing) return raw;
  const roles = stateManager.getWingRoles(guildId, wing.id);
  if (leadMatch) {
    const lead = roles.find((r) => r.is_lead);
    return lead ? lead.role_id : raw;
  }
  if (rankMatch) {
    const rankNum = parseInt(rankMatch[1], 10);
    const ranked = roles.filter((r) => !r.is_lead).sort((a, b) => (a.rank || 0) - (b.rank || 0));
    const match = ranked.find((r) => Number(r.rank) === rankNum);
    return match ? match.role_id : raw;
  }
  // Bare wing name — resolve to all role IDs in that wing
  return { _wingAll: true, wingId: wing.id };
}

function resolveWingRefs(guildId, input) {
  const results = [];
  const raw = (input || '').trim();
  if (!raw) return results;

  // Match tokens: N,word | M,word | <@&role> | raw role ID | bare word — split on commas BETWEEN tokens
  const tokenRe = /(?:\d+,[a-zA-Z_][a-zA-Z_0-9-]*|M,[a-zA-Z_][a-zA-Z_0-9-]*|<@&\d{16,20}>|\d{16,20}|[a-zA-Z_][a-zA-Z_0-9-]*)/gi;
  const tokens = raw.match(tokenRe) || [];
  const seen = new Set();

  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    const ref = resolveWingRef(guildId, token);
    if (ref && typeof ref === 'object' && ref._wingAll) {
      const roles = stateManager.getWingRoles(guildId, ref.wingId);
      for (const r of roles) {
        if (!seen.has(r.role_id)) {
          results.push(r.role_id);
          seen.add(r.role_id);
        }
      }
    } else if (ref && typeof ref === 'string') {
      results.push(ref);
    }
  }
  return results;
}

function resolveWingRefSingle(guildId, input) {
  const ref = resolveWingRef(guildId, input);
  if (ref && typeof ref === 'object' && ref._wingAll) {
    const roles = stateManager.getWingRoles(guildId, ref.wingId);
    return roles.length ? roles[0].role_id : input;
  }
  return typeof ref === 'string' ? ref : input;
}

async function sendWizard(guildId, channel, startStep) {
  const guild = await globalThis.__HALLOWS_CLIENT__?.guilds?.fetch(guildId).catch(() => null);
  if (!guild || !channel) return;

  const step = startStep !== undefined ? startStep : Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
  const payload = await renderStep(guildId, step, guild);
  const msg = await channel.send(payload);
  stateManager.setGuildSetting(guildId, 'setup_message_id', msg.id);
  stateManager.setGuildSetting(guildId, 'setup_channel_id', msg.channel.id);
}

async function handleSetupCommand(context, guildId, channel) {
  const reply = context.reply ? context.reply.bind(context) : (content) => context.editReply(content);

  if (stateManager.getGuildSetting(guildId, COMPLETE_KEY) === 'true') {
    await reply({ content: 'Setup is already complete. Use `' + getPrefix(guildId) + 'dashboard` to modify settings.' }).catch(() => {});
    return;
  }

  const savedStep = stateManager.getGuildSetting(guildId, WIZARD_KEY);
  if (savedStep !== null && savedStep !== undefined) {
    const step = Number(savedStep);
    if (!isNaN(step) && step > 0) {
      await sendWizard(guildId, channel, step);
      await reply({ content: 'Resuming setup wizard from step ' + (step + 1) + '...' }).catch(() => {});
      return;
    }
  }

  stateManager.setGuildSetting(guildId, WIZARD_KEY, '0');
  await sendWizard(guildId, channel);
  await reply({ content: 'Setup wizard started!' }).catch(() => {});
}

async function handlePrefixCommand(message, args, guildId) {
  const trimmed = (typeof args === 'string' ? args : '').trim().toLowerCase();
  if (trimmed === 'reset') {
    stateManager.setGuildSetting(guildId, WIZARD_KEY, null);
    stateManager.setGuildSetting(guildId, COMPLETE_KEY, null);
    await message.reply('Setup data cleared. Run `' + getPrefix(guildId) + 'setup` to start fresh.').catch(() => {});
    return;
  }
  await handleSetupCommand(message, guildId, message.channel);
}

async function handleSlashCommand(interaction) {
  await interaction.deferReply();
  await handleSetupCommand(interaction, interaction.guildId, interaction.channel);
}

async function processSelect(guildId, customId, values, guild) {
  const key = customId.replace('setup:sel:', '');

  if (key === 'wingcount') {
    const count = parseInt(values[0], 10);
    stateManager.setGuildSetting(guildId, '_wing_count', String(count));
    if (count === 0) {
      stateManager.setGuildSetting(guildId, WIZARD_KEY, '16');
      return renderStep(guildId, 16, guild);
    }
    stateManager.setGuildSetting(guildId, WIZARD_KEY, '8');
    return renderStep(guildId, 8, guild);
  }

  if (key.startsWith('cmdpolicy:wing')) {
    const wingId = values[0];
    const wings = stateManager.getWings(guildId);
    const wing = wings.find((w) => w.id === wingId);
    if (!wing) return renderStep(guildId, Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0)), guild);

    const roles = stateManager.getWingRoles(guildId, wingId);
    const embed = new EmbedBuilder()
      .setColor(HALLOWS_ORANGE)
      .setTitle('Command Policy: ' + (wing.label || wingId))
      .setDescription([
        'These commands control what this wing can do in tickets.',
        '',
        '**Reply** — Can reply to tickets in this wing',
        '**Close** — Can close tickets in this wing',
        '**Claim** — Can claim tickets in this wing',
        '**Transfer** — Can transfer tickets out',
        '**Escalate** — Can escalate to Internals',
        '',
        'By default, a wing can reply and close its own tickets.',
        'Select a permission below to change it.'
      ].join('\n'))
      .setTimestamp();

    const perms = ['reply', 'close', 'claim', 'transfer', 'escalate'];
    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('setup:sel:cmdpolicy:edit:' + wingId)
        .setPlaceholder('Toggle a permission for this wing')
        .addOptions(perms.map((p) => ({
          label: p.charAt(0).toUpperCase() + p.slice(1),
          value: p,
          description: 'Toggle ' + p + ' permission for ' + (wing.label || wingId)
        })))
    );

    const backRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setup:step:16').setLabel('Back').setStyle(ButtonStyle.Secondary),
      navRow(guildId).components[1]
    );

    return { embeds: [embed], components: [selectRow, backRow] };
  }

  if (key.startsWith('cmdpolicy:edit:')) {
    const wingId = key.replace('cmdpolicy:edit:', '');
    const perm = values[0];
    const cfgKey = 'cmdpolicy_' + wingId + '_' + perm;
    const current = stateManager.getGuildSetting(guildId, cfgKey, 'deny');
    const newVal = current === 'allow' ? 'deny' : 'allow';
    stateManager.setGuildSetting(guildId, cfgKey, newVal);
    const wings = stateManager.getWings(guildId);
    const wing = wings.find((w) => w.id === wingId);
    const embed = new EmbedBuilder()
      .setColor(HALLOWS_ORANGE)
      .setTitle('Command Policy: ' + (wing ? wing.label : wingId))
      .setDescription([
        '**' + perm.charAt(0).toUpperCase() + perm.slice(1) + '** is now **' + newVal.toUpperCase() + 'ED** for **' + (wing ? wing.label : wingId) + '**.',
        '',
        'Select another permission, or go back.'
      ].join('\n'))
      .setTimestamp();
    const perms = ['reply', 'close', 'claim', 'transfer', 'escalate'];
    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('setup:sel:cmdpolicy:edit:' + wingId)
        .setPlaceholder('Toggle a permission')
        .addOptions(perms.map((p) => ({
          label: (stateManager.getGuildSetting(guildId, 'cmdpolicy_' + wingId + '_' + p, 'deny') === 'allow' ? '✓ ' : '') + p.charAt(0).toUpperCase() + p.slice(1),
          value: p,
          description: 'Current: ' + (stateManager.getGuildSetting(guildId, 'cmdpolicy_' + wingId + '_' + p, 'deny') === 'allow' ? 'Allowed' : 'Denied')
        })))
    );
    const backRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setup:step:16').setLabel('Back').setStyle(ButtonStyle.Secondary),
      navRow(guildId).components[1]
    );
    return { embeds: [embed], components: [selectRow, backRow] };
  }

  if (key.startsWith('category:')) {
    const wingIndex = parseInt(key.split(':')[1], 10);
    const categoryId = values[0];
    const existingWings = stateManager.getWings(guildId);
    let wing = existingWings[wingIndex];
    if (!wing) {
      const w = defaultWings[wingIndex] || { id: `wing${wingIndex + 1}`, label: `Wing ${wingIndex + 1}`, prefix: `wing${wingIndex + 1}`, description: '' };
      stateManager.createWing(guildId, w.id, w.label, w.prefix, w.description, wingIndex);
      wing = stateManager.getWings(guildId)[wingIndex];
    }
    if (wing) {
      stateManager.setWingCategory(guildId, wing.id, categoryId);
    }
    const nextStep = 8 + wingIndex + 1;
    stateManager.setGuildSetting(guildId, WIZARD_KEY, String(nextStep));
    return renderStep(guildId, nextStep, guild);
  }

  const curStep = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));

  if (key.startsWith('perm:')) {
    const flag = key.split(':')[1];
    const resolvedIds = resolveWingRefs(guildId, values[0]);
    for (const rid of resolvedIds) {
      try { stateManager.grantFakePermission(guildId, flag, rid); } catch {}
    }
    return renderStep(guildId, curStep, guild);
  }

  if (key.startsWith('prot:')) {
    stateManager.setGuildSetting(guildId, 'PBAN_PROTECTED_ROLE_IDS', values.join(','));
    return renderStep(guildId, curStep, guild);
  }

  if (key.startsWith('wingrole:')) {
    const wingId = key.replace('wingrole:', '');
    const roleId = values[0];
    stateManager.addWingRole(guildId, wingId, roleId);
    return renderStep(guildId, curStep, guild);
  }

  if (key === 'ON_BREAK_ROLE_ID') {
    const roleId = values[0];
    setOverride('ON_BREAK_ROLE_ID', roleId);
    stateManager.setGuildSetting(guildId, 'ON_BREAK_ROLE_ID', roleId);
    return renderStep(guildId, curStep, guild);
  }

  if (key === 'BREAK_REQUEST_CHANNEL_ID' || key === 'PBAN_PROPOSAL_CHANNEL_ID' || key === 'PBAN_LOG_CHANNEL_ID' || key === 'ANTI_BOT_AUTOMOD_CHANNEL_ID' || key === 'SUPPORT_PANEL_CHANNEL_ID' || key === 'TRANSCRIPT_CHANNEL_ID' || key === 'modlog_channel') {
    const channelId = values[0];
    setOverride(key, channelId);
    stateManager.setGuildSetting(guildId, key, channelId);
    if (key === 'modlog_channel') stateManager.setModlogChannel(guildId, channelId);
    if (key === 'DOCUMENTS_CHANNEL_ID') stateManager.setDocumentsChannel(guildId, channelId);
    return renderStep(guildId, curStep, guild);
  }

  return renderStep(guildId, Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0)), guild);
}

async function handleWizardButton(interaction) {
  try {
    await handleWizardButtonInner(interaction);
  } catch (error) {
    logger.warn({ error: error.message, stack: error.stack?.split('\n').slice(0, 4).join('|'), customId: interaction.customId, code: error.code }, 'Wizard button handler error');
    if (error.code === 10062) {
      try { await interaction.followUp({ content: 'That session expired. Run `' + getPrefix(interaction.guildId) + 'setup` again.', ephemeral: true }); } catch {}
    } else {
      try { await interaction.reply({ content: 'Something went wrong. Try `' + getPrefix(interaction.guildId) + 'setup` again.', ephemeral: true }); } catch {}
    }
  }
}

async function handleWizardButtonInner(interaction) {
  const { customId, guildId, guild } = interaction;
  const step = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));

  if (customId.startsWith('setup:removeperm:')) {
    const flag = customId.replace('setup:removeperm:', '');
    const existingPerms = stateManager.getAllFakePermissions(guildId) || [];
    const currentRoleIds = existingPerms.filter((p) => p.permission_flag === flag).map((p) => p.role_id);
    const modal = new ModalBuilder()
      .setCustomId(`setup_modal:removeperm:${flag}`)
      .setTitle('Remove Roles from ' + flag)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('remove_role_ids')
            .setLabel('Roles to remove (comma-sep or wing refs)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder(currentRoleIds.length ? 'e.g. ' + currentRoleIds.slice(0, 2).join(', ') : 'No roles currently assigned')
        )
      );
    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith('setup:id:')) {
    const key = customId.replace('setup:id:', '');
    const label = key.startsWith('perm:') ? 'Role ID'
      : key.startsWith('category:') ? 'Category Channel ID'
      : key.startsWith('catrole:') ? 'Role ID'
      : key.startsWith('wingrole:') ? 'Role ID'
      : key === 'ON_BREAK_ROLE_ID' ? 'Role ID'
      : key === 'leadCategoryRole' ? 'Role ID'
      : 'Channel ID';
    const modal = new ModalBuilder()
      .setCustomId('setup_modal:id:' + key)
      .setTitle('Enter ' + label)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('id_value')
            .setLabel(label)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(30)
        )
      );
    await interaction.showModal(modal);
    return;
  }

  if (customId === 'setup:prev') {
    let newStep = Math.max(0, step - 1);
    // Skip transition/gap steps (past the last fake perm, before the next real step)
    if (newStep === 31 + ALL_PERM_FLAGS.length /* 58 */) {
      newStep = 31 + ALL_PERM_FLAGS.length - 1; // go to last fake perm (57)
    }
    stateManager.setGuildSetting(guildId, WIZARD_KEY, String(newStep));
    await interaction.update(await renderStep(guildId, newStep, guild));
    return;
  }

  if (customId === 'setup:cancel') {
    await interaction.update({
      embeds: [new EmbedBuilder().setColor(HALLOWS_ORANGE).setTitle('Setup Cancelled').setDescription('Resume anytime from `' + getPrefix(guildId) + 'dashboard`.').setTimestamp()],
      components: []
    });
    return;
  }

  if (customId === 'setup:finish') {
    stateManager.setGuildSetting(guildId, WIZARD_KEY, '64');
    stateManager.setGuildSetting(guildId, COMPLETE_KEY, 'true');
    await interaction.update(await renderStep(guildId, 64, guild));
    return;
  }

  if (/^setup:step:\d+$/.test(customId)) {
    const target = parseInt(customId.split(':')[2], 10);
    stateManager.setGuildSetting(guildId, WIZARD_KEY, String(target));
    await interaction.update(await renderStep(guildId, target, guild));
    return;
  }

  if (customId.startsWith('setup:step:') && customId.includes(':')) {
    const parts = customId.split(':');
    const targetStep = parseInt(parts[2], 10);

    if (targetStep === 1 && parts[3] === 'prefix') {
      const modal = new ModalBuilder()
        .setCustomId('setup_modal:prefix')
        .setTitle('Set Command Prefix')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('prefix_value').setLabel('Prefix (1-3 characters)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setValue(getPrefix(guildId))
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (targetStep === 2 && parts[3] === 'appearance') {
      const modal = new ModalBuilder()
        .setCustomId('setup_modal:appearance')
        .setTitle('Bot Appearance')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('embed_color').setLabel('Embed colour (hex, e.g. c67a3a)').setStyle(TextInputStyle.Short).setRequired(true).setValue(config.style.color.toString(16).padStart(6, '0'))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('title_prefix').setLabel('Title prefix (optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setValue(config.style.titlePrefix)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('footer_text').setLabel('Footer text').setStyle(TextInputStyle.Short).setRequired(false).setValue(config.style.footer)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (targetStep === 4 && parts[3] === 'content') {
      const modal = new ModalBuilder()
        .setCustomId('setup_modal:panel_content')
        .setTitle('Support Panel Config')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('panel_text').setLabel('Embed text').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(config.supportPanel.content || 'Click the button below to open a ticket.')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('button_id').setLabel('Button custom ID').setStyle(TextInputStyle.Short).setRequired(true).setValue(config.supportPanel.buttonId)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('button_label').setLabel('Button label text').setStyle(TextInputStyle.Short).setRequired(true).setValue('Open Ticket')
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (targetStep === 6 && parts[3] === 'post') {
      const channelId = config.supportPanel.channelId;
      if (channelId) {
        const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
        if (channel) {
          const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(config.supportPanel.buttonId).setLabel('Open Ticket').setStyle(ButtonStyle.Primary)
          );
          await channel.send({ content: config.supportPanel.content || 'Click the button below to open a ticket.', components: [btnRow] });
        }
      }
      stateManager.setGuildSetting(guildId, WIZARD_KEY, '7');
      await interaction.update(await renderStep(guildId, 7, guild));
      return;
    }

    if (targetStep >= 20 && parts[3] === 'snippets') {
      const snippets = config.policy.savedSnippets || {};
      const names = Object.keys(snippets);
      if (names.length) {
        return renderSnippetList(interaction, guildId, guild, names);
      }
      const modal = new ModalBuilder()
        .setCustomId('setup_modal:snippet:0')
        .setTitle('Add a Saved Snippet')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('snippet_name').setLabel('Name (e.g. hi, wait, askproof)').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('snippet_message').setLabel('Message content').setStyle(TextInputStyle.Paragraph).setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (targetStep === 21 && parts[3] === 'aliases') {
      const current = stateManager.getGuildSetting(guildId, 'ticket_commands', '');
      const defaultAliases = { reply: '?r', close: '?close', claim: '?c', transfer: '?transfer', escalate: '?escalate' };
      let aliases;
      try { aliases = { ...defaultAliases, ...JSON.parse(current) }; } catch { aliases = defaultAliases; }
      const modal = new ModalBuilder()
        .setCustomId('setup_modal:aliases')
        .setTitle('Command Aliases (JSON)')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('aliases_json').setLabel('Edit the command alias map').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(JSON.stringify(aliases, null, 2))
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (targetStep === 23 && parts[3] === 'prot') {
      const modal = new ModalBuilder()
        .setCustomId('setup_modal:prot_roles')
        .setTitle('PBAN Protected Roles')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('prot_role_ids').setLabel('Role IDs (comma-separated)').setStyle(TextInputStyle.Paragraph).setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (targetStep === 24 && parts[3] === 'appeal') {
      const modal = new ModalBuilder()
        .setCustomId('setup_modal:appeal')
        .setTitle('PBAN Appeals Invite')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('appeal_link').setLabel('Discord invite link').setStyle(TextInputStyle.Short).setRequired(false).setValue(config.pban.appealsInvite || '')
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (targetStep === 59 && parts[3] === 'raid') {
      const raidCfg = stateManager.getRaidConfig?.(guildId) || {};
      const modal = new ModalBuilder()
        .setCustomId('setup_modal:raid')
        .setTitle('Anti-Raid Configuration')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('raid_enabled').setLabel('Enabled (true/false)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(!!raidCfg.enabled))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('raid_threshold').setLabel('Join threshold').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(raidCfg.join_threshold || 10))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('raid_window').setLabel('Time window (seconds)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(raidCfg.time_window_seconds || 10))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('raid_lockout').setLabel('Lockout duration (minutes)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(raidCfg.auto_lockout_minutes || 15))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('raid_notify').setLabel('Notify channel ID (optional)').setStyle(TextInputStyle.Short).setRequired(false).setValue(raidCfg.notify_channel_id || '')
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (targetStep === 60 && parts[3] === 'nuke') {
      const nukeCfg = stateManager.getAntinukeConfig?.(guildId) || {};
      const modal = new ModalBuilder()
        .setCustomId('setup_modal:nuke')
        .setTitle('Anti-Nuke Configuration')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nuke_enabled').setLabel('Enabled (true/false)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(!!nukeCfg.enabled))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nuke_chan_del').setLabel('Channel delete threshold').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(nukeCfg.channel_delete_threshold || 3))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nuke_role_del').setLabel('Role delete threshold').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(nukeCfg.role_delete_threshold || 3))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nuke_ban_add').setLabel('Ban threshold').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(nukeCfg.ban_add_threshold || 3))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nuke_window').setLabel('Time window (seconds)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(nukeCfg.time_window_seconds || 5))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nuke_lockout').setLabel('Lockout duration (minutes)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(nukeCfg.auto_lockout_minutes || 30))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nuke_action').setLabel('Action (log/lockdown/rollback)').setStyle(TextInputStyle.Short).setRequired(true).setValue(nukeCfg.action_on_trigger || 'lockdown')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nuke_notify').setLabel('Notify channel ID (optional)').setStyle(TextInputStyle.Short).setRequired(false).setValue(nukeCfg.notify_channel_id || '')
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (targetStep === 24 && parts[3] === 'prot') {
      const modal = new ModalBuilder()
        .setCustomId('setup_modal:prot_roles')
        .setTitle('PBAN Protected Roles')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('prot_role_ids').setLabel('Role IDs (comma-separated)').setStyle(TextInputStyle.Paragraph).setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (targetStep === 25 && parts[3] === 'appeal') {
      const modal = new ModalBuilder()
        .setCustomId('setup_modal:appeal')
        .setTitle('PBAN Appeals Invite')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('appeal_link').setLabel('Discord invite link').setStyle(TextInputStyle.Short).setRequired(false)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (targetStep === 26 && parts[3] === 'demote_exempt') {
      const modal = new ModalBuilder()
        .setCustomId('setup_modal:demote_exempt')
        .setTitle('Demote Exempt Roles')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('demote_exempt_ids').setLabel('Role IDs (comma-separated)').setStyle(TextInputStyle.Paragraph).setRequired(false)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (targetStep === 61 && parts[3] === 'apps') {
      const curChan = stateManager.getGuildSetting(guildId, 'APPS_REVIEW_CHANNEL_ID', '');
      const curRole = stateManager.getGuildSetting(guildId, 'APPS_APPROVED_ROLE_ID', '');
      const curGhost = stateManager.getGuildSetting(guildId, 'APPS_GHOST_PING_CHANNEL_ID', '');
      const modal = new ModalBuilder()
        .setCustomId('setup_modal:apps')
        .setTitle('Applications Config')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('apps_channel').setLabel('Review channel ID').setStyle(TextInputStyle.Short).setRequired(false).setValue(curChan)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('apps_role').setLabel('Approved applicant role ID').setStyle(TextInputStyle.Short).setRequired(false).setValue(curRole)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('apps_ghost').setLabel('Ghost ping channel ID').setStyle(TextInputStyle.Short).setRequired(false).setValue(curGhost)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('apps_approve_dm').setLabel('Approve DM message').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(config.approveDmMessage || '')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('apps_reject_dm').setLabel('Reject DM message').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(config.rejectDmMessage || '')
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (targetStep >= 8 && targetStep <= 15 && parts[3] === 'role') {
      const wingId = parts[4];
      const modal = new ModalBuilder()
        .setCustomId('setup_modal:id:wingrole:' + wingId)
        .setTitle('Add Role to ' + wingId)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('id_value').setLabel('Role ID').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('is_lead').setLabel('Lead? (yes/no)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(3)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (targetStep >= 8 && targetStep <= 15) {
      stateManager.setGuildSetting(guildId, WIZARD_KEY, String(targetStep + 1));
      await interaction.update(await renderStep(guildId, targetStep + 1, guild));
      return;
    }
  }

  if (customId.startsWith('setup:wing:')) {
    const parts = customId.split(':');
    const wingIndex = parseInt(parts[2], 10);
    const existing = stateManager.getWings(guildId);
    const w = existing[wingIndex] || { id: `wing${wingIndex + 1}` };

    if (parts[3] === 'edit') {
      const def = defaultWings[wingIndex] || { label: `Wing ${wingIndex + 1}`, prefix: `wing${wingIndex + 1}`, description: '' };
      const details = existing[wingIndex] || def;
      const modal = new ModalBuilder()
        .setCustomId(`setup_modal:wing:${wingIndex}`)
        .setTitle(`Wing ${wingIndex + 1} Details`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('wing_id').setLabel('ID slug (e.g. assistants)').setStyle(TextInputStyle.Short).setRequired(true).setValue(details.id)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('wing_label').setLabel('Label (e.g. Assistants)').setStyle(TextInputStyle.Short).setRequired(true).setValue(details.label)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('wing_prefix').setLabel('Channel prefix (e.g. general)').setStyle(TextInputStyle.Short).setRequired(true).setValue(details.channel_prefix || details.prefix || details.id)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('wing_desc').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(details.description || '')
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (parts[3] === 'importroles') {
      const existingWings = stateManager.getWings(guildId);
      const wing = existingWings[wingIndex];
      const existingRoles = wing ? stateManager.getWingRoles(guildId, wing.id) : [];
      const modal = new ModalBuilder()
        .setCustomId(`setup_modal:importroles:${wingIndex}`)
        .setTitle('Import Role IDs')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('role_ids')
              .setLabel('Role IDs (comma-separated)')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setPlaceholder('123456789, 987654321, 555666777')
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (parts[3] === 'editstructure') {
      const existingWings = stateManager.getWings(guildId);
      const wing = existingWings[wingIndex];
      if (!wing) { await interaction.reply({ content: 'Wing not found.', ephemeral: true }); return; }
      const existingRoles = stateManager.getWingRoles(guildId, wing.id);
      if (!existingRoles.length) {
        await interaction.reply({ content: 'No roles in this wing yet. Use **Import Role IDs** first.', ephemeral: true });
        return;
      }
      const roleLines = existingRoles.map((r) =>
        '<@&' + r.role_id + '>' + (r.is_lead ? ' — **Lead**' : ' — Rank ' + (r.rank || '?'))
      );
      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`setup:sel:editrole:${wingIndex}`)
          .setPlaceholder('Select a role to change its rank')
          .addOptions(existingRoles.map((r) => {
            const desc = r.is_lead ? 'Lead — click to change rank' : 'Rank ' + (r.rank || '?') + ' — click to change';
            return new StringSelectMenuOptionBuilder()
              .setLabel(r.role_id.slice(0, 8) + '...')
              .setValue(r.role_id)
              .setDescription(desc);
          }))
      );
      const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`setup:step:${8 + wingIndex}`).setLabel('← Back to Wing').setStyle(ButtonStyle.Secondary)
      );
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setColor(HALLOWS_ORANGE)
          .setTitle('Edit Role Structure: ' + (wing.label || wing.id))
          .setDescription([
            '**Current roles in this wing:**',
            ...roleLines,
            '',
            'Select a role from the dropdown below, then enter a **rank number** (1=lowest) or **M** for lead.',
            'The modal will confirm your choice.'
          ].join('\n'))
          .setTimestamp()
        ],
        components: [selectRow, backRow]
      });
      return;
    }

    if (parts[3] === 'removerole') {
      const existingWings = stateManager.getWings(guildId);
      const wing = existingWings[wingIndex];
      if (!wing) { await interaction.reply({ content: 'Wing not found.', ephemeral: true }); return; }
      const existingRoles = stateManager.getWingRoles(guildId, wing.id);
      const numbered = existingRoles.filter((r) => !r.is_lead);
      if (!numbered.length) {
        await interaction.reply({ content: 'No ranked roles to remove.', ephemeral: true });
        return;
      }
      const existingList = numbered.map((r) => r.role_id).join(', ');
      const placeholder = existingList.length > 80 ? numbered.length + ' roles currently in wing' : 'e.g. ' + existingList;
      const modal = new ModalBuilder()
        .setCustomId(`setup_modal:removerole:${wingIndex}`)
        .setTitle('Remove Roles')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('remove_role_ids')
              .setLabel('Role IDs to remove (comma-separated)')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setPlaceholder(placeholder)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (parts[3] === 'lead') {
      const modal = new ModalBuilder()
        .setCustomId(`setup_modal:lead:${wingIndex}`)
        .setTitle(`Set Lead Role for ${w.label || w.id}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('role_id').setLabel('Lead Role ID').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)
          )
        );
      await interaction.showModal(modal);
      return;
    }
  }

  if (customId.startsWith('setup:role:')) {
    const wingId = customId.replace('setup:role:', '');
    const modal = new ModalBuilder()
      .setCustomId('setup_modal:id:wingrole:' + wingId)
      .setTitle('Add Role to ' + wingId)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('id_value').setLabel('Role ID').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('is_lead').setLabel('Lead? (yes/no)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(3)
        )
      );
    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith('setup:branch:toggle:')) {
    const wingId = customId.replace('setup:branch:toggle:', '');
    const wings = stateManager.getWings(guildId);
    const wing = wings.find((w) => w.id === wingId);
    if (!wing) { await interaction.reply({ content: 'Wing not found.', ephemeral: true }); return; }
    const current = stateManager.getGuildSetting(guildId, `branch_${wingId}_global`, '');
    const newVal = current === 'true' ? '' : 'true';
    stateManager.setGuildSetting(guildId, `branch_${wingId}_global`, newVal);
    const cur = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
    await interaction.update(await renderStep(guildId, cur, guild));
    return;
  }

  if (customId === 'setup:cmdpolicy') {
    const wings = stateManager.getWings(guildId);
    if (!wings.length) {
      await interaction.update({ embeds: [new EmbedBuilder().setColor(HALLOWS_ORANGE).setTitle('No Wings').setDescription('No wings configured yet. Set up wings first.').setTimestamp()], components: [navRow(guildId)] });
      return;
    }
    const cmdKeys = ['reply', 'close', 'claim', 'unclaim', 'transfer', 'escalate', 'snippets', 'help', 'timer'];
    const embed = new EmbedBuilder()
      .setColor(HALLOWS_ORANGE)
      .setTitle('Command Policies')
      .setDescription([
        'Each command can be restricted to specific wings.',
        'Select a wing below to see its current policy, or pick a command to edit.',
        '',
        'Current defaults: All wings can reply/close their own tickets.',
        'Only Internals can escalate/transfer across wings.'
      ].join('\n'))
      .setTimestamp();

    const wingOptions = wings.slice(0, 25).map((w) => ({
      label: w.label || w.id, value: w.id, description: 'Edit command policy for this wing'
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('setup:sel:cmdpolicy:wing')
        .setPlaceholder('Select a wing to configure')
        .addOptions(wingOptions.length ? wingOptions : [{ label: 'No wings', value: '_none' }])
    );

    const backRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setup:step:16').setLabel('Back').setStyle(ButtonStyle.Secondary),
      navRow(guildId).components[1]
    );

    await interaction.update({ embeds: [embed], components: [row, backRow] });
    return;
  }

  await interaction.reply({ content: 'Unknown action.', ephemeral: true });
}

async function handleWizardSelect(interaction) {
  try {
    const { customId, guildId, guild, values } = interaction;

    // Edit role structure — needs showModal, not update
    if (customId.startsWith('setup:sel:editrole:')) {
      const wingIndex = parseInt(customId.split(':')[3], 10);
      const roleId = values[0];
      const existingWings = stateManager.getWings(guildId);
      const wing = existingWings[wingIndex];
      if (!wing) { await interaction.reply({ content: 'Wing not found.', ephemeral: true }); return; }
      const existingRoles = stateManager.getWingRoles(guildId, wing.id);
      const role = existingRoles.find((r) => r.role_id === roleId);
      const modal = new ModalBuilder()
        .setCustomId(`setup_modal:setrank:${wingIndex}:${roleId}`)
        .setTitle('Set Rank for <@&' + roleId.slice(0, 8) + '...>')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('rank_value')
              .setLabel('Rank (1=lowest) or M for lead')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(3)
              .setValue(role?.is_lead ? 'M' : String(role?.rank || '1'))
          )
        );
      await interaction.showModal(modal);
      return;
    }

    await interaction.update(await processSelect(guildId, customId, values, guild));
  } catch (error) {
    logger.warn({ error: error.message, customId: interaction.customId }, 'Wizard select error');
    if (error.code === 10062) {
      try { await interaction.followUp({ content: 'That session expired. Run `' + getPrefix(interaction.guildId) + 'setup` again.', ephemeral: true }); } catch {}
    }
  }
}

async function handleWizardModal(interaction) {
  try {
    await handleWizardModalInner(interaction);
  } catch (error) {
    logger.warn({ error: error.message, customId: interaction.customId }, 'Wizard modal error');
    if (error.code === 10062) {
      try { await interaction.followUp({ content: 'That session expired. Run `' + getPrefix(interaction.guildId) + 'setup` again.', ephemeral: true }); } catch {}
    } else {
      try { await interaction.reply({ content: 'Something went wrong. Try `' + getPrefix(interaction.guildId) + 'setup` again.', ephemeral: true }); } catch {}
    }
  }
}

async function handleWizardModalInner(interaction) {
  const { customId, guildId, guild } = interaction;
  const fields = interaction.fields;

  if (customId === 'setup_modal:prot_roles') {
    const ids = fields.getTextInputValue('prot_role_ids').trim();
    if (ids) {
      stateManager.setGuildSetting(guildId, 'PBAN_PROTECTED_ROLE_IDS', ids);
    }
    const cur = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
    await interaction.update(await renderStep(guildId, cur, guild));
    return;
  }

  if (customId.startsWith('setup_modal:id:')) {
    const key = customId.replace('setup_modal:id:', '');
    const idValue = fields.getTextInputValue('id_value').trim();
    if (!idValue) {
      await interaction.reply({ content: 'ID is required.', ephemeral: true });
      return;
    }

    const currentStep = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));

    if (key.startsWith('category:')) {
      const wingIndex = parseInt(key.split(':')[1], 10);
      const existingWings = stateManager.getWings(guildId);
      let wing = existingWings[wingIndex];
      if (!wing) {
        const w = defaultWings[wingIndex] || { id: 'wing' + (wingIndex + 1), label: 'Wing ' + (wingIndex + 1), prefix: 'wing' + (wingIndex + 1), description: '' };
        stateManager.createWing(guildId, w.id, w.label, w.prefix, w.description, wingIndex);
        wing = stateManager.getWings(guildId)[wingIndex];
      }
      if (wing) stateManager.setWingCategory(guildId, wing.id, idValue);
      await interaction.update(await renderStep(guildId, currentStep, guild));
      return;
    }

    if (key.startsWith('catrole:')) {
      const wingIndex = parseInt(key.split(':')[1], 10);
      const existingWings = stateManager.getWings(guildId);
      const wing = existingWings[wingIndex];
      if (wing) {
        const resolvedId = resolveWingRefSingle(guildId, idValue);
        try {
          if (!config.policy.rolePolicy.categoryRoles) config.policy.rolePolicy.categoryRoles = {};
          config.policy.rolePolicy.categoryRoles[wing.id] = resolvedId;
        } catch {}
        stateManager.setGuildSetting(guildId, 'catrole_' + wing.id, resolvedId);
      }
      await interaction.update(await renderStep(guildId, currentStep, guild));
      return;
    }

    if (key.startsWith('perm:')) {
      const flag = key.split(':')[1];
      const resolvedIds = resolveWingRefs(guildId, idValue);
      let added = 0;
      for (const rid of resolvedIds) {
        try { stateManager.grantFakePermission(guildId, flag, rid); added++; } catch {}
      }
      await interaction.update(await renderStep(guildId, currentStep, guild));
      await interaction.followUp({ content: `✅ Granted \`${flag}\` to ${added} role(s).`, ephemeral: true });
      return;
    }

    if (key.startsWith('wingrole:')) {
      const wingId = key.replace('wingrole:', '');
      let isLead = false;
      try {
        const leadStr = fields.getTextInputValue('is_lead')?.trim().toLowerCase() || '';
        isLead = leadStr === 'yes' || leadStr === 'y' || leadStr === 'true';
      } catch {}
      const resolvedIds = resolveWingRefs(guildId, idValue);
      if (resolvedIds.length) {
        for (const rid of resolvedIds) {
          stateManager.addWingRole(guildId, wingId, rid, '0', { isLead });
        }
      }
      await interaction.update(await renderStep(guildId, currentStep, guild));
      return;
    }

    if (key === 'ON_BREAK_ROLE_ID') {
      const resolvedRoleId = resolveWingRefSingle(guildId, idValue);
      setOverride(key, resolvedRoleId);
      stateManager.setGuildSetting(guildId, key, resolvedRoleId);
      await interaction.update(await renderStep(guildId, currentStep, guild));
      return;
    }

    const channelKeys = ['BREAK_REQUEST_CHANNEL_ID', 'PBAN_PROPOSAL_CHANNEL_ID', 'PBAN_LOG_CHANNEL_ID',
      'ANTI_BOT_AUTOMOD_CHANNEL_ID', 'SUPPORT_PANEL_CHANNEL_ID', 'TRANSCRIPT_CHANNEL_ID', 'modlog_channel',
      'PP_CHANNEL_ID', 'DOCUMENTS_CHANNEL_ID'];
    if (channelKeys.includes(key)) {
      setOverride(key, idValue);
      stateManager.setGuildSetting(guildId, key, idValue);
      if (key === 'modlog_channel') stateManager.setModlogChannel(guildId, idValue);
      if (key === 'DOCUMENTS_CHANNEL_ID') stateManager.setDocumentsChannel(guildId, idValue);
      await interaction.update(await renderStep(guildId, currentStep, guild));
      return;
    }

    if (key === 'leadCategoryRole') {
      const resolvedId = resolveWingRefSingle(guildId, idValue);
      try { config.policy.rolePolicy.leadCategoryRole = resolvedId; } catch {}
      stateManager.setGuildSetting(guildId, 'leadCategoryRole', resolvedId);
      await interaction.update(await renderStep(guildId, currentStep, guild));
      return;
    }

    await interaction.reply({ content: 'Unknown setting.', ephemeral: true });
    return;
  }

  if (customId === 'setup_modal:prefix') {
    const value = fields.getTextInputValue('prefix_value').trim();
    if (value && value.length <= 3) setPrefix(guildId, value);
    const cur = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
    await interaction.update(await renderStep(guildId, cur, guild));
    return;
  }

  if (customId === 'setup_modal:appearance') {
    const color = fields.getTextInputValue('embed_color').trim().replace(/^#/, '');
    const titlePrefix = fields.getTextInputValue('title_prefix').trim();
    const footer = fields.getTextInputValue('footer_text').trim();
    if (color) {
      setOverride('BOT_STYLE_COLOR', '0x' + color);
      stateManager.setGuildSetting(guildId, 'BOT_STYLE_COLOR', '0x' + color);
    }
    if (titlePrefix !== undefined) {
      setOverride('BOT_TITLE_PREFIX', titlePrefix);
      stateManager.setGuildSetting(guildId, 'BOT_TITLE_PREFIX', titlePrefix);
    }
    if (footer !== undefined) {
      setOverride('BOT_FOOTER', footer);
      stateManager.setGuildSetting(guildId, 'BOT_FOOTER', footer);
    }
    const cur = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
    await interaction.update(await renderStep(guildId, cur, guild));
    return;
  }

  if (customId === 'setup_modal:panel_content') {
    const text = fields.getTextInputValue('panel_text').trim();
    const buttonId = fields.getTextInputValue('button_id').trim();
    const buttonLabel = fields.getTextInputValue('button_label').trim();
    if (text) {
      setOverride('SUPPORT_PANEL_CONTENT', text);
      stateManager.setGuildSetting(guildId, 'SUPPORT_PANEL_CONTENT', text);
    }
    if (buttonId) {
      setOverride('SUPPORT_PANEL_BUTTON_ID', buttonId);
      stateManager.setGuildSetting(guildId, 'SUPPORT_PANEL_BUTTON_ID', buttonId);
    }
    if (buttonLabel) {
      stateManager.setGuildSetting(guildId, 'SUPPORT_PANEL_BUTTON_LABEL', buttonLabel);
    }
    const cur = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
    await interaction.update(await renderStep(guildId, cur, guild));
    return;
  }

  if (customId.startsWith('setup_modal:wing:')) {
    const wingIndex = parseInt(customId.split(':')[2], 10);
    const wingId = fields.getTextInputValue('wing_id').trim();
    const label = fields.getTextInputValue('wing_label').trim();
    const prefix = fields.getTextInputValue('wing_prefix').trim();
    const description = fields.getTextInputValue('wing_desc').trim();
    const existing = stateManager.getWings(guildId);
    if (existing[wingIndex]) {
      stateManager.updateWing(guildId, existing[wingIndex].id, { id: wingId, label, prefix: prefix || wingId, description });
    } else {
      stateManager.createWing(guildId, wingId, label, prefix || wingId, description, wingIndex);
    }
    await interaction.update(await renderStep(guildId, Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0)), guild));
    return;
  }

  if (customId.startsWith('setup_modal:importroles:')) {
    const wingIndex = parseInt(customId.split(':')[2], 10);
    const existing = stateManager.getWings(guildId);
    if (!existing[wingIndex]) { await interaction.reply({ content: 'Wing not created yet. Save wing details first.', ephemeral: true }); return; }
    const wing = existing[wingIndex];
    const rawIds = fields.getTextInputValue('role_ids').trim();
    if (!rawIds) { await interaction.reply({ content: 'At least one role ID is required.', ephemeral: true }); return; }
    const roleIds = resolveWingRefs(guildId, rawIds);
    let added = 0;
    for (const roleId of roleIds) {
      try {
        stateManager.addWingRole(guildId, wing.id, roleId, '1', { isLead: false, isCategory: false, isInternal: false });
        added++;
      } catch { /* skip duplicates */ }
    }
    const cur = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
    await interaction.update(await renderStep(guildId, cur, guild));
    await interaction.followUp({ content: `✅ Imported ${added} role(s). Use **Edit Role Structure** to assign ranks.`, ephemeral: true });
    return;
  }

  if (customId.startsWith('setup_modal:removeperm:')) {
    const flag = customId.replace('setup_modal:removeperm:', '');
    const rawIds = fields.getTextInputValue('remove_role_ids').trim();
    if (!rawIds) { await interaction.reply({ content: 'At least one role ID required.', ephemeral: true }); return; }
    const resolvedIds = resolveWingRefs(guildId, rawIds);
    let removed = 0;
    for (const rid of resolvedIds) {
      try {
        stateManager.revokeFakePermission(guildId, flag, rid);
        removed++;
      } catch { /* skip */ }
    }
    const cur = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
    await interaction.update(await renderStep(guildId, cur, guild));
    await interaction.followUp({ content: `✅ Removed ${removed} role(s) from \`${flag}\`.`, ephemeral: true });
    return;
  }

  if (customId.startsWith('setup_modal:setrank:')) {
    const parts = customId.split(':');
    const wingIndex = parseInt(parts[2], 10);
    const roleId = parts[3];
    const existing = stateManager.getWings(guildId);
    if (!existing[wingIndex]) { await interaction.reply({ content: 'Wing not found.', ephemeral: true }); return; }
    const wing = existing[wingIndex];
    const rankValue = fields.getTextInputValue('rank_value').trim().toUpperCase();
    if (!rankValue) {
      await interaction.reply({ content: 'Enter a number (1=lowest) or M for lead.', ephemeral: true });
      return;
    }
    const existingRoles = stateManager.getWingRoles(guildId, wing.id);
    const current = existingRoles.find((r) => r.role_id === roleId);
    let resultLabel;

    if (rankValue === 'M') {
      if (current?.is_lead) {
        await interaction.reply({ content: '<@&' + roleId + '> is already the lead.', ephemeral: true });
        return;
      }
      const oldLead = existingRoles.find((r) => r.is_lead);
      if (oldLead) stateManager.removeWingRole(guildId, wing.id, oldLead.role_id);
      stateManager.addWingRole(guildId, wing.id, roleId, 'M', { isLead: true, isCategory: false, isInternal: false });
      resultLabel = 'Lead';
    } else {
      const rankNum = parseInt(rankValue, 10);
      if (isNaN(rankNum) || rankNum < 1) { await interaction.reply({ content: 'Rank must be a positive number (1=lowest) or M for lead.', ephemeral: true }); return; }
      if (current?.is_lead) {
        stateManager.removeWingRole(guildId, wing.id, roleId);
      }
      stateManager.addWingRole(guildId, wing.id, roleId, String(rankNum), { isLead: false, isCategory: false, isInternal: false });
      resultLabel = 'Rank ' + rankNum;
    }

    await interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(HALLOWS_ORANGE)
        .setTitle('✅ Role Updated')
        .setDescription('<@&' + roleId + '> is now **' + resultLabel + '** in **' + (wing.label || wing.id) + '**.')
        .setTimestamp()
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`setup:wing:${wingIndex}:editstructure`).setLabel('Continue Editing').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`setup:step:${8 + wingIndex}`).setLabel('← Back to Wing').setStyle(ButtonStyle.Secondary)
        )
      ]
    });
    return;
  }

  if (customId.startsWith('setup_modal:removerole:')) {
    const wingIndex = parseInt(customId.split(':')[2], 10);
    const existing = stateManager.getWings(guildId);
    if (!existing[wingIndex]) { await interaction.reply({ content: 'Wing not found.', ephemeral: true }); return; }
    const wing = existing[wingIndex];
    const rawIds = fields.getTextInputValue('remove_role_ids').trim();
    if (!rawIds) { await interaction.reply({ content: 'At least one role ID required.', ephemeral: true }); return; }
    const roleIds = resolveWingRefs(guildId, rawIds);
    let removed = 0;
    for (const roleId of roleIds) {
      try {
        stateManager.removeWingRole(guildId, wing.id, roleId);
        removed++;
      } catch { /* skip not-found */ }
    }
    const cur = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
    await interaction.update(await renderStep(guildId, cur, guild));
    await interaction.followUp({ content: `✅ Removed ${removed} role(s).`, ephemeral: true });
    return;
  }

  if (customId.startsWith('setup_modal:lead:')) {
    const wingIndex = parseInt(customId.split(':')[2], 10);
    const existing = stateManager.getWings(guildId);
    if (!existing[wingIndex]) { await interaction.reply({ content: 'Wing not created yet. Save wing details first.', ephemeral: true }); return; }
    const wing = existing[wingIndex];
    const roleId = fields.getTextInputValue('role_id').trim();
    if (!roleId) { await interaction.reply({ content: 'Role ID is required.', ephemeral: true }); return; }
    const currentRoles = stateManager.getWingRoles(guildId, wing.id);
    const existingLead = currentRoles.find((r) => r.is_lead);
    if (existingLead) {
      stateManager.removeWingRole(guildId, wing.id, existingLead.role_id);
    }
    stateManager.addWingRole(guildId, wing.id, roleId, 'M', { isLead: true, isCategory: false, isInternal: false });
    await interaction.update(await renderStep(guildId, Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0)), guild));
    return;
  }

  if (customId.startsWith('setup_modal:branch:')) {
    const wingId = customId.replace('setup_modal:branch:', '');
    stateManager.setGuildSetting(guildId, `branchPolicy_${wingId}_ping`, fields.getTextInputValue('branch_ping').trim());
    stateManager.setGuildSetting(guildId, `branchPolicy_${wingId}_reply`, fields.getTextInputValue('branch_reply').trim());
    stateManager.setGuildSetting(guildId, `branchPolicy_${wingId}_close`, fields.getTextInputValue('branch_close').trim());
    await interaction.update(await renderStep(guildId, Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0)), guild));
    return;
  }

  if (customId === 'setup_modal:aliases') {
    try {
      const json = JSON.parse(fields.getTextInputValue('aliases_json').trim());
      stateManager.setGuildSetting(guildId, 'ticket_commands', JSON.stringify(json));
    } catch { /* ignore bad JSON */ }
    const cur = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
    await interaction.update(await renderStep(guildId, cur, guild));
    return;
  }

  if (customId.startsWith('setup_modal:snippet:')) {
    const name = fields.getTextInputValue('snippet_name').trim();
    const message = fields.getTextInputValue('snippet_message').trim();
    if (name && message) {
      if (!config.policy.savedSnippets) config.policy.savedSnippets = {};
      config.policy.savedSnippets[name] = { message, embed: null };
      const allSnippets = { ...config.policy.savedSnippets };
      stateManager.setGuildSetting(guildId, '_snippets_json', JSON.stringify(allSnippets));
    }
    const names = Object.keys(config.policy.savedSnippets || {});
    const embed = wizardEmbed(guildId, 'Snippet Saved', [
      names.length ? `**Saved snippets:**\n${names.map((n) => `• **${n}**`).join('\n')}` : '',
      '',
      'Add another, or click **Done**.'
    ].join('\n'));
    await interaction.update({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:step:20:snippets').setLabel('Add Another').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('setup:step:21').setLabel('Done →').setStyle(ButtonStyle.Success),
          navRow(guildId)
        )
      ]
    });
    return;
  }

  if (customId === 'setup_modal:appeal') {
    const link = fields.getTextInputValue('appeal_link').trim();
    if (link) {
      setOverride('PBAN_APPEALS_INVITE', link);
      stateManager.setGuildSetting(guildId, 'PBAN_APPEALS_INVITE', link);
    }
    const cur = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
    await interaction.update(await renderStep(guildId, cur, guild));
    return;
  }

  if (customId === 'setup_modal:demote_exempt') {
    const ids = fields.getTextInputValue('demote_exempt_ids').trim();
    stateManager.setGuildSetting(guildId, 'DEMOTE_EXEMPT_ROLES', ids);
    const cur = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
    await interaction.update(await renderStep(guildId, cur, guild));
    return;
  }

  if (customId === 'setup_modal:raid') {
    const enabled = fields.getTextInputValue('raid_enabled').trim().toLowerCase() === 'true';
    const threshold = parseInt(fields.getTextInputValue('raid_threshold').trim(), 10) || 10;
    const window = parseInt(fields.getTextInputValue('raid_window').trim(), 10) || 10;
    const lockout = parseInt(fields.getTextInputValue('raid_lockout').trim(), 10) || 15;
    const notify = fields.getTextInputValue('raid_notify').trim();
    if (stateManager.setRaidConfig) {
      stateManager.setRaidConfig(guildId, {
        enabled: enabled ? 1 : 0,
        join_threshold: threshold,
        time_window_seconds: window,
        auto_lockout_minutes: lockout,
        notify_channel_id: notify || null
      });
    }
    const cur = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
    await interaction.update(await renderStep(guildId, cur, guild));
    return;
  }

  if (customId === 'setup_modal:nuke') {
    const enabled = fields.getTextInputValue('nuke_enabled').trim().toLowerCase() === 'true';
    const chanDel = parseInt(fields.getTextInputValue('nuke_chan_del').trim(), 10) || 3;
    const roleDel = parseInt(fields.getTextInputValue('nuke_role_del').trim(), 10) || 3;
    const banAdd = parseInt(fields.getTextInputValue('nuke_ban_add').trim(), 10) || 3;
    const window = parseInt(fields.getTextInputValue('nuke_window').trim(), 10) || 5;
    const lockout = parseInt(fields.getTextInputValue('nuke_lockout').trim(), 10) || 30;
    const action = fields.getTextInputValue('nuke_action').trim().toLowerCase() || 'lockdown';
    const notify = fields.getTextInputValue('nuke_notify').trim();
    if (stateManager.setAntinukeConfig) {
      stateManager.setAntinukeConfig(guildId, {
        enabled: enabled ? 1 : 0,
        channel_delete_threshold: chanDel,
        role_delete_threshold: roleDel,
        ban_add_threshold: banAdd,
        time_window_seconds: window,
        auto_lockout_minutes: lockout,
        action_on_trigger: action,
        notify_channel_id: notify || null
      });
    }
    const cur = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
    await interaction.update(await renderStep(guildId, cur, guild));
    return;
  }

  if (customId === 'setup_modal:apps') {
    const channelId = fields.getTextInputValue('apps_channel').trim();
    const roleId = fields.getTextInputValue('apps_role').trim();
    const ghostId = fields.getTextInputValue('apps_ghost').trim();
    const approveDm = fields.getTextInputValue('apps_approve_dm').trim();
    const rejectDm = fields.getTextInputValue('apps_reject_dm').trim();
    if (channelId) {
      setOverride('DISCORD_CHANNEL_ID', channelId);
      stateManager.setGuildSetting(guildId, 'DISCORD_CHANNEL_ID', channelId);
    }
    if (roleId) {
      setOverride('APPROVED_APPLICANT_ROLE_ID', roleId);
      stateManager.setGuildSetting(guildId, 'APPROVED_APPLICANT_ROLE_ID', roleId);
    }
    if (ghostId) {
      setOverride('APPROVE_GHOST_PING_CHANNEL_ID', ghostId);
      stateManager.setGuildSetting(guildId, 'APPROVE_GHOST_PING_CHANNEL_ID', ghostId);
    }
    if (approveDm) {
      setOverride('APPROVE_DM_MESSAGE', approveDm);
      stateManager.setGuildSetting(guildId, 'APPROVE_DM_MESSAGE', approveDm);
    }
    if (rejectDm) {
      setOverride('REJECT_DM_MESSAGE', rejectDm);
      stateManager.setGuildSetting(guildId, 'REJECT_DM_MESSAGE', rejectDm);
    }
    const cur = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
    await interaction.update(await renderStep(guildId, cur, guild));
    return;
  }

  await interaction.reply({ content: 'Unknown modal.', ephemeral: true });
}

async function renderSnippetList(interaction, guildId, guild, names) {
  const embed = wizardEmbed(guildId, 'Saved Snippets', [
    'Existing snippets:',
    '',
    names.map((n) => `• **${n}**`).join('\n') || '*None*',
    '',
    'Click **Add** to create another, or **Done**.'
  ].join('\n'));
  await interaction.update({
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup:step:20:snippets').setLabel('Add Another').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup:step:21').setLabel('Done →').setStyle(ButtonStyle.Success),
        navRow(guildId).components[0], navRow(guildId).components[1]
      )
    ]
  });
}

export {
  handleWizardButton, handleWizardSelect, handleWizardModal,
  handlePrefixCommand, handleSlashCommand
};
