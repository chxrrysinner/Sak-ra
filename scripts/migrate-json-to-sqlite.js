import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DB_PATH = path.resolve(DATA_DIR, 'hallows.db');

const JSON_FILES = {
  'modmail-state.json': 'state',
  'app-review-state.json': 'reviewer',
  'ticket-close-timers.json': 'timed_close',
  'staff-breaks.json': 'breaks',
  'performance-plans.json': 'performance_plans'
};

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function migrate() {
  console.log(`Migrating JSON state files to SQLite at ${DB_PATH}...`);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
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
      status TEXT NOT NULL DEFAULT 'active',
      reason TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ends_at TEXT,
      ended_at TEXT
    );

    CREATE TABLE IF NOT EXISTS performance_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      wing TEXT,
      reason TEXT NOT NULL,
      goals TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS timed_closes (
      ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id),
      close_at TEXT NOT NULL,
      warned_user BOOLEAN NOT NULL DEFAULT 0
    );
  `);

  const insertTicket = db.prepare(`INSERT OR IGNORE INTO tickets (user_id, channel_id, department_id, status, priority, claimed_by, claim_authority, created_at, channel_name, custom_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertStrike = db.prepare(`INSERT INTO strikes (user_id, staff_id, reason, timestamp) VALUES (?, ?, ?, ?)`);
  const insertBreak = db.prepare(`INSERT INTO staff_breaks (user_id, status, reason, started_at, ends_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertPlan = db.prepare(`INSERT INTO performance_plans (user_id, staff_id, wing, reason, goals, due_date, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertBanProfile = db.prepare(`INSERT OR REPLACE INTO ban_profiles (user_id, guild_id, proof_urls, last_synced_at) VALUES (?, ?, ?, ?)`);
  const insertTimedClose = db.prepare(`INSERT OR IGNORE INTO timed_closes (ticket_id, close_at, warned_user) VALUES (?, ?, ?)`);

  const migrateState = db.transaction(() => {
    for (const [filename, type] of Object.entries(JSON_FILES)) {
      const filePath = path.join(DATA_DIR, filename);
      if (!fs.existsSync(filePath)) {
        console.log(`  SKIP ${filename} (not found)`);
        continue;
      }

      const data = readJson(filePath);
      if (!data) {
        console.log(`  SKIP ${filename} (empty/invalid)`);
        continue;
      }

      console.log(`  Reading ${filename}...`);

      switch (type) {
        case 'state': {
          if (data.ticketsByUserId) {
            for (const [userId, ticket] of Object.entries(data.ticketsByUserId)) {
              insertTicket.run(
                userId,
                ticket.channelId || null,
                ticket.departmentId || 'assistants',
                ticket.status || 'open',
                ticket.priority || 'normal',
                ticket.claimedByStaffUserId || null,
                ticket.claimAuthority || null,
                ticket.createdAt ? new Date(ticket.createdAt).toISOString() : new Date().toISOString(),
                ticket.channelName || null,
                ticket.customName || null
              );
            }
            console.log(`    Migrated ${Object.keys(data.ticketsByUserId).length} tickets`);
          }
          if (data.strikesByUserId) {
            for (const [userId, strikes] of Object.entries(data.strikesByUserId)) {
              for (const strike of (Array.isArray(strikes) ? strikes : [])) {
                insertStrike.run(userId, strike.staffId || 'unknown', strike.reason || '', new Date(strike.timestamp || Date.now()).toISOString());
              }
            }
          }
          if (data.banProfilesByGuildUser) {
            for (const [key, profile] of Object.entries(data.banProfilesByGuildUser)) {
              insertBanProfile.run(
                profile.userId || '',
                profile.guildId || '',
                JSON.stringify(profile.proofUrls || []),
                profile.updatedAt ? new Date(profile.updatedAt).toISOString() : null
              );
            }
          }
          break;
        }
        case 'timed_close': {
          if (data.ticketsByUserId) {
            for (const [userId, tc] of Object.entries(data.ticketsByUserId)) {
              insertTimedClose.run(tc.ticketId || 0, tc.closeAt || new Date().toISOString(), tc.warnedUser ? 1 : 0);
            }
            console.log(`    Migrated ${Object.keys(data.ticketsByUserId).length} timed closes`);
          }
          break;
        }
        case 'breaks': {
          const breakMap = data.activeByUserId || data.requestsByUserId || {};
          for (const [userId, br] of Object.entries(breakMap)) {
            insertBreak.run(
              userId,
              br.status || 'active',
              br.reason || '',
              new Date(br.startedAt || Date.now()).toISOString(),
              br.endsAt ? new Date(br.endsAt).toISOString() : null,
              br.endedAt ? new Date(br.endedAt).toISOString() : null
            );
          }
          console.log(`    Migrated ${Object.keys(breakMap).length} staff breaks`);
          break;
        }
        case 'performance_plans': {
          if (data.plansByUserId) {
            for (const [userId, plan] of Object.entries(data.plansByUserId)) {
              insertPlan.run(
                userId,
                plan.staffId || '',
                plan.wing || null,
                plan.reason || '',
                plan.goals || '',
                new Date(plan.dueDate || Date.now()).toISOString(),
                plan.status || 'active',
                plan.notes ? JSON.stringify(plan.notes) : null,
                new Date(plan.createdAt || Date.now()).toISOString()
              );
            }
            console.log(`    Migrated ${Object.keys(data.plansByUserId).length} performance plans`);
          }
          break;
        }
      }
    }
  });

  migrateState();
  db.close();
  console.log('Migration complete!');
}

migrate();
