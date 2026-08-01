import client from '../../core/client.js';
import { styledEmbed, modmailEmbed } from '../../core/embeds.js';
import { getTicketState } from '../../bridge.js';
import { ticketChannelName } from './ticket.js';

const ticketChannelRenameJobs = new Map();
const ticketChannelLastRenamedAt = new Map();
const ticketChannelRenameCooldownMs = 10 * 60_000;

function safeChannelLabel(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function stripPriorityPrefix(name) {
  return String(name || '').replace(/^(?:low|normal|high|urgent)-/i, '');
}

function priorityChannelName(ticket, fallbackName) {
  const baseName = stripPriorityPrefix(ticket.customChannelName || fallbackName);
  return ticket.priority && ticket.priority !== 'normal'
    ? `${ticket.priority}-${baseName}`.slice(0, 100)
    : baseName.slice(0, 100);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function renameTicketChannel(channel, name) {
  if (channel.name === name) return true;
  return channel.setName(name).then(() => {
    ticketChannelLastRenamedAt.set(channel.id, Date.now());
    return true;
  }).catch(() => false);
}

function ticketChannelRenameCooldownRemaining(channelId) {
  const lastRenamedAt = ticketChannelLastRenamedAt.get(channelId);
  if (!lastRenamedAt) return 0;
  return Math.max(0, ticketChannelRenameCooldownMs - (Date.now() - lastRenamedAt));
}

function queueTicketChannelRename(channel, name, delayMs = 500) {
  const existingJob = ticketChannelRenameJobs.get(channel.id);
  const job = existingJob || { channel, name, timer: null, running: false, warned: false };
  job.channel = channel;
  job.name = name;
  ticketChannelRenameJobs.set(channel.id, job);
  if (job.timer) clearTimeout(job.timer);
  job.timer = setTimeout(() => {
    job.timer = null;
    void runQueuedTicketChannelRename(channel.id);
  }, delayMs);
}

async function syncTicketChannelName(channel, name) {
  const existingJob = ticketChannelRenameJobs.get(channel.id);
  if (existingJob?.timer) clearTimeout(existingJob.timer);
  ticketChannelRenameJobs.delete(channel.id);
  const cooldownRemaining = ticketChannelRenameCooldownRemaining(channel.id);
  if (channel.name !== name && cooldownRemaining > 0) {
    queueTicketChannelRename(channel, name, cooldownRemaining + 1_000);
    return false;
  }
  const renamed = await renameTicketChannel(channel, name);
  if (!renamed) queueTicketChannelRename(channel, name, 10 * 60_000);
  return renamed;
}

async function runQueuedTicketChannelRename(channelId) {
  const job = ticketChannelRenameJobs.get(channelId);
  if (!job || job.running) return;
  job.running = true;
  const attemptedName = job.name;
  const cooldownRemaining = ticketChannelRenameCooldownRemaining(channelId);
  if (job.channel.name !== attemptedName && cooldownRemaining > 0) {
    job.running = false;
    queueTicketChannelRename(job.channel, attemptedName, cooldownRemaining + 1_000);
    return;
  }
  const renamed = await renameTicketChannel(job.channel, attemptedName);
  job.running = false;
  if (job.name !== attemptedName) { queueTicketChannelRename(job.channel, job.name); return; }
  if (!renamed) {
    if (!job.warned) {
      job.warned = true;
      await job.channel.send({ embeds: [modmailEmbed('Channel Rename Delayed', 'The ticket priority was saved, but Discord did not rename this channel. I will retry automatically.')] }).catch(() => null);
    }
    queueTicketChannelRename(job.channel, job.name, 10 * 60_000);
    return;
  }
  if (!job.timer) ticketChannelRenameJobs.delete(channelId);
}

async function restoreTicketChannelNames() {
  const tickets = getTicketState();
  for (const [userId, ticket] of Object.entries(tickets)) {
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (channel?.type !== 0) continue;
    const fallbackName = ticketChannelName(userId, ticket.userName || 'user', ticket.departmentId);
    queueTicketChannelRename(channel, priorityChannelName(ticket, fallbackName));
  }
}

export {
  safeChannelLabel,
  stripPriorityPrefix,
  priorityChannelName,
  escapeRegExp,
  renameTicketChannel,
  ticketChannelRenameCooldownRemaining,
  queueTicketChannelRename,
  syncTicketChannelName,
  restoreTicketChannelNames
};
