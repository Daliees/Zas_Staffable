/**
 * SQLite conversation store
 *
 * Tables
 * ──────
 * conversations  – one row per message (user or assistant)
 *
 * Schema
 * ──────
 * id           INTEGER  primary key (auto)
 * phone        TEXT     WhatsApp sender number, e.g. +31612345678
 * role         TEXT     'user' | 'assistant'
 * message      TEXT     the raw message text
 * action       TEXT     agent action returned (answer_faq / create_salesforce_task / no_action / null)
 * created_at   TEXT     ISO-8601 timestamp (UTC)
 */

const Database = require("better-sqlite3");
const path = require("node:path");
const fs = require("node:fs");

// Store the DB file next to /data so it is easy to find but not committed
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "conversations.db");

// Make sure the directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Ensure WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

// ── Schema migration ──────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    phone      TEXT    NOT NULL,
    role       TEXT    NOT NULL CHECK(role IN ('user', 'assistant')),
    message    TEXT    NOT NULL,
    action     TEXT,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_phone
    ON conversations (phone, created_at);
`);

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtInsert = db.prepare(`
  INSERT INTO conversations (phone, role, message, action)
  VALUES (@phone, @role, @message, @action)
`);

const stmtHistory = db.prepare(`
  SELECT role, message, action, created_at
  FROM conversations
  WHERE phone = ?
  ORDER BY created_at DESC
  LIMIT ?
`);

const stmtClear = db.prepare(`
  DELETE FROM conversations WHERE phone = ?
`);

const stmtStats = db.prepare(`
  SELECT
    COUNT(*)                                      AS total_messages,
    COUNT(DISTINCT phone)                         AS unique_users,
    SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS user_messages,
    MAX(created_at)                               AS last_activity
  FROM conversations
`);

// Returns one row per unique phone with message count and last activity
const stmtUsers = db.prepare(`
  SELECT
    phone,
    COUNT(*)     AS message_count,
    MAX(created_at) AS last_at
  FROM conversations
  GROUP BY phone
  ORDER BY last_at DESC
`);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save a single message to the conversation log.
 * @param {object} opts
 * @param {string} opts.phone   - sender phone number
 * @param {'user'|'assistant'} opts.role
 * @param {string} opts.message - message text
 * @param {string} [opts.action] - agent action (for assistant messages)
 * @returns {number} inserted row id
 */
function saveMessage({ phone, role, message, action = null }) {
  const info = stmtInsert.run({ phone, role, message, action });
  return info.lastInsertRowid;
}

/**
 * Return the last N messages for a phone number, oldest-first,
 * formatted as { role, content } objects ready for the LLM.
 * @param {string} phone
 * @param {number} [limit=10]  - how many messages to return (each user+assistant pair = 2)
 * @returns {{ role: string, content: string }[]}
 */
function getHistory(phone, limit = 10) {
  // Fetch descending then reverse so we get chronological order
  const rows = stmtHistory.all(phone, limit).reverse();
  return rows.map((row) => ({
    role: row.role,
    content: row.message
  }));
}

/**
 * Delete all messages for a phone number (e.g. on /reset).
 * @param {string} phone
 */
function clearHistory(phone) {
  stmtClear.run(phone);
}

/**
 * Return aggregate stats across all conversations.
 */
function getStats() {
  return stmtStats.get();
}

/**
 * Return one row per unique phone number with message count and last activity.
 * @returns {{ phone: string, message_count: number, last_at: string }[]}
 */
function getUsers() {
  return stmtUsers.all();
}

module.exports = { db, saveMessage, getHistory, clearHistory, getStats, getUsers };
