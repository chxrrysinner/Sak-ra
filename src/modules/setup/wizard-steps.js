import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder
} from 'discord.js';
import stateManager from '../../core/state.js';
import config, { setOverride } from '../../core/config.js';
import { getPrefix, setPrefix } from '../../core/prefix.js';
import { HALLOWS_ORANGE } from '../../core/embeds.js';
import {
  wizardEmbed, navRow, channelOptions, roleOptions,
  defaultWings, ALL_PERM_FLAGS, wingCountChoices,
  WIZARD_KEY, COMPLETE_KEY
} from './wizard-helpers.js';

async function renderStep(guildId, step, guild) {
  const prefix = getPrefix(guildId);
  const channels = guild?.channels?.cache;
  const roles = guild?.roles;

  switch (step) {
    case 0: {
      const embed = wizardEmbed(guildId, 'Welcome to Hallows — Full Setup', [
        'I\'ll walk you through **every** setting. This takes about 20 minutes.',
        '',
        '**What we\'ll cover:**',
        '1. Prefix & appearance',
        '2. Ticket system (channel, transcript, panel)',
        '3. Wings, roles, hierarchy, command policies',
        '4. Ticket branch policy (per-wing ping/reply/close)',
        '5. Staff management (breaks, performance plans)',
        '6. Snippets & command aliases',
        '7. PBAN (proposal, voting, appeals)',
        '8. Demote exemptions',
        '9. Moderation (modlog, evidence, automod)',
        '10. Fake permissions (28 flags — all command gates)',
        '11. Security (anti-raid, anti-nuke)',
        '12. Applications (review, approve, ghost ping)',
        '13. Diagnostics & final validation',
        '',
        'You can exit anytime and resume from the dashboard.'
      ].join('\n'));
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup:step:1').setLabel('Start Setup').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('setup:cancel').setLabel('Exit').setStyle(ButtonStyle.Danger)
      );
      return { embeds: [embed], components: [row] };
    }

    case 1: {
      const embed = wizardEmbed(guildId, 'Step 1: Prefix', [
        `Current: \`${prefix}\``,
        'Staff use the prefix to run commands like `?claim` and `?reply`.',
        '',
        'Click **Change** to set one, or **Next** to keep it.'
      ].join('\n'));
      return {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('setup:step:1:prefix').setLabel('Change').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('setup:step:2').setLabel('Next →').setStyle(ButtonStyle.Success),
            navRow(guildId).components[0], navRow(guildId).components[1]
          )
        ]
      };
    }

    case 2: {
      const embed = wizardEmbed(guildId, 'Step 2: Appearance', [
        'Set the embed colour, title prefix, and footer for all bot embeds.',
        `Current: colour \`${config.style.color.toString(16)}\`, prefix "${config.style.titlePrefix}", footer "${config.style.footer}"`
      ].join('\n'));
      return {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('setup:step:2:appearance').setLabel('Edit').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('setup:step:3').setLabel('Next →').setStyle(ButtonStyle.Success),
            navRow(guildId).components[0], navRow(guildId).components[1]
          )
        ]
      };
    }

    case 3: {
      const current = config.supportPanel.channelId;
      const embed = wizardEmbed(guildId, 'Step 3: Support Channel', [
        'Where the "Open Ticket" button lives.',
        current ? `Current: <#${current}>` : 'Not set.',
        '',
        'Click **Enter ID** below to set the channel, or **Skip**.'
      ].join('\n'));
      return {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('setup:id:SUPPORT_PANEL_CHANNEL_ID').setLabel('Enter Channel ID').setStyle(ButtonStyle.Primary)
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('setup:step:5').setLabel('Skip →').setStyle(ButtonStyle.Secondary),
            navRow(guildId).components[0], navRow(guildId).components[1]
          )
        ]
      };
    }

    case 4: {
      const embed = wizardEmbed(guildId, 'Step 4: Panel Content', [
        'This text appears above the "Open Ticket" button.',
        'You can edit it or keep the default.'
      ].join('\n'));
      return {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('setup:step:4:content').setLabel('Edit Text').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('setup:step:5').setLabel('Keep Default →').setStyle(ButtonStyle.Success),
            navRow(guildId).components[0], navRow(guildId).components[1]
          )
        ]
      };
    }

    case 5: {
      const current = config.TRANSCRIPT_CHANNEL_ID;
      const embed = wizardEmbed(guildId, 'Step 5: Transcript Channel', [
        'Closed ticket transcripts get posted here.',
        current ? `Current: <#${current}>` : 'Not set.',
        '',
        'Click **Enter ID** below to set the channel, or **Skip**.'
      ].join('\n'));
      return {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('setup:id:TRANSCRIPT_CHANNEL_ID').setLabel('Enter Channel ID').setStyle(ButtonStyle.Primary)
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('setup:step:6').setLabel('Skip →').setStyle(ButtonStyle.Secondary),
            navRow(guildId).components[0], navRow(guildId).components[1]
          )
        ]
      };
    }

    case 6: {
      const supportChan = config.supportPanel.channelId;
      const embed = wizardEmbed(guildId, 'Step 6: Post Support Panel', [
        supportChan ? `Post the ticket button in <#${supportChan}>?` : 'No support channel set. Set one in Step 3 first, or skip and do it from the dashboard.'
      ].join('\n'));
      return {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('setup:step:6:post').setLabel('Post Now').setStyle(ButtonStyle.Success).setDisabled(!supportChan),
            new ButtonBuilder().setCustomId('setup:step:7').setLabel('Skip →').setStyle(ButtonStyle.Secondary),
            navRow(guildId).components[0], navRow(guildId).components[1]
          )
        ]
      };
    }

    case 7: {
      const embed = wizardEmbed(guildId, 'Step 7: How Many Wings?', [
        'Wings (departments) organise tickets into categories like Assistants, Moderation, HR.',
        '',
        'Each wing needs an existing **category channel** in your server.',
        'You can add more later from the Hierarchy panel.'
      ].join('\n'));
      return {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('setup:sel:wingcount')
              .setPlaceholder('How many wings?')
              .addOptions(wingCountChoices())
          ),
          navRow(guildId)
        ]
      };
    }

    default: {
      const wingStep = step >= 8 && step <= 15;
      if (wingStep) {
        const wingIndex = step - 8;
        const wc = Number(stateManager.getGuildSetting(guildId, '_wing_count', 0));
        if (wingIndex >= wc) {
          stateManager.setGuildSetting(guildId, WIZARD_KEY, '16');
          return renderStep(guildId, 16, guild);
        }
        return renderWingStep(guildId, wingIndex, wc, channels);
      }

      if (step >= 31 && step <= 31 + ALL_PERM_FLAGS.length) {
        const permIndex = step - 31;
        if (permIndex >= ALL_PERM_FLAGS.length) {
          const afterPerms = 31 + ALL_PERM_FLAGS.length + 1;
          stateManager.setGuildSetting(guildId, WIZARD_KEY, String(afterPerms));
          return renderStep(guildId, afterPerms, guild);
        }
        return renderFakePermStep(guildId, permIndex, roles);
      }

      return renderStandardStep(guildId, step, guild);
    }
  }
}

function renderWingStep(guildId, wingIndex, total, channels) {
  const w = defaultWings[wingIndex] || { id: `wing${wingIndex + 1}`, label: `Wing ${wingIndex + 1}`, prefix: `wing${wingIndex + 1}`, description: '' };
  const isLast = wingIndex >= total - 1;

  const existingWings = stateManager.getWings(guildId);
  const existing = existingWings[wingIndex];
  const existingRoles = existing ? stateManager.getWingRoles(guildId, existing.id) : [];
  const leadRole = existingRoles.find((r) => r.is_lead);
  const numberedRoles = existingRoles.filter((r) => !r.is_lead).sort((a, b) => (a.rank || 0) - (b.rank || 0));
  const catRole = existingRoles.find((r) => r.is_category);

  const descLines = [
    `**Wing ${wingIndex + 1}: ${existing ? existing.label : w.label}**`,
    '',
    existing ? `Category: ${existing.category_id ? '<#' + existing.category_id + '>' : 'Not set'}` : '',
    leadRole ? `Lead: <@&${leadRole.role_id}>` : 'Lead: *Not set*',
    catRole ? `Category role: <@&${catRole.role_id}>` : '',
    numberedRoles.length ? `Roles by rank: ${numberedRoles.map((r) => '<@&' + r.role_id + '> (rank ' + r.rank + ')').join(', ')}` : 'No ranked roles yet',
    '',
    'Use the buttons below to configure each part.',
    wingIndex > 0 ? 'Previous wing was saved.' : ''
  ].filter(Boolean).join('\n');

  const embed = wizardEmbed(guildId, `Wing ${wingIndex + 1} of ${total}: Full Setup`, descLines);

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`setup:wing:${wingIndex}:edit`).setLabel('Edit Name/Prefix').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`setup:id:category:${wingIndex}`).setLabel('Set Category Channel').setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`setup:wing:${wingIndex}:importroles`).setLabel('Import Role IDs').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`setup:wing:${wingIndex}:editstructure`).setLabel('Edit Role Structure').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`setup:wing:${wingIndex}:removerole`).setLabel('Remove Role').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`setup:id:catrole:${wingIndex}`).setLabel('Set Category Role').setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(isLast ? 'setup:step:16' : `setup:step:${8 + wingIndex + 1}`)
        .setLabel(isLast ? 'Done — Next Section →' : 'Next Wing →')
        .setStyle(ButtonStyle.Success),
      navRow(guildId).components[0], navRow(guildId).components[1]
    )
  ];

  return { embeds: [embed], components: rows };
}

function renderFakePermStep(guildId, permIndex, roles) {
  const perm = ALL_PERM_FLAGS[permIndex];
  const existingPerms = stateManager.getAllFakePermissions(guildId) || [];
  const currentRoles = existingPerms.filter((p) => p.permission_flag === perm.flag).map((p) => p.role_id);
  const roleLines = currentRoles.length
    ? currentRoles.map((rid) => '<@&' + rid + '>').join(', ')
    : '*None*';
  const embed = wizardEmbed(guildId, `Step ${31 + permIndex}: Fake Permission — ${perm.label}`, [
        `Flag: \`${perm.flag}\``,
        `Currently assigned to: ${roleLines}`,
        '',
        'Enter a wing/role to **grant** this permission, or use **Remove** to take it away.'
      ].join('\n'));
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup:id:perm:${perm.flag}`)
          .setLabel('Grant to Role')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`setup:removeperm:${perm.flag}`)
          .setLabel('Remove Role')
          .setStyle(ButtonStyle.Danger)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup:step:${31 + permIndex + 1}`)
          .setLabel('Next →').setStyle(ButtonStyle.Success),
        ...(permIndex + 1 >= ALL_PERM_FLAGS.length ? [] : [
          new ButtonBuilder().setCustomId(`setup:step:${31 + ALL_PERM_FLAGS.length + 1}`).setLabel('Skip All →').setStyle(ButtonStyle.Secondary)
        ]),
        navRow(guildId).components[0], navRow(guildId).components[1]
      )
    ]
  };
}

async function renderStandardStep(guildId, step, guild) {
  const prefix = getPrefix(guildId);
  const channels = guild?.channels?.cache;
  const roles = guild?.roles;

  const steps = {
    16: {
      title: 'Step 16: Lead Role & Command Policies',
      desc: () => {
        const wings = stateManager.getWings(guildId);
        const leadCatRole = stateManager.getGuildSetting(guildId, 'leadCategoryRole', '');
        const lines = [
          'Configure the shared lead role and which wings can use which commands.',
          '',
          leadCatRole ? `**Lead Category Role:** <@&${leadCatRole}>` : '**Lead Category Role:** Not set (shared role all leads get)',
          '',
          '**Current wings with leads:**'
        ];
        for (const w of wings) {
          const rs = stateManager.getWingRoles(guildId, w.id);
          const lead = rs.find((r) => r.is_lead);
          const numbered = rs.filter((r) => !r.is_lead).sort((a, b) => (a.rank || 0) - (b.rank || 0));
          lines.push(`**${w.label}**:${lead ? ' Lead: <@&' + lead.role_id + '>' : ' *no lead*'}${numbered.length ? ' Roles: ' + numbered.map((r) => '<@&' + r.role_id + '> (r' + r.rank + ')').join(', ') : ' *no roles*'}`);
        }
        lines.push('', '**Command Policies** control what each wing can do in tickets (reply, close, etc.).');
        return lines.join('\n');
      },
      buttons: () => {
        const wings = stateManager.getWings(guildId);
        const btns = [];
        const row1 = new ActionRowBuilder();
        row1.addComponents(
          new ButtonBuilder().setCustomId('setup:id:leadCategoryRole').setLabel('Set Lead Cat Role').setStyle(ButtonStyle.Primary)
        );
        if (wings.length) {
          row1.addComponents(
            new ButtonBuilder().setCustomId('setup:cmdpolicy').setLabel('Command Policies').setStyle(ButtonStyle.Primary)
          );
        }
        btns.push(row1);
        btns.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:step:17').setLabel('Next →').setStyle(ButtonStyle.Success),
          navRow(guildId).components[0], navRow(guildId).components[1]
        ));
        return btns;
      }
    },

    17: {
      title: 'Step 17: Ticket Access by Wing',
      desc: () => {
        const wings = stateManager.getWings(guildId);
        if (!wings.length) return 'No wings configured. Use **Next** to continue.';
        const lines = [
          'Each wing\'s roles can **reply/close** only in their own tickets by default.',
          'Wings marked as **global** can access ALL tickets.',
          'Internals is always global.',
          '',
          '**Current config:**'
        ];
        for (const w of wings) {
          const isGlobal = stateManager.getGuildSetting(guildId, `branch_${w.id}_global`, '') === 'true';
          const wRoles = stateManager.getWingRoles(guildId, w.id);
          const roleStr = wRoles.length ? wRoles.map((r) => '<@&' + r.role_id + '>').join(', ') : '*no roles*';
          lines.push(`**${w.label}**${isGlobal ? ' 🌐 **GLOBAL**' : ''} — ${roleStr}`);
        }
        lines.push('', 'Click a wing below to toggle its global access, or **Next**.');
        return lines.join('\n');
      },
      buttons: () => {
        const wings = stateManager.getWings(guildId);
        const btns = [];
        const row1 = new ActionRowBuilder();
        for (const w of wings.slice(0, 5)) {
          const isGlobal = stateManager.getGuildSetting(guildId, `branch_${w.id}_global`, '') === 'true';
          row1.addComponents(
            new ButtonBuilder().setCustomId(`setup:branch:toggle:${w.id}`).setLabel((isGlobal ? '🌐 ' : '') + w.label).setStyle(isGlobal ? ButtonStyle.Success : ButtonStyle.Secondary)
          );
        }
        if (row1.components.length) btns.push(row1);
        btns.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:step:18').setLabel('Next →').setStyle(ButtonStyle.Success),
          navRow(guildId).components[0], navRow(guildId).components[1]
        ));
        return btns;
      }
    },

    18: {
      title: 'Step 18: Break Request Channel',
      desc: () => {
        const cur = stateManager.getGuildSetting(guildId, 'BREAK_REQUEST_CHANNEL_ID', '');
        const curRole = stateManager.getGuildSetting(guildId, 'ON_BREAK_ROLE_ID', '');
        const lines = ['Staff use this channel to request breaks.', ''];
        if (cur) lines.push(`Break channel: <#${cur}> ✅`);
        else lines.push('Break channel: Not set');
        if (curRole) lines.push(`On-break role: <@&${curRole}> ✅`);
        else lines.push('On-break role: Not set');
        lines.push('', 'Use the buttons below to set each, or **Next** to continue.');
        return lines.join('\n');
      },
      buttons: () => {
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:id:BREAK_REQUEST_CHANNEL_ID').setLabel('Set Break Channel').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('setup:id:ON_BREAK_ROLE_ID').setLabel('Set Break Role').setStyle(ButtonStyle.Primary)
        );
        return [row1, new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:step:19').setLabel('Next →').setStyle(ButtonStyle.Success),
          navRow(guildId).components[0], navRow(guildId).components[1]
        )];
      }
    },

    19: {
      title: 'Step 19: Performance Plans',
      desc: () => {
        const cur = stateManager.getGuildSetting(guildId, 'PP_CHANNEL_ID', '');
        return [
          'Performance plans track staff improvement with goals, due dates, and notes.',
          '',
          cur ? `Performance plan log channel: <#${cur}> ✅` : 'Performance plan log channel: Not set.',
          '',
          'Staff are notified via DM when a plan is started/completed.'
        ].join('\n');
      },
      select: 'PP_CHANNEL_ID',
      next: 20,
      skip: 20
    },

    20: {
      title: 'Step 20: Saved Snippets',
      desc: () => 'Saved snippets are canned replies staff can use (e.g. hi, wait, askproof).\n\nClick **Add Snippets** to create some, or **Next**.',
      buttons: () => [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:step:20:snippets').setLabel('Add Snippets').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('setup:step:21').setLabel('Next →').setStyle(ButtonStyle.Success),
          navRow(guildId).components[0], navRow(guildId).components[1]
        )
      ]
    },

    21: {
      title: 'Step 21: Command Aliases',
      desc: () => 'Configure command aliases (e.g. `?r` = reply, `?s` = snippets).\n\nClick **Edit** to review and change them, or **Next**.',
      buttons: () => [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:step:21:aliases').setLabel('Edit').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('setup:step:22').setLabel('Next →').setStyle(ButtonStyle.Success),
          navRow(guildId).components[0], navRow(guildId).components[1]
        )
      ]
    },

    22: {
      title: 'Step 22: PBAN Proposal Channel',
      desc: () => {
        const cur = stateManager.getGuildSetting(guildId, 'PBAN_PROPOSAL_CHANNEL_ID', '');
        return `Where PBAN proposals are posted for voting.\n${cur ? `Current: <#${cur}> ✅` : 'Not set.'}\n\nEnter a channel or **Next**.`;
      },
      select: 'PBAN_PROPOSAL_CHANNEL_ID',
      next: 23,
      skip: 23
    },

    23: {
      title: 'Step 23: PBAN Log Channel',
      desc: () => {
        const cur = stateManager.getGuildSetting(guildId, 'PBAN_LOG_CHANNEL_ID', '');
        return `Where PBAN actions are logged.\n${cur ? `Current: <#${cur}> ✅` : 'Not set.'}\n\nEnter a channel or **Next**.`;
      },
      select: 'PBAN_LOG_CHANNEL_ID',
      next: 24,
      skip: 24
    },

    24: {
      title: 'Step 24: PBAN Protected Roles',
      desc: () => {
        const cur = stateManager.getGuildSetting(guildId, 'PBAN_PROTECTED_ROLE_IDS', '');
        return `Roles that cannot be PBANned.\n${cur ? `Protected: ${cur.split(',').map((id) => '<@&' + id.trim() + '>').join(', ')} ✅` : 'Not set.'}\n\nEnter role IDs (comma-separated) or **Next**.`;
      },
      buttons: () => [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:step:24:prot').setLabel('Set Protected Roles').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('setup:step:25').setLabel('Next →').setStyle(ButtonStyle.Success),
          navRow(guildId).components[0], navRow(guildId).components[1]
        )
      ]
    },

    25: {
      title: 'Step 25: PBAN Appeals Invite',
      desc: () => {
        const cur = stateManager.getGuildSetting(guildId, 'PBAN_APPEALS_INVITE', '');
        return `Invite link for banned users to appeal.\n${cur ? `Current: ${cur} ✅` : 'Not set.'}\n\nEnter an invite or **Next**.`;
      },
      buttons: () => [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:step:25:appeal').setLabel('Set Appeal Link').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('setup:step:26').setLabel('Next →').setStyle(ButtonStyle.Success),
          navRow(guildId).components[0], navRow(guildId).components[1]
        )
      ]
    },

    26: {
      title: 'Step 26: Demote Exempt Roles',
      desc: () => {
        const cur = stateManager.getGuildSetting(guildId, 'DEMOTE_EXEMPT_ROLES', '');
        return [
          'Roles that **cannot be demoted** (e.g. server owner, head admin).',
          '',
          cur ? `Exempt roles: ${cur.split(',').map((id) => '<@&' + id.trim() + '>').join(', ')} ✅` : 'No exempt roles set.',
          '',
          'Enter role IDs (comma-separated) or **Next**.'
        ].join('\n');
      },
      buttons: () => [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:step:26:demote_exempt').setLabel('Set Exempt Roles').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('setup:step:27').setLabel('Next →').setStyle(ButtonStyle.Success),
          navRow(guildId).components[0], navRow(guildId).components[1]
        )
      ]
    },

    27: {
      title: 'Step 27: Modlog Channel',
      desc: () => {
        const cur = stateManager.getModlogChannel(guildId);
        return `Where moderation actions (bans, kicks, mutes) are logged.\n${cur ? `Current: <#${cur}> ✅` : 'Not set.'}\n\nEnter a channel or **Next**.`;
      },
      select: 'modlog_channel',
      next: 28,
      skip: 28
    },

    28: {
      title: 'Step 28: Documents / Evidence Channel',
      desc: () => {
        const cur = stateManager.getDocumentsChannel(guildId);
        return [
          'Where moderators upload screenshot evidence for moderation cases.',
          '',
          cur ? `Documents channel: <#${cur}> ✅` : 'Documents channel: Not set.',
          '',
          'When a case is created, the moderator is asked to upload proof here.',
          'Enter a channel or **Next**.'
        ].join('\n');
      },
      select: 'DOCUMENTS_CHANNEL_ID',
      next: 29,
      skip: 29
    },

    29: {
      title: 'Step 29: Anti-Bot Automod Channel',
      desc: () => {
        const cur = stateManager.getGuildSetting(guildId, 'ANTI_BOT_AUTOMOD_CHANNEL_ID', '');
        return `Where suspected bot accounts are reported.\n${cur ? `Current: <#${cur}> ✅` : 'Not set.'}\n\nEnter a channel or **Next**.`;
      },
      select: 'ANTI_BOT_AUTOMOD_CHANNEL_ID',
      next: 30,
      skip: 30
    },

    30: {
      title: 'Step 30: Fake Permissions',
      desc: () => 'Fake permissions let you grant Discord-style permissions via role assignment without giving the actual Discord permission.\n\nWe\'ll walk through all 28 flags. Click **Start** to begin.',
      buttons: () => [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:step:31').setLabel('Start →').setStyle(ButtonStyle.Success),
          navRow(guildId).components[0], navRow(guildId).components[1]
        )
      ]
    },

    59: {
      title: 'Step 59: Anti-Raid',
      desc: () => {
        const raidCfg = stateManager.getRaidConfig?.(guildId) || {};
        return [
          'Protects your server from mass-join attacks.',
          '',
          `Enabled: ${raidCfg.enabled ? '✅' : '❌'}`,
          `Join threshold: ${raidCfg.join_threshold || 10} in ${raidCfg.time_window_seconds || 10}s`,
          `Auto-lockout: ${raidCfg.auto_lockout_minutes || 15} minutes`,
          raidCfg.notify_channel_id ? `Alerts: <#${raidCfg.notify_channel_id}>` : '',
          '',
          'Click **Configure** to adjust, or **Next**.'
        ].filter(Boolean).join('\n');
      },
      buttons: () => [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:step:59:raid').setLabel('Configure').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('setup:step:60').setLabel('Next →').setStyle(ButtonStyle.Success),
          navRow(guildId).components[0], navRow(guildId).components[1]
        )
      ]
    },

    60: {
      title: 'Step 60: Anti-Nuke',
      desc: () => {
        const nukeCfg = stateManager.getAntinukeConfig?.(guildId) || {};
        return [
          'Protects your server from destructive actions (mass channel/role deletes, mass bans).',
          '',
          `Enabled: ${nukeCfg.enabled ? '✅' : '❌'}`,
          `Channel delete threshold: ${nukeCfg.channel_delete_threshold || 3}`,
          `Role delete threshold: ${nukeCfg.role_delete_threshold || 3}`,
          `Ban threshold: ${nukeCfg.ban_add_threshold || 3}`,
          `Window: ${nukeCfg.time_window_seconds || 5}s`,
          `Action: ${nukeCfg.action_on_trigger || 'lockdown'}`,
          nukeCfg.notify_channel_id ? `Alerts: <#${nukeCfg.notify_channel_id}>` : '',
          '',
          'Click **Configure** to adjust, or **Next**.'
        ].filter(Boolean).join('\n');
      },
      buttons: () => [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:step:60:nuke').setLabel('Configure').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('setup:step:61').setLabel('Next →').setStyle(ButtonStyle.Success),
          navRow(guildId).components[0], navRow(guildId).components[1]
        )
      ]
    },

    61: {
      title: 'Step 61: Applications',
      desc: () => {
        const hasSecrets = config.reviewer.enabled;
        if (!hasSecrets) return 'Google/Gemini secrets not configured in `.env`. Applications cannot run right now. Set `GOOGLE_FORM_ID`, `GEMINI_API_KEY`, and the Google OAuth vars to enable this.';
        const reviewChan = stateManager.getGuildSetting(guildId, 'APPS_REVIEW_CHANNEL_ID', '');
        const approveRole = stateManager.getGuildSetting(guildId, 'APPS_APPROVED_ROLE_ID', '');
        const ghostChan = stateManager.getGuildSetting(guildId, 'APPS_GHOST_PING_CHANNEL_ID', '');
        return [
          'Configure how staff applications are reviewed.',
          '',
          reviewChan ? `Review channel: <#${reviewChan}> ✅` : 'Review channel: Not set',
          approveRole ? `Approved role: <@&${approveRole}> ✅` : 'Approved role: Not set',
          ghostChan ? `Ghost ping channel: <#${ghostChan}> ✅` : 'Ghost ping channel: Not set',
          '',
          'Click **Configure** to set up, or **Next**.'
        ].filter(Boolean).join('\n');
      },
      buttons: () => [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:step:61:apps').setLabel('Configure').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('setup:step:62').setLabel('Next →').setStyle(ButtonStyle.Success),
          navRow(guildId).components[0], navRow(guildId).components[1]
        )
      ]
    },

    62: {
      title: 'Step 62: Engagement Features',
      desc: () => [
        'These are optional Phase 3 features. Configure them later from the dashboard.',
        '',
        '**Available:**',
        '• Levels & XP (rank, leaderboard, role rewards)',
        '• Autoroles (auto-assign on join)',
        '• Starboard (pin popular messages)',
        '• Voice channel counters (member count, boost count)',
        '• Giveaways',
        '',
        'Click **Next** to continue.'
      ].join('\n'),
      buttons: () => [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:step:63').setLabel('Next →').setStyle(ButtonStyle.Success),
          navRow(guildId).components[0], navRow(guildId).components[1]
        )
      ]
    },

    63: {
      title: 'Step 63: Setup Diagnostics',
      desc: () => {
        const checks = [];
        const wings = stateManager.getWings(guildId);

        checks.push(config.discordToken ? '✅ Bot token configured' : '❌ Bot token missing');
        checks.push(config.guildId ? `✅ Guild ID: ${config.guildId}` : '❌ Guild ID not set in .env');
        checks.push(getPrefix(guildId) ? `✅ Prefix: \`${getPrefix(guildId)}\`` : '❌ Prefix not set');
        checks.push(config.supportPanel.channelId ? `✅ Support channel: <#${config.supportPanel.channelId}>` : '⚠️ No support channel');
        checks.push(config.TRANSCRIPT_CHANNEL_ID ? `✅ Transcript channel: <#${config.TRANSCRIPT_CHANNEL_ID}>` : '⚠️ No transcript channel');
        checks.push(wings.length ? `✅ ${wings.length} wings configured` : '⚠️ No wings configured');

        for (const w of wings) {
          const rs = stateManager.getWingRoles(guildId, w.id);
          const lead = rs.find((r) => r.is_lead);
          checks.push(lead ? `✅ ${w.label}: Has lead role` : `⚠️ ${w.label}: No lead role set`);
          checks.push(w.category_id ? `✅ ${w.label}: Has category channel` : `⚠️ ${w.label}: No category channel`);
        }

        const modlog = stateManager.getModlogChannel(guildId);
        checks.push(modlog ? `✅ Modlog channel set` : '⚠️ No modlog channel');

        const pbanChan = stateManager.getGuildSetting(guildId, 'PBAN_PROPOSAL_CHANNEL_ID', '');
        checks.push(pbanChan ? `✅ PBAN channel set` : '⚠️ No PBAN channel');

        checks.push('', 'Review the results above. Items with ❌ must be fixed. ⚠️ items are optional.', '', 'Click **Finish** to complete setup, or use **Back** to fix anything.');
        return checks.join('\n');
      },
      buttons: () => [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:step:64').setLabel('Finish →').setStyle(ButtonStyle.Success)
        )
      ]
    },

    64: {
      title: 'Setup Complete!',
      desc: () => {
        const wings = stateManager.getWings(guildId);
        return [
          'Hallows is configured and ready.',
          '',
          '**Summary:**',
          `• Prefix: \`${getPrefix(guildId)}\``,
          config.supportPanel.channelId ? `• Support: <#${config.supportPanel.channelId}>` : '',
          config.TRANSCRIPT_CHANNEL_ID ? `• Transcripts: <#${config.TRANSCRIPT_CHANNEL_ID}>` : '',
          wings.length ? `• ${wings.length} wings configured` : '',
          config.style.color ? `• Embed colour: \`#${config.style.color.toString(16)}\`` : '',
          '',
          '**What\'s next:**',
          '• Use `' + getPrefix(guildId) + 'dashboard` for more settings',
          '• Set up engagement features from the dashboard',
          '• Configure custom commands, voice, and integrations'
        ].filter(Boolean).join('\n');
      },
      buttons: () => [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup:finish').setLabel('Finish').setStyle(ButtonStyle.Success)
        )
      ]
    }
  };

  const s = steps[step];
  if (!s) {
    return { embeds: [wizardEmbed(guildId, 'Unknown Step', 'Something went wrong.')], components: [] };
  }

  const embed = wizardEmbed(guildId, s.title, typeof s.desc === 'function' ? s.desc() : s.desc);

  const components = [];
  if (s.select) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup:id:${s.select}`)
          .setLabel('Enter Channel ID')
          .setStyle(ButtonStyle.Primary)
      )
    );
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`setup:step:${s.skip}`).setLabel('Skip →').setStyle(ButtonStyle.Secondary),
        navRow(guildId).components[0], navRow(guildId).components[1]
      )
    );
  } else if (s.selectRole) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`setup:id:${s.selectRoleCustomId || 'ON_BREAK_ROLE_ID'}`)
          .setLabel('Enter Role ID')
          .setStyle(ButtonStyle.Primary)
      )
    );
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`setup:step:${s.skip}`).setLabel('Skip →').setStyle(ButtonStyle.Secondary),
        navRow(guildId).components[0], navRow(guildId).components[1]
      )
    );
  } else if (s.buttons) {
    const btns = typeof s.buttons === 'function' ? s.buttons() : s.buttons;
    components.push(...btns);
  }

  return { embeds: [embed], components };
}

export { renderStep };
