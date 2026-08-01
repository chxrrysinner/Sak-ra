import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import logger from '../../../core/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicPath = path.join(__dirname, '..', 'public');

function requireLoginApi(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

function getChannelTypeName(type) {
  const types = {
    0: 'Text', 1: 'DM', 2: 'Voice', 3: 'Group DM', 4: 'Category',
    5: 'Announcement', 10: 'Announcement Thread', 11: 'Public Thread',
    12: 'Private Thread', 13: 'Stage', 14: 'Directory', 15: 'Forum'
  };
  return types[type] || 'Unknown';
}

export default async function startDashboardServer(core) {
  const app = express();
  const port = process.env.DASHBOARD_PORT || 3000;
  const prefixModule = await import('../../core/prefix.js');

  app.use(session({
    secret: process.env.DASHBOARD_SESSION_SECRET || 'hallows-dashboard-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
  }));

  passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: '/auth/discord/callback',
    scope: ['identify', 'guilds']
  }, (accessToken, refreshToken, profile, done) => {
    if (!profile.guilds) profile.guilds = [];
    return done(null, profile);
  }));

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj));

  app.use(passport.initialize());
  app.use(passport.session());
  app.use(express.json());
  app.use(express.static(publicPath));

  // ── Auth Routes ──
  app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));
  app.get('/login', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));
  app.get('/auth/discord', passport.authenticate('discord'));
  app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/login' }), (req, res) => res.redirect('/'));
  app.get('/logout', (req, res) => { req.logout(() => {}); res.redirect('/'); });

  // ── API: User ──
  app.get('/api/user', (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    const user = req.user;
    let guilds = user.guilds || [];
    if (process.env.GUILD_ID) {
      // Always include the configured guild first if it's in the user's guilds
      const configured = guilds.find((g) => g.id === process.env.GUILD_ID);
      if (!configured) {
        guilds.unshift({ id: process.env.GUILD_ID, name: 'Hallows Server' });
      }
    }
    res.json({ id: user.id, username: user.username, discriminator: user.discriminator, avatar: user.avatar, guilds, guildId: process.env.GUILD_ID || null });
  });

  app.get('/api/nodes', (req, res) => res.json(core.state.getAllPermissionNodes()));

  // ── API: Stats & Activity ──
  app.get('/api/stats/:guildId', requireLoginApi, async (req, res) => {
    try {
      const { guildId } = req.params;
      const openTickets = core.state.queryOne('SELECT COUNT(*) as c FROM tickets WHERE status = ?', 'open');
      const totalTickets = core.state.queryOne('SELECT COUNT(*) as c FROM tickets');
      const closedTickets = core.state.queryOne("SELECT COUNT(*) as c FROM tickets WHERE status = 'closed'");
      res.json({
        nodeCount: core.state.getAllPermissionNodes().length,
        wingCount: core.state.getWings(guildId).length,
        ticketCount: openTickets?.c || 0,
        totalTicketCount: totalTickets?.c || 0,
        closedTicketCount: closedTickets?.c || 0,
        moduleCount: Object.values(core.state.getAllModuleToggles(guildId)).filter(Boolean).length
      });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.get('/api/recent-activity/:guildId', requireLoginApi, async (req, res) => {
    try {
      const { guildId } = req.params;
      const limit = parseInt(req.query.limit || 10);
      const logs = core.state.query("SELECT * FROM audit_log WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?", guildId, limit);
      const tickets = core.state.query("SELECT * FROM tickets ORDER BY created_at DESC LIMIT ?", limit);
      res.json({ logs, tickets });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: General Settings ──
  app.get('/api/settings/:guildId', requireLoginApi, (req, res) => {
    try {
      const { guildId } = req.params;
      const settings = core.state.getAllGuildSettings(guildId);
      settings.prefix = core.state.getPrefix(guildId);
      settings.modlog_channel = core.state.getModlogChannel(guildId);
      settings.documents_channel = core.state.getDocumentsChannel(guildId);
      res.json(settings);
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.put('/api/settings/:guildId', requireLoginApi, async (req, res) => {
    try {
      const { guildId } = req.params;
      const { key, value } = req.body;
      if (!key) return res.status(400).json({ error: 'key is required' });
      if (key === 'prefix') {
        prefixModule.setPrefix(guildId, value || '?');
      } else if (key === 'modlog_channel') {
        core.state.setModlogChannel(guildId, value || null);
      } else if (key === 'documents_channel') {
        core.state.setDocumentsChannel(guildId, value || null);
      } else {
        core.state.setGuildSetting(guildId, key, value);
      }
      core.state.logAudit(guildId, req.user.id, 'setting_updated', 'setting', key, value);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Hierarchy / Wings ──
  app.get('/api/wings/:guildId', requireLoginApi, (req, res) => {
    try { res.json(core.state.getWings(req.params.guildId)); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.get('/api/wings/:guildId/:wingId/roles', requireLoginApi, (req, res) => {
    try { res.json(core.state.getWingRoles(req.params.guildId, req.params.wingId)); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.post('/api/hierarchy/wings/:guildId', requireLoginApi, (req, res) => {
    try {
      const { guildId } = req.params;
      const { id, label, channelPrefix, description, sortOrder } = req.body;
      if (!id || !label || !channelPrefix) return res.status(400).json({ error: 'Missing required fields' });
      core.state.createWing(guildId, id, label, channelPrefix, description, sortOrder);
      core.state.logAudit(guildId, req.user.id, 'wing_created', 'wing', id, label);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.put('/api/hierarchy/wings/:guildId/:wingId', requireLoginApi, (req, res) => {
    try {
      core.state.updateWing(req.params.guildId, req.params.wingId, req.body);
      core.state.logAudit(req.params.guildId, req.user.id, 'wing_updated', 'wing', req.params.wingId, JSON.stringify(req.body));
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.delete('/api/hierarchy/wings/:guildId/:wingId', requireLoginApi, (req, res) => {
    try {
      core.state.deleteWing(req.params.guildId, req.params.wingId);
      core.state.logAudit(req.params.guildId, req.user.id, 'wing_deleted', 'wing', req.params.wingId);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.post('/api/hierarchy/wings/:guildId/:wingId/roles', requireLoginApi, (req, res) => {
    try {
      const { guildId, wingId } = req.params;
      const { roleId, rank, label, isLead, isInternal, isCategory, sortOrder } = req.body;
      if (!roleId) return res.status(400).json({ error: 'roleId required' });
      core.state.addWingRole(guildId, wingId, roleId, rank || '1', { label, isLead, isInternal, isCategory, sortOrder });
      core.state.logAudit(guildId, req.user.id, 'wing_role_added', 'role', roleId, JSON.stringify({ wingId }));
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.put('/api/hierarchy/wings/:guildId/:wingId/roles/:roleId', requireLoginApi, (req, res) => {
    try {
      const { guildId, wingId, roleId } = req.params;
      const fields = req.body;
      core.state.removeWingRole(guildId, wingId, roleId);
      core.state.addWingRole(guildId, wingId, roleId, fields.rank || '1', fields);
      core.state.logAudit(guildId, req.user.id, 'wing_role_updated', 'role', roleId, JSON.stringify({ wingId, ...fields }));
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.delete('/api/hierarchy/wings/:guildId/:wingId/roles/:roleId', requireLoginApi, (req, res) => {
    try {
      core.state.removeWingRole(req.params.guildId, req.params.wingId, req.params.roleId);
      core.state.logAudit(req.params.guildId, req.user.id, 'wing_role_removed', 'role', req.params.roleId);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.put('/api/hierarchy/wings/:guildId/reorder', requireLoginApi, (req, res) => {
    try {
      const { wingIds } = req.body;
      if (!Array.isArray(wingIds)) return res.status(400).json({ error: 'wingIds must be an array' });
      core.state.reorderWings(req.params.guildId, wingIds);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Modules ──
  app.get('/api/modules/:guildId', requireLoginApi, (req, res) => {
    try {
      const toggles = core.state.getAllModuleToggles(req.params.guildId);
      const modules = core.registry.getAll().map(mod => ({
        name: mod.name, version: mod.version || '1.0.0',
        enabled: toggles[mod.name] !== false,
        prefixCommands: mod.prefixCommands?.length || 0,
        slashCommands: mod.slashCommands?.length || 0,
        hasComponents: !!(mod.components?.buttons?.length || mod.components?.selectMenus?.length || mod.components?.modals?.length)
      }));
      res.json(modules);
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.put('/api/modules/:guildId/:moduleName', requireLoginApi, (req, res) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
      core.state.setModuleToggle(req.params.guildId, req.params.moduleName, enabled);
      core.state.logAudit(req.params.guildId, req.user.id, `module_${enabled ? 'enabled' : 'disabled'}`, 'module', req.params.moduleName);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Tickets ──
  app.get('/api/tickets/:guildId', requireLoginApi, (req, res) => {
    try {
      const tickets = core.state.query("SELECT * FROM tickets WHERE status = 'open' ORDER BY created_at DESC");
      res.json(tickets.map(t => ({ id: t.id, userId: t.user_id, channelId: t.channel_id, departmentId: t.department_id, status: t.status, priority: t.priority, claimedBy: t.claimed_by, createdAt: t.created_at, channelName: t.channel_name })));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.get('/api/tickets/:guildId/:ticketId', requireLoginApi, (req, res) => {
    try {
      const ticket = core.state.queryOne("SELECT * FROM tickets WHERE id = ?", req.params.ticketId);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      const history = core.state.query("SELECT * FROM ticket_history WHERE ticket_id = ? ORDER BY timestamp ASC", req.params.ticketId);
      res.json({ ticket, history });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.post('/api/tickets/:guildId/:ticketId/close', requireLoginApi, (req, res) => {
    try {
      const ticket = core.state.queryOne("SELECT * FROM tickets WHERE id = ?", req.params.ticketId);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      core.state.run("UPDATE tickets SET status = 'closed', closed_at = datetime('now') WHERE id = ?", req.params.ticketId);
      core.state.logAudit(req.params.guildId, req.user.id, 'ticket_closed', 'ticket', req.params.ticketId, req.body.reason || 'Closed via dashboard');
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.put('/api/tickets/:guildId/:ticketId/priority', requireLoginApi, (req, res) => {
    try {
      const { priority } = req.body;
      if (!['low', 'normal', 'high', 'urgent'].includes(priority)) return res.status(400).json({ error: 'Invalid priority' });
      core.state.run("UPDATE tickets SET priority = ? WHERE id = ?", priority, req.params.ticketId);
      core.state.logAudit(req.params.guildId, req.user.id, 'ticket_priority', 'ticket', req.params.ticketId, priority);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Permissions ──
  app.get('/api/permissions/roles/:guildId', requireLoginApi, (req, res) => {
    try { res.json(core.state.getAllRolePermissions(req.params.guildId)); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.post('/api/permissions/roles/:guildId', requireLoginApi, (req, res) => {
    try {
      const { roleId, node, mode } = req.body;
      if (!roleId || !node || !mode) return res.status(400).json({ error: 'Missing fields' });
      if (mode === 'allow' || mode === 'deny') core.state.grantRolePermission(req.params.guildId, roleId, node, mode, req.user.id);
      else core.state.revokeRolePermission(req.params.guildId, roleId, node);
      core.state.logAudit(req.params.guildId, req.user.id, `permission_${mode}`, 'role', roleId, node);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.get('/api/permissions/audit/:guildId', requireLoginApi, (req, res) => {
    try { res.json(core.state.getAuditLog(req.params.guildId, parseInt(req.query.limit || 50))); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Channels ──
  app.get('/api/channels/:guildId', requireLoginApi, async (req, res) => {
    try {
      const guild = await core.client.guilds.fetch(req.params.guildId);
      const channels = await guild.channels.fetch();
      res.json(channels.map(ch => ({
        id: ch.id, name: ch.name, type: ch.type, typeName: getChannelTypeName(ch.type),
        parentId: ch.parentId, parentName: ch.parent?.name || null, position: ch.rawPosition,
        topic: ch.topic || null, nsfw: ch.nsfw || false, rateLimitPerUser: ch.rateLimitPerUser || 0
      })).sort((a, b) => (a.type === 4 ? 0 : 1) - (b.type === 4 ? 0 : 1) || a.position - b.position));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.get('/api/channels/:guildId/:channelId', requireLoginApi, async (req, res) => {
    try {
      const guild = await core.client.guilds.fetch(req.params.guildId);
      const ch = await guild.channels.fetch(req.params.channelId);
      if (!ch) return res.status(404).json({ error: 'Not found' });
      res.json({ id: ch.id, name: ch.name, type: ch.type, typeName: getChannelTypeName(ch.type), parentId: ch.parentId, topic: ch.topic, nsfw: ch.nsfw, rateLimitPerUser: ch.rateLimitPerUser });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Roles ──
  app.get('/api/roles/:guildId', requireLoginApi, async (req, res) => {
    try {
      const guild = await core.client.guilds.fetch(req.params.guildId);
      const roles = await guild.roles.fetch();
      res.json(roles.map(r => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position, memberCount: r.members.size })).sort((a, b) => b.position - a.position));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.get('/api/roles/:guildId/enhanced', requireLoginApi, async (req, res) => {
    try {
      const guild = await core.client.guilds.fetch(req.params.guildId);
      const roles = await guild.roles.fetch();
      res.json(roles.map(r => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position, memberCount: r.members.size, mentionable: r.mentionable, hoist: r.hoist, managed: r.managed, editable: r.editable, permissions: r.permissions.bitfield.toString() })).sort((a, b) => b.position - a.position));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.get('/api/roles/:guildId/:roleId/members', requireLoginApi, async (req, res) => {
    try {
      const guild = await core.client.guilds.fetch(req.params.guildId);
      const role = await guild.roles.fetch(req.params.roleId);
      if (!role) return res.status(404).json({ error: 'Role not found' });
      await guild.members.fetch();
      res.json(role.members.map(m => ({ id: m.id, username: m.user.username, displayName: m.displayName, avatar: m.user.displayAvatarURL({ size: 32 }), joinedAt: m.joinedAt?.toISOString() })));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Logs ──
  app.get('/api/logs/:guildId', requireLoginApi, (req, res) => {
    try {
      const { guildId } = req.params;
      const { limit = 100, offset = 0, action, actor } = req.query;
      let query = 'SELECT * FROM audit_log WHERE guild_id = ?';
      const params = [guildId];
      if (action) { query += ' AND action = ?'; params.push(action); }
      if (actor) { query += ' AND actor_id = ?'; params.push(actor); }
      const countResult = core.state.queryOne(query.replace('SELECT *', 'SELECT COUNT(*) as total'), ...params);
      query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));
      res.json({ logs: core.state.query(query, ...params), total: countResult?.total || 0, limit: parseInt(limit), offset: parseInt(offset) });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.get('/api/logs/:guildId/actions', requireLoginApi, (req, res) => {
    try {
      const actions = core.state.query("SELECT DISTINCT action FROM audit_log WHERE guild_id = ? ORDER BY action", req.params.guildId);
      res.json(actions.map(a => a.action));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Moderation ──
  app.get('/api/moderation/stats/:guildId', requireLoginApi, (req, res) => {
    try {
      const s = core.state.queryOne("SELECT COUNT(*) as total, COUNT(CASE WHEN action='ban' THEN 1 END) as bans, COUNT(CASE WHEN action='kick' THEN 1 END) as kicks, COUNT(CASE WHEN action='warn' THEN 1 END) as warns, COUNT(CASE WHEN action='mute' THEN 1 END) as mutes, COUNT(CASE WHEN action='timeout' THEN 1 END) as timeouts, COUNT(CASE WHEN action='unban' THEN 1 END) as unbans, COUNT(CASE WHEN action='unmute' THEN 1 END) as unmutes FROM mod_cases WHERE guild_id = ?", req.params.guildId);
      const activeBans = core.state.queryOne("SELECT COUNT(DISTINCT user_id) as count FROM mod_cases WHERE guild_id = ? AND action = 'ban' AND user_id NOT IN (SELECT user_id FROM mod_cases WHERE guild_id = ? AND action = 'unban')", req.params.guildId, req.params.guildId);
      res.json({ totalCases: s?.total || 0, totalBans: s?.bans || 0, totalKicks: s?.kicks || 0, totalWarns: s?.warns || 0, totalMutes: s?.mutes || 0, totalTimeouts: s?.timeouts || 0, totalUnbans: s?.unbans || 0, totalUnmutes: s?.unmutes || 0, activeBans: activeBans?.count || 0 });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.get('/api/moderation/cases/:guildId', requireLoginApi, (req, res) => {
    try {
      const { guildId } = req.params;
      const { limit = 50, offset = 0, action, userId, moderatorId } = req.query;
      let query = 'SELECT * FROM mod_cases WHERE guild_id = ?';
      const params = [guildId];
      if (action) { query += ' AND action = ?'; params.push(action); }
      if (userId) { query += ' AND user_id = ?'; params.push(userId); }
      if (moderatorId) { query += ' AND moderator_id = ?'; params.push(moderatorId); }
      const countResult = core.state.queryOne(query.replace('SELECT *', 'SELECT COUNT(*) as total'), ...params);
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));
      res.json({ cases: core.state.query(query, ...params), total: countResult?.total || 0, limit: parseInt(limit), offset: parseInt(offset) });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.get('/api/moderation/cases/:guildId/:caseId', requireLoginApi, (req, res) => {
    try {
      const caseData = core.state.queryOne("SELECT * FROM mod_cases WHERE guild_id = ? AND id = ?", req.params.guildId, req.params.caseId);
      if (!caseData) return res.status(404).json({ error: 'Case not found' });
      const evidence = core.state.query("SELECT * FROM case_evidence WHERE case_id = ? ORDER BY created_at ASC", req.params.caseId);
      res.json({ case: caseData, evidence });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.post('/api/moderation/cases/:guildId/:caseId', requireLoginApi, (req, res) => {
    try {
      const { reason } = req.body;
      core.state.run("UPDATE mod_cases SET reason = ? WHERE id = ? AND guild_id = ?", reason, req.params.caseId, req.params.guildId);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Moderation Config ──
  app.get('/api/moderation/config/:guildId', requireLoginApi, (req, res) => {
    try {
      const { guildId } = req.params;
      res.json({
        modlog_channel: core.state.getModlogChannel(guildId),
        documents_channel: core.state.getDocumentsChannel(guildId),
        jail_role_id: core.state.getGuildSetting(guildId, 'jail_role_id'),
        jail_channel_id: core.state.getGuildSetting(guildId, 'jail_channel_id'),
        mute_role_id: core.state.getGuildSetting(guildId, 'mute_role_id')
      });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.put('/api/moderation/config/:guildId', requireLoginApi, (req, res) => {
    try {
      const { guildId } = req.params;
      const { key, value } = req.body;
      if (key === 'modlog_channel') core.state.setModlogChannel(guildId, value);
      else if (key === 'documents_channel') core.state.setDocumentsChannel(guildId, value);
      else core.state.setGuildSetting(guildId, key, value);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Leveling ──
  app.get('/api/leveling/:guildId', requireLoginApi, (req, res) => {
    try {
      const config = core.state.getLevelConfig(req.params.guildId);
      const rewards = core.state.getLevelRewards(req.params.guildId);
      res.json({ config, rewards });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.put('/api/leveling/:guildId/config', requireLoginApi, (req, res) => {
    try {
      core.state.setLevelConfig(req.params.guildId, req.body);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.post('/api/leveling/:guildId/rewards', requireLoginApi, (req, res) => {
    try {
      const { level, roleId } = req.body;
      core.state.setLevelReward(req.params.guildId, level, roleId);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.delete('/api/leveling/:guildId/rewards/:level', requireLoginApi, (req, res) => {
    try {
      core.state.removeLevelReward(req.params.guildId, parseInt(req.params.level));
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.get('/api/leveling/:guildId/leaderboard', requireLoginApi, (req, res) => {
    try {
      const lb = core.state.getLeaderboard(req.params.guildId, parseInt(req.query.limit || 10));
      res.json(lb);
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Starboard ──
  app.get('/api/starboard/:guildId', requireLoginApi, (req, res) => {
    try { res.json(core.state.getStarboardConfig(req.params.guildId)); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.put('/api/starboard/:guildId', requireLoginApi, (req, res) => {
    try {
      core.state.setStarboardConfig(req.params.guildId, req.body);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Anti-Raid ──
  app.get('/api/antiraid/:guildId', requireLoginApi, (req, res) => {
    try { res.json(core.state.getRaidConfig(req.params.guildId)); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.put('/api/antiraid/:guildId', requireLoginApi, (req, res) => {
    try {
      core.state.setRaidConfig(req.params.guildId, req.body);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Anti-Nuke ──
  app.get('/api/antinuke/:guildId', requireLoginApi, (req, res) => {
    try { res.json(core.state.getAntinukeConfig(req.params.guildId)); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.put('/api/antinuke/:guildId', requireLoginApi, (req, res) => {
    try {
      core.state.setAntinukeConfig(req.params.guildId, req.body);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Counters ──
  app.get('/api/counters/:guildId', requireLoginApi, (req, res) => {
    try { res.json(core.state.getCounters(req.params.guildId)); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.post('/api/counters/:guildId', requireLoginApi, (req, res) => {
    try {
      const { channelId, counterType, name, format } = req.body;
      core.state.createCounter(req.params.guildId, channelId, counterType, name, format);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.delete('/api/counters/:guildId/:channelId', requireLoginApi, (req, res) => {
    try {
      core.state.deleteCounter(req.params.guildId, req.params.channelId);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Auto-roles ──
  app.get('/api/autoroles/:guildId', requireLoginApi, (req, res) => {
    try { res.json(core.state.getAutoroles(req.params.guildId)); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.post('/api/autoroles/:guildId', requireLoginApi, (req, res) => {
    try {
      core.state.addAutorole(req.params.guildId, req.body.roleId);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.delete('/api/autoroles/:guildId/:roleId', requireLoginApi, (req, res) => {
    try {
      core.state.removeAutorole(req.params.guildId, req.params.roleId);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Fake Permissions ──
  app.get('/api/fake-perms/:guildId', requireLoginApi, (req, res) => {
    try {
      const all = core.state.getAllFakePermissions(req.params.guildId);
      const grouped = {};
      for (const fp of all) {
        if (!grouped[fp.permission_flag]) grouped[fp.permission_flag] = [];
        grouped[fp.permission_flag].push(fp.role_id);
      }
      res.json(grouped);
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.post('/api/fake-perms/:guildId', requireLoginApi, (req, res) => {
    try {
      const { flag, roleId } = req.body;
      if (!flag || !roleId) return res.status(400).json({ error: 'flag and roleId required' });
      core.state.grantFakePermission(req.params.guildId, flag, roleId);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.delete('/api/fake-perms/:guildId/:flag/:roleId', requireLoginApi, (req, res) => {
    try {
      core.state.revokeFakePermission(req.params.guildId, req.params.flag, req.params.roleId);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: PBAN Vote Weights ──
  app.get('/api/pban/weights/:guildId', requireLoginApi, (req, res) => {
    try { res.json(core.state.getPbanVoteWeights(req.params.guildId)); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.put('/api/pban/weights/:guildId/:roleId', requireLoginApi, (req, res) => {
    try {
      const { weight, label } = req.body;
      core.state.setPbanVoteWeight(req.params.guildId, req.params.roleId, weight, label);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.delete('/api/pban/weights/:guildId/:roleId', requireLoginApi, (req, res) => {
    try {
      core.state.removePbanVoteWeight(req.params.guildId, req.params.roleId);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── API: Giveaways (read-only for dashboard) ──
  app.get('/api/giveaways/:guildId', requireLoginApi, (req, res) => {
    try { res.json(core.state.getActiveGiveaways(req.params.guildId)); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  // ── Start Server ──
  await new Promise((resolve, reject) => {
    app.listen(port, () => {
      logger.info({ port }, 'Dashboard server started');
      resolve();
    }).on('error', (err) => {
      logger.error({ error: err.message, port }, 'Dashboard server failed to start');
      reject(err);
    });
  });

  return `http://localhost:${port}`;
}


