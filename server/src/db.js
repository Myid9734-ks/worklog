const mariadb = require('mariadb');
const fs = require('fs');

// Load .env if present (safe to ignore if the file doesn't exist)
try {
  if (fs.existsSync(require('path').join(process.cwd(), '.env'))) {
    require('dotenv').config();
  }
} catch (_) {}

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'work_log',
} = process.env;

const pool = mariadb.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  connectionLimit: 10,
  dateStrings: true,
  bigIntAsNumber: true,
});

async function getConnection() {
  return pool.getConnection();
}

async function query(sql, params = []) {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(sql, params);
    return coerceBigInt(rows);
  } finally {
    if (conn) conn.release();
  }
}

function coerceBigInt(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(coerceBigInt);
  if (value && typeof value === 'object') {
    const next = {};
    for (const k of Object.keys(value)) next[k] = coerceBigInt(value[k]);
    return next;
  }
  return value;
}

async function ensureSchema() {
  await query(
    `CREATE TABLE IF NOT EXISTS tasks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      note TEXT NULL,
      status ENUM('todo','doing','done') NOT NULL DEFAULT 'todo',
      task_date DATE NOT NULL,
      start_time TIME NULL,
      end_time TIME NULL,
      completed_date DATE NULL,
      image_path VARCHAR(255) NULL,
      images_json TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_task_date (task_date),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );

  // Best-effort ensure column exists for existing installations
  try {
    const col1 = await query(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'image_path'`,
      [DB_NAME]
    );
    if ((col1[0]?.cnt || 0) === 0) {
      await query(`ALTER TABLE tasks ADD COLUMN image_path VARCHAR(255) NULL`);
    }
  } catch (_) {}
  try {
    const col2 = await query(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'images_json'`,
      [DB_NAME]
    );
    if ((col2[0]?.cnt || 0) === 0) {
      await query(`ALTER TABLE tasks ADD COLUMN images_json TEXT NULL`);
    }
  } catch (_) {}
  try {
    const col3 = await query(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'completed_date'`,
      [DB_NAME]
    );
    if ((col3[0]?.cnt || 0) === 0) {
      await query(`ALTER TABLE tasks ADD COLUMN completed_date DATE NULL`);
    }
  } catch (_) {}
}

module.exports = {
  pool,
  getConnection,
  query,
  ensureSchema,
};


