import fs from 'fs';
import path from 'path';
import { db } from '../config/db';

type MigrationOptions = {
  alter?: boolean;
};

const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

const SCHEMA_FILE_CANDIDATES = [
  path.resolve(process.cwd(), 'src/schema.sql'),
  path.resolve(process.cwd(), 'dist/schema.sql'),
  path.resolve(__dirname, '../schema.sql'),
  path.resolve(__dirname, '../../src/schema.sql'),
];

const MIGRATIONS_DIR_CANDIDATES = [
  path.resolve(process.cwd(), 'src/migrations'),
  path.resolve(process.cwd(), 'dist/migrations'),
  path.resolve(__dirname),
  path.resolve(__dirname, '../../src/migrations'),
];

const findFirstExistingPath = (candidates: string[]) =>
  candidates.find((candidate) => fs.existsSync(candidate));

const stripCommentLines = (sql: string) =>
  sql
    .split('\n')
    .map((line) => (line.trimStart().startsWith('--') ? '' : line))
    .join('\n');

const splitSqlStatements = (sql: string) => {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let prevChar = '';

  for (const char of sql) {
    if (char === "'" && !inDoubleQuote && !inBacktick && prevChar !== '\\') {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote && !inBacktick && prevChar !== '\\') {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === '`' && !inSingleQuote && !inDoubleQuote && prevChar !== '\\') {
      inBacktick = !inBacktick;
    }

    if (char === ';' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      prevChar = char;
      continue;
    }

    current += char;
    prevChar = char;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
};

const executeSqlBlock = async (sql: string) => {
  const statements = splitSqlStatements(stripCommentLines(sql));
  for (const statement of statements) {
    await db.query(statement);
  }
};

const getMigrationUpSql = (sql: string) => {
  const downMarker = /^--\s*down\b/im;
  const parts = sql.split(downMarker);
  return parts[0];
};

const ensureMigrationsTable = async () => {
  await db.query(MIGRATIONS_TABLE_SQL);
};

const loadAppliedMigrations = async () => {
  const [rows] = await db.query('SELECT name FROM schema_migrations');
  return new Set((rows as Array<{ name: string }>).map((row) => row.name));
};

const applyPendingMigrationFiles = async () => {
  const migrationsDir = findFirstExistingPath(MIGRATIONS_DIR_CANDIDATES);
  if (!migrationsDir || !fs.statSync(migrationsDir).isDirectory()) return;

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  if (!files.length) return;

  await ensureMigrationsTable();
  const applied = await loadAppliedMigrations();

  for (const file of files) {
    if (applied.has(file)) continue;

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    const upSql = getMigrationUpSql(sql);

    await executeSqlBlock(upSql);
    await db.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    console.log(`Applied migration: ${file}`);
  }
};

const applyBaseSchema = async () => {
  const schemaPath = findFirstExistingPath(SCHEMA_FILE_CANDIDATES);
  if (!schemaPath) {
    throw new Error('schema.sql not found. Expected it under src/schema.sql or dist/schema.sql');
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await executeSqlBlock(schemaSql);
  console.log('Base schema migration complete');
};

export const runMigrations = async (options: MigrationOptions = {}) => {
  await applyBaseSchema();

  // `alter: true` means also apply incremental migration files (safe schema changes).
  if (options.alter) {
    await applyPendingMigrationFiles();
  }
};

