import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuOptionBuilder } from 'discord.js';
import stateManager from '../../core/state.js';
import { HALLOWS_ORANGE } from '../../core/embeds.js';

const WIZARD_KEY = 'setup_step';
const COMPLETE_KEY = 'setup_complete';

function wizardEmbed(guildId, title, description, fields) {
  const step = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
  return new EmbedBuilder()
    .setColor(HALLOWS_ORANGE)
    .setTitle(title)
    .setDescription(description)
    // IMPORTANT: bump this number when adding/removing steps in wizard-steps.js
    // Current max: step 64 (Setup Complete)
    .setFooter({ text: `Step ${step}/64 · Hallows Setup` })
    .setTimestamp();
}

function navRow(guildId, back = true) {
  const row = new ActionRowBuilder();
  if (back) {
    const step = Number(stateManager.getGuildSetting(guildId, WIZARD_KEY, 0));
    row.addComponents(
      new ButtonBuilder().setCustomId('setup:prev').setLabel('← Back').setStyle(ButtonStyle.Secondary).setDisabled(step <= 0)
    );
  }
  row.addComponents(
    new ButtonBuilder().setCustomId('setup:cancel').setLabel('Exit').setStyle(ButtonStyle.Danger)
  );
  return row;
}

function channelOptions(channels, type) {
  const arr = channels
    ? (channels instanceof Map ? [...channels.values()] : channels)
    : [];
  return arr
    .filter((c) => !type || c.type === type)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 25)
    .map((c) => new StringSelectMenuOptionBuilder()
      .setLabel(`#${c.name}`)
      .setValue(c.id)
    );
}

function roleOptions(roles) {
  if (!roles) return [];
  const source = roles.cache || roles;
  const arr = source instanceof Map ? [...source.values()] : source;
  return arr
    .filter((r) => r.name !== '@everyone')
    .sort((a, b) => b.position - a.position)
    .slice(0, 25)
    .map((r) => new StringSelectMenuOptionBuilder()
      .setLabel(r.name)
      .setValue(r.id)
    );
}

const defaultWings = [
  { id: 'assistants', label: 'Assistants', prefix: 'general', description: 'General server support' },
  { id: 'moderation', label: 'Moderation', prefix: 'report', description: 'Member reports and moderation' },
  { id: 'partnership', label: 'Partnership', prefix: 'partner', description: 'Partnership requests' },
  { id: 'hr', label: 'HR', prefix: 'hr', description: 'Human resources' },
  { id: 'internals', label: 'Internals', prefix: 'internals', description: 'Internal staff matters' }
];

const ALL_PERM_FLAGS = [
  { flag: 'viewAuditLog', label: 'View Audit Log' },
  { flag: 'banMembers', label: 'Ban Members' },
  { flag: 'kickMembers', label: 'Kick Members' },
  { flag: 'manageMessages', label: 'Manage Messages' },
  { flag: 'manageChannels', label: 'Manage Channels' },
  { flag: 'manageRoles', label: 'Manage Roles' },
  { flag: 'manageNicknames', label: 'Manage Nicknames' },
  { flag: 'moderateMembers', label: 'Moderate Members' },
  { flag: 'moveMembers', label: 'Move Members' },
  { flag: 'muteMembers', label: 'Mute Members' },
  { flag: 'deafenMembers', label: 'Deafen Members' },
  { flag: 'manageWebhooks', label: 'Manage Webhooks' },
  { flag: 'manageGuild', label: 'Manage Server' },
  { flag: 'mentionEveryone', label: 'Mention @everyone' },
  { flag: 'administrator', label: 'Administrator' },
  { flag: 'staff.stafflist', label: 'View Staff List' },
  { flag: 'staff.strike', label: 'Manage Strikes' },
  { flag: 'staff.strikesOthers', label: 'View Others Strikes' },
  { flag: 'staff.removeStrike', label: 'Remove Strikes' },
  { flag: 'staff.breaks.manage', label: 'Manage Staff Breaks' },
  { flag: 'staff.performancePlans', label: 'Manage Performance Plans' },
  { flag: 'tickets.forceClose', label: 'Force Close Tickets' },
  { flag: 'tickets.start', label: 'Start Tickets Remotely' },
  { flag: 'tickets.overrideClaims', label: 'Override Ticket Claims' },
  { flag: 'security.pban', label: 'Start PBAN Proposals' },
  { flag: 'security.addproof', label: 'Add Ban Proof' },
  { flag: 'admin.hideMessage', label: 'Hide Bot Messages' }
];

function wingCountChoices() {
  const options = [];
  for (let i = 0; i <= 8; i++) {
    options.push(new StringSelectMenuOptionBuilder()
      .setLabel(i === 0 ? 'No wings (skip)' : `${i} wing${i > 1 ? 's' : ''}`)
      .setValue(String(i))
    );
  }
  return options;
}

export {
  wizardEmbed, navRow, channelOptions, roleOptions,
  defaultWings, ALL_PERM_FLAGS, wingCountChoices,
  WIZARD_KEY, COMPLETE_KEY
};
