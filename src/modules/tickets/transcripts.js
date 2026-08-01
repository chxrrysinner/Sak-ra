import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import client from '../../core/client.js';
import config from '../../core/config.js';
import { styledEmbed, modmailEmbed, trimTo } from '../../core/embeds.js';
import { departmentFor } from '../../core/permissions.js';

function formatTimestamp(ms) {
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', ' UTC');
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function generateTranscriptBuffer({ userId, ticket, closedByTag, reason }) {
  const department = departmentFor(ticket.departmentId);
  const openedAt = ticket.openedAt || Date.now();
  const closedAt = Date.now();
  const history = ticket.history || [];
  const lines = [
    '═══════════════════════════════════════════════════════',
    '                    MODMAIL TICKET LOG                 ',
    '═══════════════════════════════════════════════════════',
    '',
    `Ticket Closed : ${formatTimestamp(closedAt)}`,
    `Ticket Opened : ${formatTimestamp(openedAt)}`,
    `Duration      : ${formatDuration(closedAt - openedAt)}`,
    `Wing          : ${department?.label || ticket.departmentId || 'unknown'}`,
    `Priority      : ${ticket.priority || 'normal'}`,
    `Total Entries : ${history.length}`,
    `Closed By     : ${closedByTag}`,
    `Close Reason  : ${reason}`,
    '',
    '───────────────────────────────────────────────────────',
    '  USER DETAILS',
    '───────────────────────────────────────────────────────',
    '',
    `  Discord Tag : ${ticket.userTag || 'unknown'}`,
    `  Discord ID  : ${userId}`,
    '',
    '───────────────────────────────────────────────────────',
    '  FULL TICKET LOG',
    '───────────────────────────────────────────────────────',
    ''
  ];

  if (!history.length) {
    lines.push('  [No messages were recorded]');
  } else {
    for (const entry of history) {
      lines.push(`[${formatTimestamp(entry.timestamp)}] ${entry.kind} (${entry.authorTag || entry.authorId})`);
      if (entry.content) {
        lines.push(`  ${entry.content}`);
      }
      for (const url of entry.attachmentUrls || []) {
        lines.push(`  [Attachment] ${url}`);
      }
      lines.push('');
    }
  }

  lines.push('═══════════════════════════════════════════════════════');
  lines.push('                     END OF LOG                        ');
  lines.push('═══════════════════════════════════════════════════════');

  return Buffer.from(lines.join('\n'), 'utf-8');
}

function transcriptEmbed({ userId, ticket, filename, reason, closedByTag }) {
  const department = departmentFor(ticket.departmentId);
  const openedAt = ticket.openedAt || Date.now();
  const duration = formatDuration(Date.now() - openedAt);
  const history = ticket.history || [];

  return new EmbedBuilder()
    .setColor(config.style.color)
    .setTitle('ModMail Transcript')
    .setDescription('A modmail ticket has been closed. The full ticket log is attached below as a text file.')
    .addFields(
      { name: 'User', value: `ID: \`${userId}\`\nTag: **${ticket.userTag || 'unknown'}**`, inline: true },
      { name: 'Ticket', value: `Wing: **${department?.label || ticket.departmentId || 'unknown'}**\nEntries: **${history.length.toLocaleString()}**`, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: 'Duration', value: duration, inline: true },
      { name: 'Closed By', value: closedByTag, inline: true },
      { name: 'Log File', value: filename, inline: true },
      { name: 'Reason', value: trimTo(reason, 1000), inline: false }
    )
    .setFooter({ text: config.style.footer })
    .setTimestamp();
}

async function sendTranscript(channel, userId, ticket, closedBy, reason) {
  const logChannelId = config.TRANSCRIPT_CHANNEL_ID || channel.id;
  const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
  if (!logChannel?.isTextBased()) return;

  const filename = `modmail-${userId}-${Date.now()}.txt`;
  const file = new AttachmentBuilder(
    generateTranscriptBuffer({ userId, ticket, closedByTag: closedBy.tag, reason }),
    { name: filename }
  );

  await logChannel.send({
    embeds: [transcriptEmbed({ userId, ticket, filename, reason, closedByTag: closedBy.tag })],
    files: [file],
    allowedMentions: { parse: [] }
  }).catch(() => null);
}

export { generateTranscriptBuffer, transcriptEmbed, sendTranscript, formatTimestamp, formatDuration };
