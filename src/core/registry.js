import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from './logger.js';

class ModuleRegistry {
  constructor() {
    this.modules = new Map();
    this.prefixCommands = new Map();
    this.slashCommands = new Map();
    this.componentHandlers = {
      buttons: new Map(),
      selectMenus: new Map(),
      modals: new Map()
    };
    this.handlerCache = new Map();
    this.modulesDir = null;
    this.permissionNodesRegistered = false;
  }

  async discover(baseDir) {
    const srcDir = path.resolve(baseDir);
    this.modulesDir = path.resolve(srcDir, 'modules');
    if (!fs.existsSync(this.modulesDir)) {
      logger.warn('Modules directory not found at ' + this.modulesDir);
      return;
    }

    const entries = fs.readdirSync(this.modulesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const modulePath = path.join(this.modulesDir, entry.name, 'index.js');
        if (fs.existsSync(modulePath)) {
          try {
            const mod = await import(`file://${modulePath}`);
            this.register(mod.default || mod);
          } catch (error) {
            logger.error({ moduleName: entry.name, error: error.message }, 'Failed to load module');
          }
        }
      }
    }
  }

  register(descriptor) {
    if (!descriptor || !descriptor.name) {
      logger.warn('Module descriptor missing name, skipping');
      return;
    }

    if (this.modules.has(descriptor.name)) {
      logger.warn({ moduleName: descriptor.name }, 'Module already registered, skipping duplicate');
      return;
    }

    this.modules.set(descriptor.name, descriptor);
    this.buildCommandMaps(descriptor);
    logger.info({ moduleName: descriptor.name, version: descriptor.version || '0.0.0' }, 'Module registered');
  }

  registerPermissionNodes(stateManager) {
    if (this.permissionNodesRegistered) return;

    let totalNodes = 0;
    for (const [name, descriptor] of this.modules) {
      if (descriptor.permissionNodes) {
        for (const [node, def] of Object.entries(descriptor.permissionNodes)) {
          const label = def.label || def.description || node;
          const description = def.description || def.label || 'Permission node';
          const groupName = def.group || descriptor.name;
          stateManager.registerPermissionNode(node, descriptor.name, label, description, groupName);
          totalNodes++;
        }
      }
    }
    this.permissionNodesRegistered = true;
    logger.info({ count: totalNodes }, 'Registered permission nodes');
  }

  buildCommandMaps(descriptor) {
    const modDir = path.join(this.modulesDir, descriptor.name);

    if (descriptor.prefixCommands) {
      for (const cmd of descriptor.prefixCommands) {
        const key = cmd.command.toLowerCase();
        if (this.prefixCommands.has(key)) {
          logger.warn({ command: key, module: descriptor.name }, 'Prefix command already registered');
          continue;
        }
        this.prefixCommands.set(key, {
          module: descriptor.name,
          handler: cmd.handler,
          permission: cmd.permission || null,
          requiredFakePermission: cmd.requiredFakePermission || null,
          handlerPath: path.resolve(modDir, cmd.handler)
        });
      }
    }

    if (descriptor.slashCommands) {
      for (const cmd of descriptor.slashCommands) {
        const key = cmd.name.toLowerCase();
        if (this.slashCommands.has(key)) {
          logger.warn({ command: key, module: descriptor.name }, 'Slash command already registered');
          continue;
        }
        this.slashCommands.set(key, {
          module: descriptor.name,
          handler: cmd.handler,
          data: cmd.data,
          requiredFakePermission: cmd.requiredFakePermission || null,
          handlerPath: path.resolve(modDir, cmd.handler)
        });
      }
    }

    if (descriptor.components) {
      const comps = descriptor.components;
      if (comps.buttons) {
        for (const id of comps.buttons) {
          this.componentHandlers.buttons.set(id, descriptor.name);
        }
      }
      if (comps.selectMenus) {
        for (const id of comps.selectMenus) {
          this.componentHandlers.selectMenus.set(id, descriptor.name);
        }
      }
      if (comps.modals) {
        for (const id of comps.modals) {
          this.componentHandlers.modals.set(id, descriptor.name);
        }
      }
    }
  }

  findPrefixCommand(name) {
    return this.prefixCommands.get(name.toLowerCase()) || null;
  }

  findSlashCommand(name) {
    return this.slashCommands.get(name.toLowerCase()) || null;
  }

  findComponentHandler(customId) {
    for (const [id, moduleName] of this.componentHandlers.buttons) {
      if (customId === id || customId.startsWith(id + ':')) return moduleName;
    }
    for (const [id, moduleName] of this.componentHandlers.selectMenus) {
      if (customId === id || customId.startsWith(id + ':')) return moduleName;
    }
    for (const [id, moduleName] of this.componentHandlers.modals) {
      if (customId === id || customId.startsWith(id + ':')) return moduleName;
    }
    return null;
  }

  async loadHandler(handlerInfo) {
    if (this.handlerCache.has(handlerInfo.handlerPath)) {
      return this.handlerCache.get(handlerInfo.handlerPath);
    }

    try {
      const mod = await import(`file://${handlerInfo.handlerPath}`);
      this.handlerCache.set(handlerInfo.handlerPath, mod);
      return mod;
    } catch (error) {
      logger.error({ handlerPath: handlerInfo.handlerPath, error: error.message }, 'Failed to load handler');
      return null;
    }
  }

  getPrefixCommands() {
    return Array.from(this.prefixCommands.entries());
  }

  getSlashCommands() {
    return Array.from(this.slashCommands.entries());
  }

  async loadAll(core) {
    for (const [name, descriptor] of this.modules) {
      try {
        if (descriptor.onLoad) {
          await descriptor.onLoad(core);
        }
        logger.debug({ moduleName: name }, 'Module loaded');
      } catch (error) {
        logger.error({ moduleName: name, error: error.message }, 'Failed to load module');
      }
    }
  }

  async readyAll(core) {
    logger.info({ moduleCount: this.modules.size }, 'Starting readyAll for all modules');
    for (const [name, descriptor] of this.modules) {
      try {
        if (descriptor.onReady) {
          logger.info({ moduleName: name }, 'Calling onReady for module');
          await descriptor.onReady(core);
        }
        logger.info({ moduleName: name }, 'Module ready');
      } catch (error) {
        logger.error({ moduleName: name, error: error.message, stack: error.stack }, 'Failed to ready module');
      }
    }
    logger.info('All modules ready');
  }

  get(name) {
    return this.modules.get(name) || null;
  }

  getSlashCommandData() {
    return Array.from(this.slashCommands.values())
      .filter((cmd) => cmd.data)
      .map((cmd) => {
        if (typeof cmd.data.toJSON === 'function') return cmd.data.toJSON();
        return cmd.data;
      });
  }

  getAll() {
    return Array.from(this.modules.values());
  }
}

const registry = new ModuleRegistry();

export { ModuleRegistry, registry };
export default registry;
