import { SlashCommandBuilder } from 'discord.js';

export default {
  name: 'security',
  version: '1.0.0',
  requires: [],
  prefixCommands: [
    { command: 'pban', handler: './pban.js', permission: null },
    { command: 'addproof', handler: './addproof.js', permission: null }
  ],
  slashCommands: [
    {
      name: 'pban',
      handler: './pban.js',
      data: new SlashCommandBuilder()
        .setName('pban')
        .setDescription('Open a permanent ban proposal')
        .addUserOption((option) =>
          option.setName('user').setDescription('The user to ban').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('The reason for the ban').setRequired(true).setMaxLength(1800)
        )
    },
    {
      name: 'addproof',
      handler: './addproof.js',
      data: new SlashCommandBuilder()
        .setName('addproof')
        .setDescription('Add proof screenshots to a ban profile')
        .addStringOption((option) =>
          option.setName('userid').setDescription('The Discord user ID').setRequired(true)
        )
        .addAttachmentOption((option) =>
          option.setName('image').setDescription('Screenshot image').setRequired(true)
        )
        .addAttachmentOption((option) =>
          option.setName('image2').setDescription('Screenshot image 2').setRequired(false)
        )
        .addAttachmentOption((option) =>
          option.setName('image3').setDescription('Screenshot image 3').setRequired(false)
        )
        .addAttachmentOption((option) =>
          option.setName('image4').setDescription('Screenshot image 4').setRequired(false)
        )
        .addAttachmentOption((option) =>
          option.setName('image5').setDescription('Screenshot image 5').setRequired(false)
        )
        .addAttachmentOption((option) =>
          option.setName('image6').setDescription('Screenshot image 6').setRequired(false)
        )
        .addAttachmentOption((option) =>
          option.setName('image7').setDescription('Screenshot image 7').setRequired(false)
        )
        .addAttachmentOption((option) =>
          option.setName('image8').setDescription('Screenshot image 8').setRequired(false)
        )
        .addAttachmentOption((option) =>
          option.setName('image9').setDescription('Screenshot image 9').setRequired(false)
        )
        .addAttachmentOption((option) =>
          option.setName('image10').setDescription('Screenshot image 10').setRequired(false)
        )
    },
  ],
  componentHandlers: {
    'pban_vote': './vote.js',
    'pban_abstain': './vote.js',
    'pban_cleanup': './cleanup.js'
  },
  components: {
    buttons: ['pban_vote', 'pban_abstain', 'pban_cleanup'],
    selectMenus: [],
    modals: []
  },
  stateTables: ['pban_proposals', 'pban_votes', 'ban_profiles'],
  onLoad: async (core) => {},
  onReady: async (core) => {
    try {
      const { restorePbanProposals } = await import('./shared.js');
      await restorePbanProposals();
    } catch (error) {
      core.logger?.error?.({ error: error.message }, 'Failed to restore PBAN proposals');
    }
  }
};
