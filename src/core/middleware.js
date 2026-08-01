import logger from './logger.js';
import { memberHasAnyRole, commandRoleIds } from './permissions.js';

class MiddlewarePipeline {
  constructor() {
    this.middlewares = [];
  }

  use(fn) {
    this.middlewares.push(fn);
    return this;
  }

  async run(ctx) {
    let index = 0;

    const next = async () => {
      if (index < this.middlewares.length) {
        const mw = this.middlewares[index++];
        await mw(ctx, next);
      }
    };

    await next();
    return ctx;
  }
}

function createPipeline() {
  return new MiddlewarePipeline();
}

const requirePermission = (permission) => async (ctx, next) => {
  const guildId = ctx.guild?.id || ctx.interaction?.guildId || ctx.message?.guild?.id;
  const userId = ctx.user?.id || ctx.member?.id || ctx.interaction?.user?.id || ctx.message?.author?.id;

  if (!guildId || !userId) {
    if (ctx.reply) await ctx.reply({ content: 'Could not verify permissions.', ephemeral: true });
    return;
  }

  const roleIds = commandRoleIds(permission);
  if (!roleIds.length) {
    await next();
    return;
  }

  const allowed = await memberHasAnyRole(guildId, userId, roleIds);
  if (!allowed) {
    if (ctx.reply) await ctx.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    return;
  }

  await next();
};

const logCommand = async (ctx, next) => {
  const commandName = ctx.command?.name || ctx.interaction?.commandName || 'unknown';
  const userId = ctx.user?.id || ctx.interaction?.user?.id || ctx.message?.author?.id;
  const guildId = ctx.guild?.id || ctx.interaction?.guildId || ctx.message?.guild?.id;
  logger.info({ command: commandName, userId, guildId }, 'Command executed');
  await next();
};

const requireFakePermission = (flag) => async (ctx, next) => {
  const member = ctx.member || ctx.interaction?.member || ctx.message?.member;
  if (!member) return;

  const { memberHasPermission } = await import('./permissions.js');
  if (!memberHasPermission(member, flag)) return;

  await next();
};

const rateLimit = (maxPerSecond = 5) => {
  const buckets = new Map();
  return async (ctx, next) => {
    const userId = ctx.user?.id || ctx.interaction?.user?.id || ctx.message?.author?.id;
    if (!userId) {
      await next();
      return;
    }

    const now = Date.now();
    let bucket = buckets.get(userId);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + 1000 };
      buckets.set(userId, bucket);
    }

    bucket.count++;
    if (bucket.count > maxPerSecond) {
      return;
    }

    await next();
  };
};

const auditLog = (action) => async (ctx, next) => {
  await next();
  const entry = {
    action,
    userId: ctx.user?.id || ctx.interaction?.user?.id || ctx.message?.author?.id,
    guildId: ctx.guild?.id || ctx.interaction?.guildId || ctx.message?.guild?.id,
    timestamp: new Date().toISOString(),
    details: ctx.command?.name || ctx.interaction?.commandName || null
  };
  logger.info(entry, 'Audit log');
};

export { MiddlewarePipeline, createPipeline, requirePermission, requireFakePermission, logCommand, rateLimit, auditLog };
export default createPipeline;
