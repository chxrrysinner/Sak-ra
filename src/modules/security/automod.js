import { styledEmbed, trimTo } from '../../core/embeds.js';
import client from '../../core/client.js';
import config from '../../core/config.js';
import { upsertBanProfile, sendAntiBotAutomodLog } from './shared.js';

export default async function handleAntiBotAutomodMessage(message) {
  if (message.channel.id !== config.antiBotAutomod.channelId || !message.guild) return false;

  const deleted = await message.delete().then(() => true).catch((error) => {
    console.error(`Anti-bot automod could not delete message ${message.id}:`, error);
    return false;
  });

  const banned = await message.guild.members.ban(message.author.id, {
    deleteMessageSeconds: 60 * 60 * 24,
    reason: config.antiBotAutomod.reason
  }).then(() => true).catch((error) => {
    console.error(`Anti-bot automod ban failed for ${message.author.id}:`, error);
    return false;
  });

  if (!banned) {
    return true;
  }

  await message.author.send({
    embeds: [
      styledEmbed(
        'You Have Been Banned',
        [
          'You have been banned from the server.',
          '',
          `**Reason:** ${config.antiBotAutomod.reason}`,
          '',
          `You can appeal this ban here: ${config.pban.appealsInvite}`
        ].join('\n')
      )
    ],
    allowedMentions: { parse: [] }
  }).catch(() => null);

  upsertBanProfile(message.guild.id, message.author, {
    reason: config.antiBotAutomod.reason,
    bannedAt: Date.now(),
    bannedByUserId: client.user.id,
    bannedByTag: client.user.tag,
    bannedByBot: true,
    banSource: 'anti_bot_automod',
    proofUrls: []
  });
  if (typeof globalThis.__HALLOWS_SAVE_STATE__ === 'function') {
    await globalThis.__HALLOWS_SAVE_STATE__();
  }

  await sendAntiBotAutomodLog(
    message,
    'Banned',
    `**Trap Message Deleted:** ${deleted ? 'Yes' : 'No'}`
  );

  return true;
}
