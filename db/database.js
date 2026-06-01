import initSqlJs from 'sql.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = join(DATA_DIR, 'mindgraph.db');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

let db = null;
let SQL = null;

// ========== Helper: convert exec result to array of objects ==========
function rowsToObjects(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function firstRow(result) {
  const rows = rowsToObjects(result);
  return rows.length > 0 ? rows[0] : null;
}

// ========== Helper: run SQL with params ==========
function run(sql, params = []) {
  db.run(sql, params);
}

function exec(sql, params = []) {
  // sql.js doesn't support params in exec directly, need to use prepare
  if (params.length > 0) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }
  return rowsToObjects(db.exec(sql));
}

function get(sql, params = []) {
  const rows = exec(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// ========== Helper: generate ID ==========
function genId() {
  try { return crypto.randomUUID(); } catch {
    return Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 10) + '_' + Math.random().toString(36).substr(2, 8);
  }
}

// ========== Save database to disk ==========
function saveToDisk() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(DB_PATH, buffer);
  } catch (e) {
    console.error('Failed to save database:', e.message);
  }
}

// Auto-save periodically
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToDisk, 500);
}

// ========== Init ==========
export async function initDatabase() {
  SQL = await initSqlJs();

  // Load existing database or create new
  if (existsSync(DB_PATH)) {
    try {
      const buffer = readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } catch (e) {
      console.error('Failed to load database, creating new:', e.message);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Enable WAL-like behavior
  run('PRAGMA journal_mode=WAL');
  run('PRAGMA foreign_keys=ON');

  // Create schema
  run(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content TEXT NOT NULL DEFAULT '',
      is_daily INTEGER NOT NULL DEFAULT 0,
      daily_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (note_id, tag_id),
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      source_note_id TEXT NOT NULL,
      target_note_id TEXT NOT NULL,
      context TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(source_note_id, target_note_id),
      FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (target_note_id) REFERENCES notes(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  run('CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC)');
  run('CREATE INDEX IF NOT EXISTS idx_notes_daily ON notes(daily_date)');
  run('CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_note_id)');
  run('CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_note_id)');
  run('CREATE INDEX IF NOT EXISTS idx_note_tags_note ON note_tags(note_id)');
  run('CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id)');

  saveToDisk();
}

// ========== Note Operations ==========

export function createNote({ id, title = 'Untitled', content = '', isDaily = false, dailyDate = null }) {
  // If a stub note (empty content) with the same title exists, update it instead
  const existing = get('SELECT * FROM notes WHERE title = ? COLLATE NOCASE AND (content IS NULL OR content = \'\') LIMIT 1', [title]);
  if (existing && !isDaily) {
    return updateNote(existing.id, { title, content });
  }

  const noteId = id || genId();
  run(
    `INSERT INTO notes (id, title, content, is_daily, daily_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))`,
    [noteId, title, content, isDaily ? 1 : 0, dailyDate]
  );

  if (content) {
    syncLinks(noteId, content);
    syncTags(noteId, content);
  }

  scheduleSave();
  return getNote(noteId);
}

export function getNote(id) {
  const note = get('SELECT * FROM notes WHERE id = ?', [id]);
  if (!note) return null;

  const tags = exec(`
    SELECT t.* FROM tags t
    JOIN note_tags nt ON t.id = nt.tag_id
    WHERE nt.note_id = ?
  `, [id]);

  const outgoingLinks = exec(`
    SELECT n.id, n.title FROM notes n
    JOIN links l ON n.id = l.target_note_id
    WHERE l.source_note_id = ?
  `, [id]);

  const backlinks = exec(`
    SELECT n.id, n.title FROM notes n
    JOIN links l ON n.id = l.source_note_id
    WHERE l.target_note_id = ?
  `, [id]);

  return { ...note, tags, outgoingLinks, backlinks };
}

export function updateNote(id, { title, content }) {
  const fields = [];
  const params = [];

  if (title !== undefined) {
    fields.push('title = ?');
    params.push(title);
  }
  if (content !== undefined) {
    fields.push('content = ?');
    params.push(content);
  }

  if (fields.length > 0) {
    fields.push("updated_at = datetime('now', 'localtime')");
    params.push(id);
    run(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`, params);

    if (content !== undefined) {
      syncLinks(id, content);
      syncTags(id, content);
    }
  }

  scheduleSave();
  return getNote(id);
}

export function deleteNote(id) {
  run('DELETE FROM notes WHERE id = ?', [id]);
  scheduleSave();
}

export function getAllNotes() {
  return exec(`
    SELECT n.*,
      (SELECT COUNT(*) FROM links WHERE source_note_id = n.id) as outgoing_count,
      (SELECT COUNT(*) FROM links WHERE target_note_id = n.id) as backlink_count
    FROM notes n
    ORDER BY n.updated_at DESC
  `);
}

export function findNoteByTitle(title) {
  return get('SELECT * FROM notes WHERE title = ? COLLATE NOCASE', [title]);
}

export function getDailyNote(dateStr) {
  return get('SELECT * FROM notes WHERE is_daily = 1 AND daily_date = ?', [dateStr]);
}

export function getOrCreateDailyNote(dateStr) {
  let note = getDailyNote(dateStr);
  if (!note) {
    note = createNote({
      id: genId(),
      title: `📅 Daily Note - ${dateStr}`,
      content: `# Daily Note - ${dateStr}\n\n## Thoughts\n\n## Tasks\n\n## Notes\n`,
      isDaily: true,
      dailyDate: dateStr
    });
  } else {
    note = getNote(note.id); // Full note with links/tags
  }
  return note;
}

// ========== Link Operations ==========

export function syncLinks(noteId, content) {
  run('DELETE FROM links WHERE source_note_id = ?', [noteId]);

  let cleanContent = content.replace(/```[\s\S]*?```/g, '');
  cleanContent = cleanContent.replace(/`[^`]+`/g, '');

  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  const linkedTitles = new Set();
  let match;
  while ((match = wikiLinkRegex.exec(cleanContent)) !== null) {
    const title = match[1].trim();
    if (title.length > 0) linkedTitles.add(title);
  }

  for (const title of linkedTitles) {
    let targetNote = get('SELECT id FROM notes WHERE title = ? COLLATE NOCASE', [title]);
    if (!targetNote) {
      const targetId = genId();
      run(
        'INSERT INTO notes (id, title, content, created_at, updated_at) VALUES (?, ?, ?, datetime(\'now\', \'localtime\'), datetime(\'now\', \'localtime\'))',
        [targetId, title, '']
      );
      targetNote = { id: targetId };
    }

    try {
      run('INSERT INTO links (id, source_note_id, target_note_id) VALUES (?, ?, ?)',
        [genId(), noteId, targetNote.id]);
    } catch (e) { /* link already exists */ }
  }
}

// ========== Tag Operations ==========

export function syncTags(noteId, content) {
  run('DELETE FROM note_tags WHERE note_id = ?', [noteId]);

  let cleanContent = content.replace(/```[\s\S]*?```/g, '');
  cleanContent = cleanContent.replace(/`[^`]+`/g, '');

  const tagRegex = /(?:^|\s)#([\w一-鿿가-힯-]+)/g;
  const tagNames = new Set();
  let match;
  while ((match = tagRegex.exec(cleanContent)) !== null) {
    tagNames.add(match[1].toLowerCase());
  }

  for (const tagName of tagNames) {
    let tag = get('SELECT id FROM tags WHERE name = ?', [tagName]);
    if (!tag) {
      const tagId = genId();
      run('INSERT INTO tags (id, name) VALUES (?, ?)', [tagId, tagName]);
      tag = { id: tagId };
    }
    try {
      run('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)', [noteId, tag.id]);
    } catch (e) { /* already exists */ }
  }
}

export function getAllTags() {
  return exec(`
    SELECT t.*, COUNT(nt.note_id) as note_count
    FROM tags t
    LEFT JOIN note_tags nt ON t.id = nt.tag_id
    GROUP BY t.id
    ORDER BY note_count DESC
  `);
}

export function getNotesByTag(tagName) {
  return exec(`
    SELECT n.* FROM notes n
    JOIN note_tags nt ON n.id = nt.note_id
    JOIN tags t ON nt.tag_id = t.id
    WHERE t.name = ?
    ORDER BY n.updated_at DESC
  `, [tagName]);
}

// ========== Graph Operations ==========

export function getGraphData() {
  const nodes = exec(`
    SELECT id, title,
      (SELECT COUNT(*) FROM links WHERE source_note_id = n.id OR target_note_id = n.id) as connection_count
    FROM notes n
    ORDER BY connection_count DESC
  `);

  const edges = exec(`
    SELECT l.source_note_id, l.target_note_id, ns.title as source_title, nt.title as target_title
    FROM links l
    JOIN notes ns ON l.source_note_id = ns.id
    JOIN notes nt ON l.target_note_id = nt.id
  `);

  return { nodes, edges };
}

// ========== Search Operations ==========

export function searchNotes(query, limit = 50) {
  if (!query || query.trim().length === 0) return [];

  const words = query.trim().split(/\s+/);
  const conditions = [];
  const params = [];

  // Build LIKE conditions for each word
  for (const word of words) {
    const like = `%${word}%`;
    conditions.push('(title LIKE ? OR content LIKE ?)');
    params.push(like, like);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM notes ${where} ORDER BY updated_at DESC LIMIT ?`;
  params.push(limit);

  return exec(sql, params);
}

export function getNoteStats() {
  const totalNotes = get('SELECT COUNT(*) as count FROM notes')?.count || 0;
  const totalLinks = get('SELECT COUNT(*) as count FROM links')?.count || 0;
  const totalTags = get('SELECT COUNT(*) as count FROM tags')?.count || 0;
  const totalWords = get(`
    SELECT SUM(LENGTH(content) - LENGTH(REPLACE(content, ' ', '')) + 1) as count FROM notes
  `)?.count || 0;

  return { totalNotes, totalLinks, totalTags, totalWords };
}

// ========== Export ==========

export function exportNote(id) {
  const note = getNote(id);
  if (!note) return null;

  let markdown = `---\ntitle: "${note.title}"\ndate: ${note.created_at}\n`;
  if (note.tags.length > 0) {
    markdown += `tags: [${note.tags.map(t => t.name).join(', ')}]\n`;
  }
  markdown += `---\n\n${note.content}`;

  return { filename: `${note.title.replace(/[^a-zA-Z0-9一-鿿]/g, '_')}.md`, content: markdown };
}

// ========== Cleanup ==========

export function closeDatabase() {
  if (saveTimer) clearTimeout(saveTimer);
  saveToDisk();
  if (db) db.close();
  db = null;
}
