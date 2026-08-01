import { EmbedBuilder } from 'discord.js';
import config from './config.js';

const HALLOWS_ORANGE = 0xc67a3a;

function styledEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(config.style.color)
    .setTitle(`${config.style.titlePrefix} ${title}`)
    .setDescription(description)
    .setFooter({ text: config.style.footer })
    .setTimestamp();
}

function trimTo(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

const DISCORD_INVITE_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|io|me|li)|discordapp\.com\/invite)\/([a-z0-9-]+)/i;

function containsDiscordInvite(content) {
  return DISCORD_INVITE_PATTERN.test(content);
}

function isImageAttachment(attachment) {
  if (attachment.contentType?.startsWith('image/')) return true;
  return /\.(?:png|jpe?g|gif|webp)$/i.test(attachment.url || attachment.name || '');
}

function normalizeAttachments(attachments = []) {
  return attachments.map((attachment) => (
    typeof attachment === 'string'
      ? { url: attachment, contentType: '', name: '' }
      : attachment
  )).filter((attachment) => attachment?.url);
}

function firstImageAttachment(attachments) {
  return normalizeAttachments(attachments).find(isImageAttachment) || null;
}

function imageAttachments(attachments) {
  return normalizeAttachments(attachments).filter(isImageAttachment);
}

function attachmentLines(attachments) {
  const linkAttachments = normalizeAttachments(attachments);
  if (!linkAttachments.length) return '';

  return [
    '',
    '**Attachments**',
    ...linkAttachments.map((attachment) => `• ${attachment.url}`)
  ].join('\n');
}

function messageBodyFromParts(content, attachments, fallback) {
  const body = trimTo(content?.trim(), 3400);
  const linkedAttachments = normalizeAttachments(attachments)
    .filter((attachment) => !isImageAttachment(attachment));
  const attachmentText = attachmentLines(linkedAttachments);
  return `${body || fallback}${attachmentText}`.slice(0, 3900);
}

function messageBody(message, fallback) {
  return messageBodyFromParts(message.content, message.attachments.map((a) => ({
    url: a.url,
    contentType: a.contentType || '',
    name: a.name || ''
  })), fallback);
}

async function sendEmbedsAsMessages(channel, embeds, options = {}) {
  const { firstMessageContent, ...messageOptions } = options;

  for (const [index, embed] of embeds.entries()) {
    await channel.send({
      ...messageOptions,
      content: index === 0 ? firstMessageContent : undefined,
      embeds: [embed]
    });
  }
}

function attachmentDataFromMessage(message) {
  return message.attachments.map((attachment) => ({
    url: attachment.url,
    contentType: attachment.contentType || '',
    name: attachment.name || ''
  }));
}

function imageProofDataFromAttachment(attachment) {
  return {
    url: attachment.url,
    contentType: attachment.contentType || '',
    name: attachment.name || '',
    addedAt: Date.now()
  };
}

function splitPlainTextMessage(text, maxLength = 1900) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const splitAt = remaining.lastIndexOf('\n', maxLength);
    const end = splitAt > 500 ? splitAt : maxLength;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

async function sendPlainTextMessages(channel, text, options = {}) {
  for (const chunk of splitPlainTextMessage(text)) {
    await channel.send({
      ...options,
      content: chunk
    });
  }
}

export {
  HALLOWS_ORANGE,
  styledEmbed,
  trimTo,
  containsDiscordInvite,
  isImageAttachment,
  normalizeAttachments,
  firstImageAttachment,
  imageAttachments,
  attachmentLines,
  messageBodyFromParts,
  messageBody,
  sendEmbedsAsMessages,
  sendPlainTextMessages,
  splitPlainTextMessage,
  attachmentDataFromMessage,
  imageProofDataFromAttachment
};
