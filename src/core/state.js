import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import config from './config.js';
import logger from './logger.js';

class StateManager {
  constructor(dbPath = './data/hallows.db') {
    this.dbPath = path.resolve(dbPath);
    this.db = null;
    this.cache = {
      tickets: new Map(),
      settings: new Map()
    };
    this.initialized = false;
  }

  init() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.migrate();
    this.initialized = true;
    logger.info({ dbPath: this.dbPath }, 'State manager initialized');
    return this;
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        channel_id TEXT,
        department_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        priority TEXT NOT NULL DEFAULT 'normal',
        claimed_by TEXT,
        claim_authority INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        closed_at TEXT,
        channel_name TEXT,
        custom_name TEXT
      );

      CREATE TABLE IF NOT EXISTS ticket_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id),
        user_id TEXT NOT NULL,
        content TEXT,
        attachment_urls TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS staff_hierarchy (
        wing TEXT NOT NULL,
        rank TEXT NOT NULL,
        role_id TEXT NOT NULL,
        PRIMARY KEY (wing, rank)
      );

      CREATE TABLE IF NOT EXISTS strikes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        staff_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pban_proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_user_id TEXT NOT NULL,
        proposer_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        message_id TEXT
      );

      CREATE TABLE IF NOT EXISTS pban_votes (
        proposal_id INTEGER NOT NULL REFERENCES pban_proposals(id),
        voter_id TEXT NOT NULL,
        vote TEXT NOT NULL,
        weight INTEGER NOT NULL,
        PRIMARY KEY (proposal_id, voter_id)
      );

      CREATE TABLE IF NOT EXISTS ban_profiles (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        proof_urls TEXT,
        last_synced_at TEXT,
        PRIMARY KEY (user_id, guild_id)
      );

      CREATE TABLE IF NOT EXISTS staff_breaks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        reason TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ends_at TEXT,
        ended_at TEXT,
        removed_role_ids TEXT,
        message_count INTEGER NOT NULL DEFAULT 0,
        approved_by TEXT
      );

      CREATE TABLE IF NOT EXISTS break_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        channel_id TEXT,
        message_id TEXT,
        duration_text TEXT NOT NULL,
        duration_ms INTEGER,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS performance_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        staff_id TEXT NOT NULL,
        guild_id TEXT,
        wing TEXT,
        user_tag TEXT,
        started_by_user_id TEXT,
        started_by_tag TEXT,
        completed_by_user_id TEXT,
        completed_by_tag TEXT,
        completed_at TEXT,
        result_note TEXT,
        reason TEXT NOT NULL,
        goals TEXT NOT NULL,
        due_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS reviewed_applications (
        response_id TEXT PRIMARY KEY,
        posted_at TEXT NOT NULL,
        approved BOOLEAN,
        reviewed_by TEXT
      );

      CREATE TABLE IF NOT EXISTS timed_closes (
        user_id TEXT PRIMARY KEY,
        close_at TEXT NOT NULL,
        warned_user BOOLEAN NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS guild_config (
        guild_id TEXT PRIMARY KEY,
        prefix TEXT NOT NULL DEFAULT '?',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        PRIMARY KEY (guild_id, key)
      );

      CREATE TABLE IF NOT EXISTS wings (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        channel_prefix TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS wing_roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wing_id TEXT NOT NULL REFERENCES wings(id) ON DELETE CASCADE,
        guild_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        rank TEXT NOT NULL DEFAULT '1',
        label TEXT,
        is_lead INTEGER NOT NULL DEFAULT 0,
        is_internal INTEGER NOT NULL DEFAULT 0,
        is_category INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        UNIQUE(wing_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS fake_permissions (
        guild_id TEXT NOT NULL,
        permission_flag TEXT NOT NULL,
        role_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (guild_id, permission_flag, role_id)
      );

      CREATE TABLE IF NOT EXISTS mod_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT,
        duration TEXT,
        channel_id TEXT,
        message_count INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_mod_cases_guild ON mod_cases(guild_id);
      CREATE INDEX IF NOT EXISTS idx_mod_cases_user ON mod_cases(user_id);

      CREATE TABLE IF NOT EXISTS case_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id INTEGER NOT NULL REFERENCES mod_cases(id) ON DELETE CASCADE,
        guild_id TEXT NOT NULL,
        url TEXT NOT NULL,
        filename TEXT,
        uploaded_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_case_evidence_case ON case_evidence(case_id);

      CREATE TABLE IF NOT EXISTS module_toggles (
        guild_id TEXT NOT NULL,
        module_name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (guild_id, module_name)
      );

      CREATE TABLE IF NOT EXISTS raid_config (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        join_threshold INTEGER NOT NULL DEFAULT 10,
        time_window_seconds INTEGER NOT NULL DEFAULT 10,
        auto_lockout_minutes INTEGER NOT NULL DEFAULT 15,
        whitelist_role_ids TEXT NOT NULL DEFAULT '[]',
        notify_channel_id TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS raid_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT,
        join_count INTEGER NOT NULL DEFAULT 0,
        action_taken TEXT NOT NULL DEFAULT 'lockdown',
        status TEXT NOT NULL DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS antinuke_config (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        channel_delete_threshold INTEGER NOT NULL DEFAULT 3,
        role_delete_threshold INTEGER NOT NULL DEFAULT 3,
        ban_add_threshold INTEGER NOT NULL DEFAULT 3,
        time_window_seconds INTEGER NOT NULL DEFAULT 5,
        auto_lockout_minutes INTEGER NOT NULL DEFAULT 30,
        whitelist_role_ids TEXT NOT NULL DEFAULT '[]',
        whitelist_user_ids TEXT NOT NULL DEFAULT '[]',
        action_on_trigger TEXT NOT NULL DEFAULT 'lockdown',
        notify_channel_id TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS antinuke_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        actor_id TEXT,
        count INTEGER NOT NULL DEFAULT 1,
        action_taken TEXT NOT NULL DEFAULT 'lockdown',
        details TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS level_config (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        xp_min INTEGER NOT NULL DEFAULT 5,
        xp_max INTEGER NOT NULL DEFAULT 15,
        cooldown_seconds INTEGER NOT NULL DEFAULT 60,
        scaling_factor REAL NOT NULL DEFAULT 100,
        announce_levelup INTEGER NOT NULL DEFAULT 0,
        announce_channel_id TEXT
      );

      CREATE TABLE IF NOT EXISTS levels (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 0,
        last_message_at TEXT,
        PRIMARY KEY (guild_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS level_rewards (
        guild_id TEXT NOT NULL,
        level INTEGER NOT NULL,
        role_id TEXT NOT NULL,
        PRIMARY KEY (guild_id, level)
      );

      CREATE TABLE IF NOT EXISTS autoroles (
        guild_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (guild_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS giveaways (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT,
        prize TEXT NOT NULL,
        description TEXT,
        winner_count INTEGER NOT NULL DEFAULT 1,
        ends_at TEXT NOT NULL,
        host_id TEXT NOT NULL,
        ended INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS giveaway_entries (
        giveaway_id INTEGER NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (giveaway_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS pban_vote_weights (
        guild_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        weight INTEGER NOT NULL DEFAULT 1,
        label TEXT,
        PRIMARY KEY (guild_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS staff_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0,
        ticket_replies INTEGER NOT NULL DEFAULT 0,
        mod_actions INTEGER NOT NULL DEFAULT 0,
        UNIQUE(guild_id, user_id, date)
      );

      CREATE TABLE IF NOT EXISTS tempbans (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (guild_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS starboard_config (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT,
        threshold INTEGER NOT NULL DEFAULT 3,
        enabled INTEGER NOT NULL DEFAULT 0,
        emoji TEXT NOT NULL DEFAULT '⭐'
      );

      CREATE TABLE IF NOT EXISTS starboard_messages (
        source_message_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        content TEXT,
        star_count INTEGER NOT NULL DEFAULT 0,
        starboard_message_id TEXT,
        PRIMARY KEY (guild_id, source_message_id)
      );

      CREATE TABLE IF NOT EXISTS counters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        counter_type TEXT NOT NULL,
        name TEXT,
        format TEXT NOT NULL DEFAULT '{count}',
        UNIQUE(guild_id, channel_id)
      );

      CREATE INDEX IF NOT EXISTS idx_wings_guild ON wings(guild_id);
      CREATE INDEX IF NOT EXISTS idx_wing_roles_guild ON wing_roles(guild_id);
      CREATE INDEX IF NOT EXISTS idx_wing_roles_wing ON wing_roles(wing_id);

      -- Permission Node System (3-layer: nodes, roles, channels)
      CREATE TABLE IF NOT EXISTS permission_nodes (
        node TEXT PRIMARY KEY,
        module TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT NOT NULL,
        group_name TEXT
      );

      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        node TEXT NOT NULL REFERENCES permission_nodes(node),
        mode TEXT NOT NULL DEFAULT 'allow',
        granted_by TEXT,
        granted_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (role_id, guild_id, node)
      );

      CREATE TABLE IF NOT EXISTS user_permissions (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        node TEXT NOT NULL REFERENCES permission_nodes(node),
        mode TEXT NOT NULL DEFAULT 'allow',
        PRIMARY KEY (user_id, guild_id, node)
      );

      CREATE TABLE IF NOT EXISTS channel_overrides (
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        node TEXT,
        mode TEXT NOT NULL DEFAULT 'deny',
        PRIMARY KEY (guild_id, channel_id, coalesce(node, ''), mode)
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        details TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_guild ON audit_log(guild_id, timestamp);
    `);

    try {
      this.db.exec('ALTER TABLE wings ADD COLUMN category_id TEXT');
    } catch {
      /* column already exists */
    }

    try {
      this.db.exec('ALTER TABLE wings ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0');
    } catch {
      /* column already exists */
    }

    for (const col of ['guild_id','user_tag','started_by_user_id','started_by_tag','completed_by_user_id','completed_by_tag','completed_at','result_note']) {
      try { this.db.exec(`ALTER TABLE performance_plans ADD COLUMN ${col} TEXT`); } catch { /* column exists */ }
    }

    for (const col of ['guild_id','removed_role_ids','approved_by']) {
      try { this.db.exec(`ALTER TABLE staff_breaks ADD COLUMN ${col} TEXT`); } catch { /* column exists */ }
    }
    try { this.db.exec('ALTER TABLE staff_breaks ADD COLUMN message_count INTEGER NOT NULL DEFAULT 0'); } catch { /* column exists */ }

    try {
      this.db.exec('ALTER TABLE timed_closes ADD COLUMN user_id TEXT');
    } catch { /* column exists or table was recreated */ }
  }

  getPrefix(guildId) {
    const row = this.db.prepare('SELECT prefix FROM guild_config WHERE guild_id = ?').get(guildId);
    return row ? row.prefix : '?';
  }

  setPrefix(guildId, prefix) {
    this.db.prepare(
      'INSERT INTO guild_config (guild_id, prefix, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(guild_id) DO UPDATE SET prefix = excluded.prefix, updated_at = excluded.updated_at'
    ).run(guildId, prefix);
  }

  getWings(guildId) {
    return this.db.prepare('SELECT * FROM wings WHERE guild_id = ? ORDER BY sort_order ASC').all(guildId);
  }

  getWing(guildId, wingId) {
    return this.db.prepare('SELECT * FROM wings WHERE guild_id = ? AND id = ?').get(guildId, wingId);
  }

  createWing(guildId, id, label, channelPrefix, description = '', sortOrder = 0) {
    this.db.prepare(
      'INSERT INTO wings (id, guild_id, label, description, channel_prefix, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, guildId, label, description, channelPrefix, sortOrder);
  }

  updateWing(guildId, wingId, fields) {
    const sets = [];
    const params = [];
    for (const [key, value] of Object.entries(fields)) {
      const col = { label: 'label', description: 'description', channelPrefix: 'channel_prefix', sortOrder: 'sort_order', categoryId: 'category_id', isDefault: 'is_default' }[key];
      if (col) {
        sets.push(`${col} = ?`);
        params.push(value);
      }
    }
    if (sets.length) {
      params.push(guildId, wingId);
      this.db.prepare(`UPDATE wings SET ${sets.join(', ')} WHERE guild_id = ? AND id = ?`).run(...params);
    }
  }

  deleteWing(guildId, wingId) {
    this.db.prepare('DELETE FROM wing_roles WHERE wing_id = ? AND guild_id = ?').run(wingId, guildId);
    this.db.prepare('DELETE FROM wings WHERE id = ? AND guild_id = ?').run(wingId, guildId);
  }

  setWingCategory(guildId, wingId, categoryId) {
    this.db.prepare('UPDATE wings SET category_id = ? WHERE guild_id = ? AND id = ?').run(categoryId, guildId, wingId);
  }

  getWingRoles(guildId, wingId) {
    return this.db.prepare(
      'SELECT * FROM wing_roles WHERE guild_id = ? AND wing_id = ? ORDER BY sort_order ASC'
    ).all(guildId, wingId);
  }

  addWingRole(guildId, wingId, roleId, rank = '1', options = {}) {
    const { label = null, isLead = false, isInternal = false, isCategory = false, sortOrder = 0 } = options;
    this.db.prepare(
      `INSERT OR REPLACE INTO wing_roles (wing_id, guild_id, role_id, rank, label, is_lead, is_internal, is_category, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(wingId, guildId, roleId, rank, label, isLead ? 1 : 0, isInternal ? 1 : 0, isCategory ? 1 : 0, sortOrder);
  }

  removeWingRole(guildId, wingId, roleId) {
    this.db.prepare('DELETE FROM wing_roles WHERE guild_id = ? AND wing_id = ? AND role_id = ?').run(guildId, wingId, roleId);
  }

  reorderWings(guildId, wingIds) {
    const tx = this.db.transaction(() => {
      wingIds.forEach((wingId, index) => {
        this.db.prepare('UPDATE wings SET sort_order = ? WHERE guild_id = ? AND id = ?').run(index, guildId, wingId);
      });
    });
    tx();
  }

  getRaidConfig(guildId) {
    let config = this.db.prepare('SELECT * FROM raid_config WHERE guild_id = ?').get(guildId);
    if (!config) {
      return {
        guild_id: guildId,
        enabled: 0,
        join_threshold: 10,
        time_window_seconds: 10,
        auto_lockout_minutes: 15,
        whitelist_role_ids: [],
        notify_channel_id: null
      };
    }
    return {
      ...config,
      whitelist_role_ids: JSON.parse(config.whitelist_role_ids || '[]')
    };
  }

  setRaidConfig(guildId, fields) {
    const existing = this.db.prepare('SELECT * FROM raid_config WHERE guild_id = ?').get(guildId);
    const config = existing ? { ...existing, ...fields } : { guild_id: guildId, ...fields };
    const whitelistJson = JSON.stringify(config.whitelist_role_ids || []);
    this.db.prepare(
      `INSERT INTO raid_config (guild_id, enabled, join_threshold, time_window_seconds, auto_lockout_minutes, whitelist_role_ids, notify_channel_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(guild_id) DO UPDATE SET
         enabled = excluded.enabled,
         join_threshold = excluded.join_threshold,
         time_window_seconds = excluded.time_window_seconds,
         auto_lockout_minutes = excluded.auto_lockout_minutes,
         whitelist_role_ids = excluded.whitelist_role_ids,
         notify_channel_id = excluded.notify_channel_id,
         updated_at = excluded.updated_at`
    ).run(
      guildId,
      config.enabled ?? 0,
      config.join_threshold ?? 10,
      config.time_window_seconds ?? 10,
      config.auto_lockout_minutes ?? 15,
      whitelistJson,
      config.notify_channel_id ?? null
    );
  }

  createRaidEvent(guildId, joinCount, actionTaken = 'lockdown') {
    const result = this.db.prepare(
      'INSERT INTO raid_events (guild_id, join_count, action_taken) VALUES (?, ?, ?)'
    ).run(guildId, joinCount, actionTaken);
    return result.lastInsertRowid;
  }

  endRaidEvent(eventId) {
    this.db.prepare(
      "UPDATE raid_events SET ended_at = datetime('now'), status = 'ended' WHERE id = ?"
    ).run(eventId);
  }

  getActiveRaidEvent(guildId) {
    return this.db.prepare(
      "SELECT * FROM raid_events WHERE guild_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1"
    ).get(guildId) || null;
  }

  getAntinukeConfig(guildId) {
    let config = this.db.prepare('SELECT * FROM antinuke_config WHERE guild_id = ?').get(guildId);
    if (!config) {
      return {
        guild_id: guildId,
        enabled: 0,
        channel_delete_threshold: 3,
        role_delete_threshold: 3,
        ban_add_threshold: 3,
        time_window_seconds: 5,
        auto_lockout_minutes: 30,
        whitelist_role_ids: [],
        whitelist_user_ids: [],
        action_on_trigger: 'lockdown',
        notify_channel_id: null
      };
    }
    return {
      ...config,
      whitelist_role_ids: JSON.parse(config.whitelist_role_ids || '[]'),
      whitelist_user_ids: JSON.parse(config.whitelist_user_ids || '[]')
    };
  }

  setAntinukeConfig(guildId, fields) {
    const existing = this.db.prepare('SELECT * FROM antinuke_config WHERE guild_id = ?').get(guildId);
    const config = existing ? { ...existing, ...fields } : { guild_id: guildId, ...fields };
    this.db.prepare(
      `INSERT INTO antinuke_config (guild_id, enabled, channel_delete_threshold, role_delete_threshold, ban_add_threshold, time_window_seconds, auto_lockout_minutes, whitelist_role_ids, whitelist_user_ids, action_on_trigger, notify_channel_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(guild_id) DO UPDATE SET
         enabled = excluded.enabled,
         channel_delete_threshold = excluded.channel_delete_threshold,
         role_delete_threshold = excluded.role_delete_threshold,
         ban_add_threshold = excluded.ban_add_threshold,
         time_window_seconds = excluded.time_window_seconds,
         auto_lockout_minutes = excluded.auto_lockout_minutes,
         whitelist_role_ids = excluded.whitelist_role_ids,
         whitelist_user_ids = excluded.whitelist_user_ids,
         action_on_trigger = excluded.action_on_trigger,
         notify_channel_id = excluded.notify_channel_id,
         updated_at = excluded.updated_at`
    ).run(
      guildId,
      config.enabled ?? 0,
      config.channel_delete_threshold ?? 3,
      config.role_delete_threshold ?? 3,
      config.ban_add_threshold ?? 3,
      config.time_window_seconds ?? 5,
      config.auto_lockout_minutes ?? 30,
      JSON.stringify(config.whitelist_role_ids || []),
      JSON.stringify(config.whitelist_user_ids || []),
      config.action_on_trigger ?? 'lockdown',
      config.notify_channel_id ?? null
    );
  }

  logAntinukeEvent(guildId, eventType, actorId = null, count = 1, actionTaken = 'lockdown', details = null) {
    const result = this.db.prepare(
      'INSERT INTO antinuke_events (guild_id, event_type, actor_id, count, action_taken, details) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(guildId, eventType, actorId, count, actionTaken, details);
    return result.lastInsertRowid;
  }

  // ── Leveling ──

  getLevelConfig(guildId) {
    const row = this.db.prepare('SELECT * FROM level_config WHERE guild_id = ?').get(guildId);
    return row || { guild_id: guildId, enabled: 1, xp_min: 5, xp_max: 15, cooldown_seconds: 60, scaling_factor: 100, announce_levelup: 0, announce_channel_id: null };
  }

  setLevelConfig(guildId, fields) {
    const existing = this.db.prepare('SELECT * FROM level_config WHERE guild_id = ?').get(guildId);
    const config = existing ? { ...existing, ...fields } : { guild_id: guildId, ...fields };
    this.db.prepare(
      `INSERT INTO level_config (guild_id, enabled, xp_min, xp_max, cooldown_seconds, scaling_factor, announce_levelup, announce_channel_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(guild_id) DO UPDATE SET
         enabled = excluded.enabled, xp_min = excluded.xp_min, xp_max = excluded.xp_max,
         cooldown_seconds = excluded.cooldown_seconds, scaling_factor = excluded.scaling_factor,
         announce_levelup = excluded.announce_levelup, announce_channel_id = excluded.announce_channel_id`
    ).run(guildId, config.enabled ?? 1, config.xp_min ?? 5, config.xp_max ?? 15, config.cooldown_seconds ?? 60, config.scaling_factor ?? 100, config.announce_levelup ?? 0, config.announce_channel_id ?? null);
  }

  getUserLevel(guildId, userId) {
    return this.db.prepare('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?').get(guildId, userId) || { guild_id: guildId, user_id: userId, xp: 0, level: 0, last_message_at: null };
  }

  upsertUserLevel(guildId, userId, xp, level, lastMessageAt) {
    this.db.prepare(
      'INSERT INTO levels (guild_id, user_id, xp, level, last_message_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level, last_message_at = excluded.last_message_at'
    ).run(guildId, userId, xp, level, lastMessageAt);
  }

  getLeaderboard(guildId, limit = 10) {
    return this.db.prepare('SELECT * FROM levels WHERE guild_id = ? AND level > 0 ORDER BY level DESC, xp DESC LIMIT ?').all(guildId, limit);
  }

  getLevelRewards(guildId) {
    return this.db.prepare('SELECT * FROM level_rewards WHERE guild_id = ? ORDER BY level ASC').all(guildId);
  }

  getLevelReward(guildId, level) {
    return this.db.prepare('SELECT * FROM level_rewards WHERE guild_id = ? AND level = ?').get(guildId, level);
  }

  setLevelReward(guildId, level, roleId) {
    this.db.prepare('INSERT OR REPLACE INTO level_rewards (guild_id, level, role_id) VALUES (?, ?, ?)').run(guildId, level, roleId);
  }

  removeLevelReward(guildId, level) {
    this.db.prepare('DELETE FROM level_rewards WHERE guild_id = ? AND level = ?').run(guildId, level);
  }

  // ── Autoroles ──

  getAutoroles(guildId) {
    return this.db.prepare('SELECT role_id FROM autoroles WHERE guild_id = ?').all(guildId).map((r) => r.role_id);
  }

  addAutorole(guildId, roleId) {
    this.db.prepare('INSERT OR IGNORE INTO autoroles (guild_id, role_id) VALUES (?, ?)').run(guildId, roleId);
  }

  removeAutorole(guildId, roleId) {
    this.db.prepare('DELETE FROM autoroles WHERE guild_id = ? AND role_id = ?').run(guildId, roleId);
  }

  // ── Giveaways ──

  createGiveaway(guildId, channelId, prize, description, winnerCount, endsAt, hostId) {
    const result = this.db.prepare(
      'INSERT INTO giveaways (guild_id, channel_id, prize, description, winner_count, ends_at, host_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(guildId, channelId, prize, description, winnerCount, endsAt, hostId);
    return result.lastInsertRowid;
  }

  setGiveawayMessageId(giveawayId, messageId) {
    this.db.prepare('UPDATE giveaways SET message_id = ? WHERE id = ?').run(messageId, giveawayId);
  }

  getActiveGiveaways(guildId = null) {
    let sql = "SELECT * FROM giveaways WHERE ended = 0";
    const params = [];
    if (guildId) { sql += ' AND guild_id = ?'; params.push(guildId); }
    return this.db.prepare(sql).all(...params);
  }

  getGiveaway(id) {
    return this.db.prepare('SELECT * FROM giveaways WHERE id = ?').get(id);
  }

  endGiveaway(id) {
    this.db.prepare("UPDATE giveaways SET ended = 1 WHERE id = ?").run(id);
  }

  addGiveawayEntry(giveawayId, userId) {
    this.db.prepare('INSERT OR IGNORE INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)').run(giveawayId, userId);
  }

  getGiveawayEntries(giveawayId) {
    return this.db.prepare('SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?').all(giveawayId).map((r) => r.user_id);
  }

  hasGiveawayEntry(giveawayId, userId) {
    const row = this.db.prepare('SELECT 1 FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?').get(giveawayId, userId);
    return !!row;
  }

  // ── PBAN Vote Weights ──

  getPbanVoteWeights(guildId) {
    return this.db.prepare('SELECT * FROM pban_vote_weights WHERE guild_id = ? ORDER BY weight DESC').all(guildId);
  }

  getPbanVoteWeight(guildId, roleId) {
    const row = this.db.prepare('SELECT weight FROM pban_vote_weights WHERE guild_id = ? AND role_id = ?').get(guildId, roleId);
    return row ? row.weight : null;
  }

  setPbanVoteWeight(guildId, roleId, weight, label) {
    this.db.prepare(
      'INSERT OR REPLACE INTO pban_vote_weights (guild_id, role_id, weight, label) VALUES (?, ?, ?, ?)'
    ).run(guildId, roleId, weight, label || null);
  }

  removePbanVoteWeight(guildId, roleId) {
    this.db.prepare('DELETE FROM pban_vote_weights WHERE guild_id = ? AND role_id = ?').run(guildId, roleId);
  }

  // ── Staff Activity ──

  incrementStaffActivity(guildId, userId, date, field) {
    const cols = ['message_count', 'ticket_replies', 'mod_actions'];
    if (!cols.includes(field)) return;
    this.db.prepare(`
      INSERT INTO staff_activity (guild_id, user_id, date, ${field})
      VALUES (?, ?, ?, 1)
      ON CONFLICT(guild_id, user_id, date) DO UPDATE SET
        ${field} = ${field} + 1
    `).run(guildId, userId, date);
  }

  getStaffActivity(guildId, userId, days = 7) {
    const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const rows = this.db.prepare(
      'SELECT SUM(message_count) as msgs, SUM(ticket_replies) as replies, SUM(mod_actions) as mods FROM staff_activity WHERE guild_id = ? AND user_id = ? AND date >= ?'
    ).get(guildId, userId, since);
    return { messages: rows?.msgs || 0, replies: rows?.replies || 0, modActions: rows?.mods || 0 };
  }

  getStaffActivityAllTime(guildId, userId) {
    const rows = this.db.prepare(
      'SELECT SUM(message_count) as msgs, SUM(ticket_replies) as replies, SUM(mod_actions) as mods FROM staff_activity WHERE guild_id = ? AND user_id = ?'
    ).get(guildId, userId);
    return { messages: rows?.msgs || 0, replies: rows?.replies || 0, modActions: rows?.mods || 0 };
  }

  getStatsExcludedChannels(guildId) {
    const val = this.getGuildSetting(guildId, 'stats_excluded_channels', '[]');
    try { return JSON.parse(val); } catch { return []; }
  }

  setStatsExcludedChannels(guildId, channelIds) {
    this.setGuildSetting(guildId, 'stats_excluded_channels', JSON.stringify(channelIds));
  }

  // ── Tempbans ──

  getExpiredTempbans() {
    return this.db.prepare(
      "SELECT * FROM tempbans WHERE expires_at <= datetime('now')"
    ).all();
  }

  getPendingTempbans(guildId) {
    return this.db.prepare(
      "SELECT * FROM tempbans WHERE guild_id = ? AND expires_at > datetime('now')"
    ).all(guildId);
  }

  removeTempban(guildId, userId) {
    this.db.prepare('DELETE FROM tempbans WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  }

  // ── Starboard ──

  getStarboardConfig(guildId) {
    const row = this.db.prepare('SELECT * FROM starboard_config WHERE guild_id = ?').get(guildId);
    return row || { guild_id: guildId, channel_id: null, threshold: 3, enabled: 0, emoji: '⭐' };
  }

  setStarboardConfig(guildId, fields) {
    const existing = this.db.prepare('SELECT * FROM starboard_config WHERE guild_id = ?').get(guildId);
    const config = existing ? { ...existing, ...fields } : { guild_id: guildId, ...fields };
    this.db.prepare(
      `INSERT INTO starboard_config (guild_id, channel_id, threshold, enabled, emoji)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, threshold = excluded.threshold, enabled = excluded.enabled, emoji = excluded.emoji`
    ).run(guildId, config.channel_id ?? null, config.threshold ?? 3, config.enabled ?? 0, config.emoji ?? '⭐');
  }

  getStarboardMessage(guildId, sourceMessageId) {
    return this.db.prepare('SELECT * FROM starboard_messages WHERE guild_id = ? AND source_message_id = ?').get(guildId, sourceMessageId);
  }

  upsertStarboardMessage(guildId, sourceMessageId, channelId, authorId, content, starCount, starboardMessageId = null) {
    this.db.prepare(
      `INSERT INTO starboard_messages (source_message_id, guild_id, channel_id, author_id, content, star_count, starboard_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(guild_id, source_message_id) DO UPDATE SET star_count = excluded.star_count, starboard_message_id = excluded.starboard_message_id`
    ).run(sourceMessageId, guildId, channelId, authorId, content, starCount, starboardMessageId);
  }

  removeStarboardMessage(guildId, sourceMessageId) {
    this.db.prepare('DELETE FROM starboard_messages WHERE guild_id = ? AND source_message_id = ?').run(guildId, sourceMessageId);
  }

  // ── Counters ──

  getCounters(guildId) {
    return this.db.prepare('SELECT * FROM counters WHERE guild_id = ?').all(guildId);
  }

  getCounter(guildId, channelId) {
    return this.db.prepare('SELECT * FROM counters WHERE guild_id = ? AND channel_id = ?').get(guildId, channelId);
  }

  createCounter(guildId, channelId, counterType, name = null, formatStr = '{count}') {
    this.db.prepare(
      'INSERT OR REPLACE INTO counters (guild_id, channel_id, counter_type, name, format) VALUES (?, ?, ?, ?, ?)'
    ).run(guildId, channelId, counterType, name, formatStr);
  }

  deleteCounter(guildId, channelId) {
    this.db.prepare('DELETE FROM counters WHERE guild_id = ? AND channel_id = ?').run(guildId, channelId);
  }

  getFakePermissionRoles(guildId, flag) {
    return this.db.prepare(
      'SELECT role_id FROM fake_permissions WHERE guild_id = ? AND permission_flag = ?'
    ).all(guildId, flag).map((r) => r.role_id);
  }

  getAllFakePermissions(guildId) {
    return this.db.prepare(
      'SELECT * FROM fake_permissions WHERE guild_id = ? ORDER BY permission_flag ASC'
    ).all(guildId);
  }

  grantFakePermission(guildId, flag, roleId) {
    this.db.prepare(
      'INSERT OR IGNORE INTO fake_permissions (guild_id, permission_flag, role_id) VALUES (?, ?, ?)'
    ).run(guildId, flag, roleId);
  }

  revokeFakePermission(guildId, flag, roleId) {
    this.db.prepare(
      'DELETE FROM fake_permissions WHERE guild_id = ? AND permission_flag = ? AND role_id = ?'
    ).run(guildId, flag, roleId);
  }

  revokeAllFakePermissions(guildId, flag) {
    this.db.prepare(
      'DELETE FROM fake_permissions WHERE guild_id = ? AND permission_flag = ?'
    ).run(guildId, flag);
  }

  // ── Permission Node System (3-layer) ──

  // Permission Nodes (metadata)
  registerPermissionNode(node, module, label, description, groupName = null) {
    this.db.prepare(
      `INSERT OR REPLACE INTO permission_nodes (node, module, label, description, group_name)
       VALUES (?, ?, ?, ?, ?)`
    ).run(node, module, label, description, groupName);
  }

  getPermissionNode(node) {
    return this.db.prepare('SELECT * FROM permission_nodes WHERE node = ?').get(node);
  }

  getAllPermissionNodes() {
    return this.db.prepare('SELECT * FROM permission_nodes ORDER BY module, group_name, label').all();
  }

  getPermissionNodesByModule(module) {
    return this.db.prepare('SELECT * FROM permission_nodes WHERE module = ? ORDER BY group_name, label').all(module);
  }

  // Role Permissions
  grantRolePermission(guildId, roleId, node, mode = 'allow', grantedBy = null) {
    this.db.prepare(
      `INSERT OR REPLACE INTO role_permissions (role_id, guild_id, node, mode, granted_by, granted_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).run(roleId, guildId, node, mode, grantedBy);
  }

  revokeRolePermission(guildId, roleId, node) {
    this.db.prepare(
      'DELETE FROM role_permissions WHERE guild_id = ? AND role_id = ? AND node = ?'
    ).run(guildId, roleId, node);
  }

  getRolePermissions(guildId, roleId) {
    return this.db.prepare(
      'SELECT * FROM role_permissions WHERE guild_id = ? AND role_id = ?'
    ).all(guildId, roleId);
  }

  getAllRolePermissions(guildId) {
    return this.db.prepare(
      'SELECT * FROM role_permissions WHERE guild_id = ? ORDER BY node ASC'
    ).all(guildId);
  }

  getRolesWithPermission(guildId, node) {
    return this.db.prepare(
      'SELECT role_id, mode FROM role_permissions WHERE guild_id = ? AND node = ?'
    ).all(guildId, node);
  }

  // User Permissions
  grantUserPermission(guildId, userId, node, mode = 'allow') {
    this.db.prepare(
      `INSERT OR REPLACE INTO user_permissions (user_id, guild_id, node, mode)
       VALUES (?, ?, ?, ?)`
    ).run(userId, guildId, node, mode);
  }

  revokeUserPermission(guildId, userId, node) {
    this.db.prepare(
      'DELETE FROM user_permissions WHERE guild_id = ? AND user_id = ? AND node = ?'
    ).run(guildId, userId, node);
  }

  getUserPermissions(guildId, userId) {
    return this.db.prepare(
      'SELECT * FROM user_permissions WHERE guild_id = ? AND user_id = ?'
    ).all(guildId, userId);
  }

  // Channel Overrides
  setChannelOverride(guildId, channelId, node, mode = 'deny') {
    this.db.prepare(
      `INSERT OR REPLACE INTO channel_overrides (guild_id, channel_id, node, mode)
       VALUES (?, ?, ?, ?)`
    ).run(guildId, channelId, node, mode);
  }

  removeChannelOverride(guildId, channelId, node, mode = 'deny') {
    this.db.prepare(
      'DELETE FROM channel_overrides WHERE guild_id = ? AND channel_id = ? AND coalesce(node, \'\') = coalesce(?, \'\') AND mode = ?'
    ).run(guildId, channelId, node, mode);
  }

  getChannelOverrides(guildId, channelId) {
    return this.db.prepare(
      'SELECT * FROM channel_overrides WHERE guild_id = ? AND channel_id = ?'
    ).all(guildId, channelId);
  }

  // Permission Resolution (Layer 1 + 2 + 3)
  resolveUserPermission(guildId, userId, memberRoles, node) {
    // Layer 1: User explicit deny
    const userPerm = this.db.prepare(
      'SELECT mode FROM user_permissions WHERE guild_id = ? AND user_id = ? AND node = ?'
    ).get(guildId, userId, node);
    if (userPerm?.mode === 'deny') return false;

    // Layer 2: User explicit allow
    if (userPerm?.mode === 'allow') return true;

    // Layer 3: Role allows (highest role wins based on position)
    const roleIds = memberRoles || [];
    for (const roleId of roleIds) {
      const rolePerm = this.db.prepare(
        'SELECT mode FROM role_permissions WHERE guild_id = ? AND role_id = ? AND node = ?'
      ).get(guildId, roleId, node);
      if (rolePerm?.mode === 'allow') return true;
    }

    // Layer 4: Role denies
    for (const roleId of roleIds) {
      const rolePerm = this.db.prepare(
        'SELECT mode FROM role_permissions WHERE guild_id = ? AND role_id = ? AND node = ?'
      ).get(guildId, roleId, node);
      if (rolePerm?.mode === 'deny') return false;
    }

    // Layer 5: Administrator node
    const adminPerm = this.db.prepare(
      'SELECT mode FROM role_permissions WHERE guild_id = ? AND role_id IN (' + roleIds.map(() => '?').join(',') + ') AND node = ?'
    ).get(guildId, ...roleIds, 'administrator');
    // Also check user admin
    const userAdmin = this.db.prepare('SELECT mode FROM user_permissions WHERE guild_id = ? AND user_id = ? AND node = ?').get(guildId, userId, 'administrator');
    if (adminPerm?.mode === 'allow' || userAdmin?.mode === 'allow') return true;

    return false;
  }

  // Audit Log
  logAudit(guildId, actorId, action, targetType = null, targetId = null, details = null) {
    this.db.prepare(
      'INSERT INTO audit_log (guild_id, actor_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(guildId, actorId, action, targetType, targetId, details);
  }

  getAuditLog(guildId, limit = 50) {
    return this.db.prepare(
      'SELECT * FROM audit_log WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(guildId, limit);
  }

  getModlogChannel(guildId) {
    return this.getSetting(`modlog_channel:${guildId}`, null);
  }

  setModlogChannel(guildId, channelId) {
    this.setSetting(`modlog_channel:${guildId}`, channelId);
  }

  createModCase(guildId, userId, moderatorId, action, reason = null, options = {}) {
    const { duration = null, channelId = null, messageCount = null } = options;
    const result = this.db.prepare(
      `INSERT INTO mod_cases (guild_id, user_id, moderator_id, action, reason, duration, channel_id, message_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(guildId, userId, moderatorId, action, reason, duration, channelId, messageCount);
    return result.lastInsertRowid;
  }

  getModCases(guildId, userId = null, action = null, limit = 50) {
    let sql = 'SELECT * FROM mod_cases WHERE guild_id = ?';
    const params = [guildId];
    if (userId) { sql += ' AND user_id = ?'; params.push(userId); }
    if (action) { sql += ' AND action = ?'; params.push(action); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    return this.db.prepare(sql).all(...params);
  }

  getModCase(id) {
    return this.db.prepare('SELECT * FROM mod_cases WHERE id = ?').get(id);
  }

  searchModCases(guildId, query) {
    const byId = this.db.prepare('SELECT * FROM mod_cases WHERE guild_id = ? AND id = ?').get(guildId, query);
    if (byId) return byId;
    const byUserId = this.db.prepare('SELECT * FROM mod_cases WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1').get(guildId, query);
    if (byUserId) return byUserId;
    return null;
  }

  addCaseEvidence(caseId, guildId, url, filename, uploadedBy) {
    this.db.prepare(
      'INSERT INTO case_evidence (case_id, guild_id, url, filename, uploaded_by) VALUES (?, ?, ?, ?, ?)'
    ).run(caseId, guildId, url, filename, uploadedBy);
  }

  getCaseEvidence(caseId) {
    return this.db.prepare('SELECT * FROM case_evidence WHERE case_id = ? ORDER BY created_at ASC').all(caseId);
  }

  getDocumentsChannel(guildId) {
    return this.getSetting(`documents_channel:${guildId}`, null);
  }

  setDocumentsChannel(guildId, channelId) {
    this.setSetting(`documents_channel:${guildId}`, channelId);
  }

  getModuleToggle(guildId, moduleName) {
    const row = this.db.prepare('SELECT enabled FROM module_toggles WHERE guild_id = ? AND module_name = ?').get(guildId, moduleName);
    return row ? !!row.enabled : true;
  }

  setModuleToggle(guildId, moduleName, enabled) {
    this.db.prepare(
      'INSERT OR REPLACE INTO module_toggles (guild_id, module_name, enabled) VALUES (?, ?, ?)'
    ).run(guildId, moduleName, enabled ? 1 : 0);
  }

  getAllModuleToggles(guildId) {
    const rows = this.db.prepare('SELECT * FROM module_toggles WHERE guild_id = ?').all(guildId);
    const result = {};
    for (const row of rows) result[row.module_name] = !!row.enabled;
    return result;
  }

  getTicketByChannel(channelId) {
    return this.db.prepare('SELECT * FROM tickets WHERE channel_id = ? AND status = \'open\'').get(channelId) || null;
  }

  getUserWarnings(guildId, userId) {
    return this.db.prepare(
      "SELECT * FROM mod_cases WHERE guild_id = ? AND user_id = ? AND action = 'warn' ORDER BY created_at DESC"
    ).all(guildId, userId);
  }

  getSetting(key, defaultValue = null) {
    if (this.cache.settings.has(key)) {
      return this.cache.settings.get(key);
    }
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (row) {
      this.cache.settings.set(key, row.value);
      return row.value;
    }
    return defaultValue;
  }

  setSetting(key, value) {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    this.cache.settings.set(key, value);
  }

  getGuildSetting(guildId, key, defaultValue = null) {
    const row = this.db.prepare('SELECT value FROM guild_settings WHERE guild_id = ? AND key = ?').get(guildId, key);
    return row ? row.value : defaultValue;
  }

  setGuildSetting(guildId, key, value) {
    this.db.prepare('INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)').run(guildId, key, value);
  }

  getAllGuildSettings(guildId) {
    const rows = this.db.prepare('SELECT key, value FROM guild_settings WHERE guild_id = ?').all(guildId);
    const result = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  }

  query(sql, ...params) {
    return this.db.prepare(sql).all(...params);
  }

  queryOne(sql, ...params) {
    return this.db.prepare(sql).get(...params);
  }

  run(sql, ...params) {
    return this.db.prepare(sql).run(...params);
  }

  transaction(fn) {
    const tx = this.db.transaction(fn);
    return tx();
  }

  loadAllState() {
    const state = {
      ticketsByUserId: {},
      pendingByUserId: {},
      strikesByUserId: {},
      pbanProposalsByMessageId: {},
      banProfilesByGuildUser: {}
    };

    const tickets = this.db.prepare('SELECT * FROM tickets WHERE status = ?').all('open');
    for (const t of tickets) {
      state.ticketsByUserId[t.user_id] = {
        channelId: t.channel_id,
        guildId: null,
        departmentId: t.department_id,
        userTag: null,
        userName: null,
        openedAt: new Date(t.created_at).getTime(),
        priority: t.priority,
        claimedByStaffUserId: t.claimed_by,
        history: []
      };
    }

    const strikes = this.db.prepare('SELECT * FROM strikes ORDER BY timestamp ASC').all();
    for (const s of strikes) {
      state.strikesByUserId[s.user_id] ||= [];
      state.strikesByUserId[s.user_id].push({ reason: s.reason, staffId: s.staff_id, timestamp: s.timestamp });
    }

    const proposals = this.db.prepare('SELECT * FROM pban_proposals').all();
    for (const p of proposals) {
      const votes = this.db.prepare('SELECT * FROM pban_votes WHERE proposal_id = ?').all(p.id);
      const voteMap = {};
      const abstainMap = {};
      for (const v of votes) {
        const entry = { userId: v.voter_id, rank: v.vote, votedAt: new Date(v.created_at || Date.now()).getTime() };
        if (v.vote === 'abstain') abstainMap[v.voter_id] = entry;
        else voteMap[v.voter_id] = entry;
      }
      state.pbanProposalsByMessageId[p.message_id || String(p.id)] = {
        guildId: null,
        channelId: null,
        messageId: p.message_id,
        targetUserId: p.target_user_id,
        targetUserTag: null,
        executorUserId: p.proposer_id,
        reason: p.reason,
        status: p.status,
        proofUrls: [],
        votes: voteMap,
        abstains: abstainMap,
        createdAt: new Date(p.created_at).getTime(),
        expiresAt: new Date(p.expires_at).getTime()
      };
    }

    const profiles = this.db.prepare('SELECT * FROM ban_profiles').all();
    for (const p of profiles) {
      const key = `${p.guild_id}:${p.user_id}`;
      state.banProfilesByGuildUser[key] = {
        guildId: p.guild_id,
        userId: p.user_id,
        userTag: null,
        proofUrls: JSON.parse(p.proof_urls || '[]'),
        updatedAt: p.last_synced_at ? new Date(p.last_synced_at).getTime() : null
      };
    }

    return state;
  }

  saveAllState(state) {
    if (!state) return;

    const insertTicket = this.db.prepare(
      'INSERT OR REPLACE INTO tickets (user_id, channel_id, department_id, status, priority, claimed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM tickets WHERE status = ?').run('open');
      for (const [userId, ticket] of Object.entries(state.ticketsByUserId || {})) {
        insertTicket.run(
          userId, ticket.channelId || null, ticket.departmentId || 'assistants',
          'open', ticket.priority || 'normal', ticket.claimedByStaffUserId || null,
          ticket.createdAt ? new Date(ticket.createdAt).toISOString() : new Date().toISOString()
        );
      }
    });
    try { tx(); } catch (e) { logger.error(e, 'Failed to save ticket state'); }
  }

  loadBreaksState() {
    const breakState = { requestsByUserId: {}, activeByUserId: {} };
    const rows = this.db.prepare("SELECT * FROM staff_breaks WHERE status = 'active'").all();
    for (const b of rows) {
      breakState.activeByUserId[b.user_id] = {
        guildId: b.guild_id,
        reason: b.reason,
        startedAt: new Date(b.started_at).getTime(),
        endsAt: b.ends_at ? new Date(b.ends_at).getTime() : null,
        removedRoleIds: JSON.parse(b.removed_role_ids || '[]'),
        messageCount: b.message_count || 0,
        approvedByUserId: b.approved_by,
        durationMs: b.ends_at ? new Date(b.ends_at).getTime() - new Date(b.started_at).getTime() : null
      };
    }

    const reqRows = this.db.prepare('SELECT * FROM break_requests').all();
    for (const r of reqRows) {
      breakState.requestsByUserId[r.user_id] = {
        userId: r.user_id,
        guildId: r.guild_id,
        channelId: r.channel_id,
        messageId: r.message_id,
        durationText: r.duration_text,
        durationMs: r.duration_ms || null,
        reason: r.reason,
        createdAt: new Date(r.created_at).getTime()
      };
    }
    return breakState;
  }

  saveBreaksState(breakState) {
    if (!breakState) return;
    const upsertBreak = this.db.prepare(`
      INSERT INTO staff_breaks (user_id, guild_id, status, reason, started_at, ends_at, removed_role_ids, message_count, approved_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const endBreak = this.db.prepare('UPDATE staff_breaks SET status = ?, ended_at = ? WHERE user_id = ? AND status = ?');
    const upsertRequest = this.db.prepare(`
      INSERT OR REPLACE INTO break_requests (user_id, guild_id, channel_id, message_id, duration_text, duration_ms, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const deleteRequest = this.db.prepare('DELETE FROM break_requests WHERE user_id = ?');
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM break_requests').run();
      this.db.prepare('UPDATE staff_breaks SET status = ?, ended_at = ? WHERE status = ? AND user_id NOT IN (?)').run('ended', new Date().toISOString(), 'active', '');
      for (const [userId, br] of Object.entries(breakState.activeByUserId || {})) {
        const existing = this.db.prepare('SELECT id FROM staff_breaks WHERE user_id = ? AND status = ?').get(userId, 'active');
        if (existing) {
          this.db.prepare(`
            UPDATE staff_breaks SET guild_id = ?, reason = ?, started_at = ?, ends_at = ?, removed_role_ids = ?, message_count = ?, approved_by = ?
            WHERE user_id = ? AND status = ?
          `).run(
            br.guildId, br.reason, new Date(br.startedAt).toISOString(),
            br.endsAt ? new Date(br.endsAt).toISOString() : null,
            JSON.stringify(br.removedRoleIds || []), br.messageCount || 0, br.approvedByUserId || null,
            userId, 'active'
          );
        } else {
          upsertBreak.run(
            userId, br.guildId, 'active', br.reason,
            new Date(br.startedAt).toISOString(),
            br.endsAt ? new Date(br.endsAt).toISOString() : null,
            JSON.stringify(br.removedRoleIds || []), br.messageCount || 0, br.approvedByUserId || null
          );
        }
      }
      for (const [userId, req] of Object.entries(breakState.requestsByUserId || {})) {
        upsertRequest.run(
          userId, req.guildId, req.channelId, req.messageId,
          req.durationText, req.durationMs, req.reason,
          new Date(req.createdAt).toISOString()
        );
      }
    });
    try { tx(); } catch (e) { logger.error(e, 'Failed to save break state'); }
  }

  loadPerformancePlansState() {
    const state = { plansByUserId: {} };
    const rows = this.db.prepare('SELECT * FROM performance_plans').all();
    for (const p of rows) {
      state.plansByUserId[p.user_id] = {
        userId: p.user_id,
        userTag: p.user_tag,
        guildId: p.guild_id,
        wingId: p.wing || null,
        status: p.status,
        startedByUserId: p.started_by_user_id || p.staff_id,
        startedByTag: p.started_by_tag,
        startedAt: new Date(p.created_at).getTime(),
        dueAt: new Date(p.due_date).getTime(),
        completedByUserId: p.completed_by_user_id,
        completedByTag: p.completed_by_tag,
        completedAt: p.completed_at ? new Date(p.completed_at).getTime() : null,
        resultNote: p.result_note,
        reason: p.reason,
        goals: p.goals,
        notes: JSON.parse(p.notes || '[]')
      };
    }
    return state;
  }

  savePerformancePlansState(plansState) {
    if (!plansState?.plansByUserId) return;
    const tx = this.db.transaction(() => {
      for (const plan of Object.values(plansState.plansByUserId)) {
        const existing = this.db.prepare('SELECT id FROM performance_plans WHERE user_id = ?').get(plan.userId);
        if (existing) {
          this.db.prepare(`
            UPDATE performance_plans SET
              guild_id = ?, wing = ?, user_tag = ?, status = ?,
              started_by_user_id = ?, started_by_tag = ?,
              completed_by_user_id = ?, completed_by_tag = ?,
              completed_at = ?, result_note = ?,
              reason = ?, goals = ?, due_date = ?, notes = ?
            WHERE user_id = ?
          `).run(
            plan.guildId, plan.wingId, plan.userTag, plan.status,
            plan.startedByUserId, plan.startedByTag,
            plan.completedByUserId || null, plan.completedByTag || null,
            plan.completedAt ? new Date(plan.completedAt).toISOString() : null, plan.resultNote || null,
            plan.reason, plan.goals,
            new Date(plan.dueAt).toISOString(),
            JSON.stringify(plan.notes || []),
            plan.userId
          );
        } else {
          this.db.prepare(`
            INSERT INTO performance_plans (user_id, staff_id, guild_id, wing, user_tag, status,
              started_by_user_id, started_by_tag, reason, goals, due_date, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            plan.userId, plan.startedByUserId, plan.guildId, plan.wingId, plan.userTag, plan.status,
            plan.startedByUserId, plan.startedByTag,
            plan.reason, plan.goals,
            new Date(plan.dueAt).toISOString(),
            JSON.stringify(plan.notes || [])
          );
        }
      }
    });
    tx();
  }

  loadReviewerState() {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'reviewer_state'").get();
    if (row) {
      try { return JSON.parse(row.value); } catch { return null; }
    }
    return null;
  }

  saveReviewerState(reviewerState) {
    if (!reviewerState) return;
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('reviewer_state', JSON.stringify(reviewerState));
  }

  loadTimedCloseState() {
    const state = { ticketsByUserId: {} };
    const rows = this.db.prepare('SELECT * FROM timed_closes').all();
    for (const t of rows) {
      state.ticketsByUserId[t.user_id] = {
        closeAt: new Date(t.close_at).getTime(),
        warnedUser: Boolean(t.warned_user)
      };
    }
    return state;
  }

  saveTimedCloseState(tcState) {
    if (!tcState?.ticketsByUserId) return;
    const upsert = this.db.prepare('INSERT OR REPLACE INTO timed_closes (user_id, close_at, warned_user) VALUES (?, ?, ?)');
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM timed_closes').run();
      for (const [userId, tc] of Object.entries(tcState.ticketsByUserId)) {
        if (userId === 'undefined' || userId === 'null') continue;
        upsert.run(userId, new Date(tc.closeAt).toISOString(), tc.warnedUser ? 1 : 0);
      }
    });
    try { tx(); } catch (e) { logger.error(e, 'Failed to save timed close state'); }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      logger.info('State manager closed');
    }
  }
}

const stateManager = new StateManager();

export { StateManager, stateManager };
export default stateManager;
