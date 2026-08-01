import dotenv from 'dotenv';
dotenv.config({ override: true });

import { fileURLToPath } from 'node:url';

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN) { console.error('❌ DISCORD_TOKEN is required in .env'); process.exit(1); }
if (!GUILD_ID) { console.error('❌ GUILD_ID is required in .env'); process.exit(1); }

async function resetAndRegister() {
  const { REST, Routes } = await import('discord.js');

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const clientId = (await rest.get(Routes.oauth2CurrentApplication())).id;
  console.log(`Client: ${clientId}  |  Guild: ${GUILD_ID}\n`);

  const { default: registry } = await import('../core/registry.js');
  const modulesDir = fileURLToPath(new URL('..', import.meta.url));

  const core = { config: {}, client: null, state: null, logger: console, registry };
  await registry.discover(modulesDir);

  const slashData = registry.getSlashCommandData();
  console.log(`Found ${slashData.length} slash commands across ${registry.modules.size} modules:`);
  for (const d of slashData) console.log(`  /${d.name}`);

  console.log('\n⚙ Clearing all existing guild commands...');
  const before = await rest.get(Routes.applicationGuildCommands(clientId, GUILD_ID));
  console.log(`  ${before.length} commands present (${before.map(c => '/' + c.name).join(', ') || 'none'})`);
  await rest.put(Routes.applicationGuildCommands(clientId, GUILD_ID), { body: [] });
  console.log('  Cleared.\n');

  console.log('⚙ Clearing global commands...');
  const globalBefore = await rest.get(Routes.applicationCommands(clientId));
  if (globalBefore.length) {
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    console.log(`  Cleared ${globalBefore.length} global command(s).\n`);
  } else {
    console.log('  None found.\n');
  }

  console.log(`⚙ Registering ${slashData.length} guild commands...`);
  const result = await rest.put(Routes.applicationGuildCommands(clientId, GUILD_ID), { body: slashData });
  console.log(`  ${result.length} commands registered.\n`);

  console.log('Done — restart the bot for changes to take effect.');
}

resetAndRegister().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
