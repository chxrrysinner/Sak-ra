import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ override: true });

import logger from './core/logger.js';
import { config, loadConfig, loadGuildSettings, setOverride } from './core/config.js';
import { login, client } from './core/client.js';
globalThis.__HALLOWS_CLIENT__ = client;
import stateManager from './core/state.js';
import registry from './core/registry.js';
import { getPrefix, parseCommand } from './core/prefix.js';
import { findGuild, populateGlobals, saveAllGlobals } from './bridge.js';
import { styledEmbed } from './core/embeds.js';
import { createPipeline, logCommand, rateLimit, requireFakePermission } from './core/middleware.js';

async function main() {
  logger.info('Hallows booting...');

  try {
    await loadConfig();
  } catch (error) {
    logger.fatal(error, 'Configuration error');
    process.exit(1);
  }

  try {
    stateManager.init();
    if (config.guildId) {
      loadGuildSettings(stateManager, config.guildId);
    }
  } catch (error) {
    logger.fatal(error, 'State manager initialization failed');
    process.exit(1);
  }

  const core = {
    config,
    client,
    state: stateManager,
    logger,
    registry
  };

  try {
    const modulesDir = fileURLToPath(new URL('.', import.meta.url));
    await registry.discover(modulesDir);
    await registry.loadAll(core);
    registry.registerPermissionNodes(core.state);
  } catch (error) {
    logger.error(error, 'Module discovery failed');
  }

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled rejection');
  });

  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    saveAllGlobals(stateManager);
    stateManager.close();
    client.destroy();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down...');
    saveAllGlobals(stateManager);
    stateManager.close();
    client.destroy();
    process.exit(0);
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.channel.type === 1) {
      try {
        const { relayUserDm } = await import('./modules/tickets/reply.js');
        await relayUserDm(message);
      } catch (error) {
        logger.error({ userId: message.author.id, error: error.message }, 'DM relay error');
      }
      return;
    }

    const guildId = message.guild?.id;
    if (!guildId) return;

    const prefix = getPrefix(guildId);
    let parsed = parseCommand(message.content, prefix);
    // Ticket commands always use ? prefix regardless of global prefix
    const parsedWithQ = prefix !== '?' ? parseCommand(message.content, '?') : null;
    if (parsedWithQ) {
      const ticketCmd = registry.findPrefixCommand(parsedWithQ.name);
      if (ticketCmd && ticketCmd.module === 'tickets') {
        parsed = parsedWithQ;
      }
    }
    if (!parsed) return;

    try {
      await handlePrefixCommand(message, parsed.name, parsed.args, guildId);
    } catch (error) {
      logger.error({ command: parsed.name, userId: message.author.id, error: error.message }, 'Prefix command error');
      await message.reply({
        embeds: [styledEmbed('Command Error', 'Something went wrong. Check the logs.')]
      }).catch(() => null);
    }
  });

  async function checkFakePermission(interactionOrMessage, flag) {
    if (!flag) return true;
    const member = interactionOrMessage.member || interactionOrMessage?.member;
    if (!member) return false;
    const { memberHasPermission } = await import('./core/permissions.js');
    return memberHasPermission(member, flag);
  }

  function isTicketModule(moduleName) {
    const desc = registry.get(moduleName);
    return desc?.name === 'tickets';
  }

  function isTicketChannel(messageOrInteraction) {
    const channelId = messageOrInteraction.channel?.id || messageOrInteraction.channelId;
    if (!channelId) return false;
    return !!stateManager.getTicketByChannel(channelId);
  }

  async function checkModuleToggle(guildId, cmdInfo) {
    if (!guildId || !cmdInfo) return true;
    const moduleName = cmdInfo.module;
    if (!moduleName || moduleName === 'setup') return true;
    return stateManager.getModuleToggle(guildId, moduleName);
  }

  async function handlePrefixCommand(message, parsedName, args, guildId) {
    const cmdInfo = registry.findPrefixCommand(parsedName);
    if (!cmdInfo) return;

    const moduleEnabled = await checkModuleToggle(guildId, cmdInfo);
    if (!moduleEnabled) return;

    if (isTicketModule(cmdInfo.module) && !isTicketChannel(message) && parsedName !== 'h' && parsedName !== 's' && parsedName !== 'tstart' && parsedName !== 'fclose') return;

    const allowed = await checkFakePermission(message, cmdInfo.requiredFakePermission);
    if (!allowed) return;

    const handlerModule = await registry.loadHandler(cmdInfo);
    if (!handlerModule) return;

    const handleFn = handlerModule.handlePrefixCommand || handlerModule.default || handlerModule;
    if (typeof handleFn === 'function') {
      const ctx = { message, command: { name: parsedName }, user: message.author, guild: message.guild, member: message.member };
      const pipeline = createPipeline().use(logCommand).use(rateLimit(5));
      await pipeline.run(ctx);
      await handleFn(message, args, guildId).catch((error) => {
        logger.error({ command: parsedName, userId: message.author.id, error: error.message }, 'Command error');
      });
    }
  }

  async function handleSlashCommand(interaction) {
    const cmdInfo = registry.findSlashCommand(interaction.commandName);
    if (!cmdInfo) {
      await interaction.reply({ content: '\u200b', ephemeral: true }).catch(() => {});
      return;
    }

    const moduleEnabled = await checkModuleToggle(interaction.guildId, cmdInfo);
    if (!moduleEnabled) {
      await interaction.reply({ content: '\u200b', ephemeral: true }).catch(() => {});
      return;
    }

    if (isTicketModule(cmdInfo.module) && !isTicketChannel(interaction) && interaction.commandName !== 'fclose' && interaction.commandName !== 'tstart') {
      await interaction.reply({ content: '\u200b', ephemeral: true }).catch(() => {});
      return;
    }

    const allowed = await checkFakePermission(interaction, cmdInfo.requiredFakePermission);
    if (!allowed) {
      await interaction.reply({ content: '\u200b', ephemeral: true }).catch(() => {});
      return;
    }

    const handlerModule = await registry.loadHandler(cmdInfo);
    if (!handlerModule) {
      await interaction.reply({ content: '\u200b', ephemeral: true }).catch(() => {});
      return;
    }

    const handleFn = handlerModule.handleSlashCommand || handlerModule.default || handlerModule;
    if (typeof handleFn === 'function') {
      const ctx = { interaction, command: { name: interaction.commandName }, user: interaction.user, guild: interaction.guild, member: interaction.member };
      const pipeline = createPipeline().use(logCommand).use(rateLimit(5));
      await pipeline.run(ctx);
      await handleFn(interaction).catch((error) => {
        logger.error({ command: interaction.commandName, userId: interaction.user.id, error: error.message }, 'Command error');
      });
    }
  }

  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction);
        return;
      }

      if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        const moduleName = registry.findComponentHandler(interaction.customId);
        if (moduleName) {
          const descriptor = registry.get(moduleName);
          const modDir = registry.modulesDir ? pathJoin(registry.modulesDir, moduleName) : null;
          
          if (modDir) {
const handlerPath = descriptor.componentHandlers?.[interaction.customId] || 
                   descriptor.componentHandlers?.[interaction.customId.split(':')[0]] ||
                   './handler.js';
            
            try {
              const mod = await import(`file://${pathJoin(modDir, handlerPath)}`);
              const handleFn = interaction.isButton() ? mod.handleDashboardButton :
                              interaction.isModalSubmit() ? mod.handleDashboardModal :
                              mod.handleComponentInteraction || mod.default;
              
              if (typeof handleFn === 'function') {
                await handleFn(interaction);
                return;
              }
            } catch (error) {
              logger.error({ customId: interaction.customId, module: moduleName, error: error.message }, 'Component handler error');
            }
          }
        }
      }
    } catch (error) {
      logger.error({ type: interaction.type, userId: interaction.user?.id, error: error.message }, 'Interaction error');
      const payload = { content: 'That command failed.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => null);
      } else {
        await interaction.reply(payload).catch(() => null);
      }
    }
  });

  client.once('ready', async () => {
    logger.info(`Hallows online as ${client.user.tag}`);

    try {
      logger.info('Calling populateGlobals...');
      populateGlobals(stateManager);
      logger.info('populateGlobals completed');
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'populateGlobals failed');
    }

    const slashData = registry.getSlashCommandData();
    logger.info({ slashCount: slashData.length }, 'Got slash command data');
    
    if (slashData.length) {
      try {
        logger.info('Calling findGuild...');
        const guild = await findGuild();
        logger.info({ guildId: guild?.id }, 'Found guild');
        if (guild) {
          logger.info('Registering slash commands...');
          await Promise.race([
            guild.commands.set(slashData),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Slash command registration timeout')), 10000))
          ]);
          logger.info({ count: slashData.length, guild: guild.id }, 'Slash commands registered');
        }
      } catch (error) {
        logger.error({ error: error.message }, 'Slash command registration failed');
      }
    }

    logger.info('About to call registry.readyAll');
    await registry.readyAll(core);
    logger.info('registry.readyAll completed');

    setInterval(() => {
      saveAllGlobals(stateManager);
    }, 300_000).unref();
  });

  try {
    await login();
  } catch (error) {
    logger.fatal(error, 'Login failed');
    process.exit(1);
  }
}

function pathJoin(...parts) {
  return parts.join('/').replace(/\/+/g, '/');
}

main();
