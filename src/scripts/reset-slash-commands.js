import dotenv from 'dotenv';
dotenv.config({ override: true });

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN) { console.error('DISCORD_TOKEN is required'); process.exit(1); }
if (!GUILD_ID) { console.error('GUILD_ID is required'); process.exit(1); }

async function resetSlashCommands() {
  const { Client, REST, Routes } = await import('discord.js');

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const clientId = (await rest.get(Routes.oauth2CurrentApplication())).id;

  console.log(`Client ID: ${clientId}`);
  console.log(`Guild ID: ${GUILD_ID}`);

  console.log('\nFetching existing guild commands...');
  const existing = await rest.get(Routes.applicationGuildCommands(clientId, GUILD_ID));
  console.log(`Found ${existing.length} commands.`);

  console.log('\nDeleting all guild commands...');
  await rest.put(Routes.applicationGuildCommands(clientId, GUILD_ID), { body: [] });
  console.log('Done.');

  console.log('\nFetching global commands...');
  const global = await rest.get(Routes.applicationCommands(clientId));
  console.log(`Found ${global.length} global commands.`);

  if (global.length) {
    console.log('Deleting all global commands...');
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    console.log('Done.');
  }

  console.log('\nAll slash commands cleared. Run `npm run register-slash` to re-deploy, or restart the bot.');
}

resetSlashCommands().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
