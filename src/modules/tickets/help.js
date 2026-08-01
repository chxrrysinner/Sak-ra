import { styledEmbed } from '../../core/embeds.js';
import { commandRoleIds, memberCanUsePrefixRoles } from '../../core/permissions.js';
import { getTicketCommands } from './commands.js';

function tc(key) {
  return getTicketCommands()[key];
}

const HELP_COMMAND = tc('help') || '?h';

const COMMAND_HELP = {
  ad: `use **${tc('partnershipAd') || '?ad'}** in a partnership or internals ticket to send the saved partnership introduction and advertisement to the user.`,
  r: `use **${tc('reply') || '?r'} <response>** to send a staff reply to the user who opened the ticket.`,
  s: `use **${tc('snippets') || '?s'}** to list available snippets. use **${tc('snippets') || '?s'} <command> perms** to list roles.`,
  close: `use **${tc('timedClose') || '?close'} <time>** to send the saved closing warning and close automatically after that many minutes.`,
  repfin: `use **${tc('reportFinished') || '?repfin'}** in a moderation or internals ticket to send the saved investigation response.`,
  c: `use **${tc('claim') || '?c'}** or **?claim** to mark yourself as handling a ticket.`,
  claim: `use **${tc('claim') || '?c'}** or **?claim** to mark yourself as handling a ticket.`,
  unclaim: `use **${tc('unclaim') || '?unclaim'}** to release a claimed ticket.`,
  cancelclose: `use **${tc('cancelClose') || '?cancelclose'}** to remove an active timed-close.`,
  timer: `use **${tc('timer') || '?timer'}** to view remaining timed-close duration.`,
  note: `use **${tc('note') || '?note'} <text>** to add an internal transcript note.`,
  id: `use **${tc('userInfo') || '?id'}** to show details about the ticket opener.`,
  transfer: `use **${tc('transfer') || '?transfer'} <wing>** to transfer a ticket.`,
  rename: `use **${tc('rename') || '?rename'} <name>** to rename the staff ticket channel.`,
  priority: `use **${tc('priority') || '?priority'} <low|normal|high|urgent>** to set ticket priority.`,
  transcript: `use **${tc('transcript') || '?transcript'}** to generate a transcript preview.`,
  claiminfo: `use **${tc('claimInfo') || '?claiminfo'}** to view the ticket claimant.`,
  closeinfo: `use **${tc('closeInfo') || '?closeinfo'}** to view the scheduled close time.`,
  escalate: `use **${tc('escalate') || '?escalate'}** to transfer the ticket to internals.`,
  h: `use **${HELP_COMMAND} <command>** to view a command description.`
};

const savedSnippets = globalThis.__HALLOWS_CONFIG__?.policy?.savedSnippets || {};
for (const [key, snippet] of Object.entries(savedSnippets)) {
  if (snippet.description) COMMAND_HELP[key] = snippet.description;
}

export default async function handler(message, args, guildId) {
  const canUse = await memberCanUsePrefixRoles(message.guild.id, message.author.id, commandRoleIds('help'));
  if (!canUse) {
    await message.reply({ embeds: [styledEmbed('Help Not Available', 'you need a staff hierarchy role to use this command.')], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  const key = (args || '').trim().replace(/^[?!]+/, '').toLowerCase();
  if (!key) {
    await message.reply({ embeds: [styledEmbed('Help: h', COMMAND_HELP.h)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  if (key === 'h') {
    await message.reply({ content: 'hhhhhhhhhhhhhh wtf are u doing bro', allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  const description = COMMAND_HELP[key];
  if (!description) {
    await message.reply({ embeds: [styledEmbed('Help Not Found', `use **${HELP_COMMAND} <command>** with one of: **${Object.keys(COMMAND_HELP).join('**, **')}**.`)], allowedMentions: { repliedUser: false, parse: [] } });
    return;
  }
  await message.reply({ embeds: [styledEmbed(`Help: ${key}`, description)], allowedMentions: { repliedUser: false, parse: [] } });
}
