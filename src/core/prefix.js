import stateManager from './state.js';

let prefixCache = new Map();

function getPrefix(guildId) {
  if (!guildId) return '?';
  if (prefixCache.has(guildId)) return prefixCache.get(guildId);
  const prefix = stateManager.initialized ? stateManager.getPrefix(guildId) : '?';
  prefixCache.set(guildId, prefix);
  return prefix;
}

function setPrefix(guildId, prefix) {
  if (!stateManager.initialized) return;
  stateManager.setPrefix(guildId, prefix);
  prefixCache.set(guildId, prefix);
}

function invalidateCache(guildId) {
  prefixCache.delete(guildId);
}

function clearCache() {
  prefixCache = new Map();
}

function buildCommand(prefix, name) {
  const cmd = prefix + name;
  return cmd;
}

function matchCommand(text, prefix, command) {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapeRegExp(prefix)}${escaped}(?:\\s|$)`, 'i').test(text.trim());
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseCommand(text, prefix) {
  const escapedPrefix = escapeRegExp(prefix);
  const match = text.trim().match(new RegExp(`^${escapedPrefix}(\\S+)(?:\\s+([\\s\\S]*))?$`, 'i'));
  if (!match) return null;
  return { name: match[1].toLowerCase(), args: (match[2] || '').trim() };
}

export { getPrefix, setPrefix, invalidateCache, clearCache, buildCommand, matchCommand, parseCommand, escapeRegExp };
