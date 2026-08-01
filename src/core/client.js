import { Client, GatewayIntentBits, Partials } from 'discord.js';
import config from './config.js';
import logger from './logger.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once('ready', () => {
  logger.info(`Logged in as ${client.user.tag}`);
});

client.on('error', (error) => {
  logger.error(error, 'Client error');
});

async function login() {
  await client.login(config.discordToken);
  return client;
}

export { client, login };
export default client;
