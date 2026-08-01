import dotenv from 'dotenv';
dotenv.config({ override: true });

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN) { console.error('DISCORD_TOKEN is required'); process.exit(1); }
if (!GUILD_ID) { console.error('GUILD_ID is required'); process.exit(1); }

async function deploy() {
  const { REST, Routes } = await import('discord.js');

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const clientId = (await rest.get(Routes.oauth2CurrentApplication())).id;
  console.log(`client: ${clientId}, guild: ${GUILD_ID}`);

  const { default: registry } = await import('../core/registry.js');
  const modulesDir = new URL('../modules/', import.meta.url).pathname;

  const core = { config: {}, client: null, state: null, logger: console, registry };
  await registry.discover(modulesDir);
  for (const [, desc] of registry.modules) {
    try { if (desc.onLoad) await desc.onLoad(core); } catch {}
  }

  const slashData = registry.getSlashCommandData();
  console.log(`found ${slashData.length} slash commands from modules.`);

  const names = slashData.map(d => d.name).join(', ');
  console.log(`commands: ${names || '(none)'}`);

  console.log('\n--- guild commands ---');
  const guildBefore = await rest.get(Routes.applicationGuildCommands(clientId, GUILD_ID));
  console.log(`existing: ${guildBefore.length} (will be replaced)`);
  if (guildBefore.length) {
    console.log('current guild commands:');
    for (const c of guildBefore) console.log(`  /${c.name}`);
  }

  const guildResult = await rest.put(Routes.applicationGuildCommands(clientId, GUILD_ID), { body: slashData });
  console.log(`registered ${guildResult.length} guild slash commands.`);

  console.log('\n--- global commands ---');
  const globalBefore = await rest.get(Routes.applicationCommands(clientId));
  console.log(`existing: ${globalBefore.length} (will be cleared — we use guild-only commands)`);
  if (globalBefore.length) {
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    console.log('cleared all global commands.');
  } else {
    console.log('no global commands to clear.');
  }

  console.log('\ndone. restart the bot for the commands to be usable.');
}

deploy().catch(err => {
  console.error('failed:', err.message);
  process.exit(1);
});
