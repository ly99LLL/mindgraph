import { Router } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import {
  createNote, getNote, updateNote, deleteNote,
  getAllNotes, getOrCreateDailyNote, getNotesByTag,
  getAllTags, getNoteStats, exportNote, findNoteByTitle
} from '../db/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, '..', 'data', 'images');

export const notesRouter = Router();

// POST /api/notes/upload-image - Upload an image (base64)
notesRouter.post('/upload-image', (req, res) => {
  try {
    const { data, filename } = req.body;
    if (!data) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    // Extract base64 data
    const matches = data.match(/^data:image\/([\w+]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid image data format' });
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const imageData = Buffer.from(matches[2], 'base64');
    let id;
    try { id = crypto.randomUUID(); } catch {
      id = Date.now().toString(36) + Math.random().toString(36).substr(2, 10);
    }
    const imageFilename = `${id}.${ext}`;
    const imagePath = join(IMAGES_DIR, imageFilename);

    if (!existsSync(IMAGES_DIR)) {
      mkdirSync(IMAGES_DIR, { recursive: true });
    }

    writeFileSync(imagePath, imageData);

    const url = `/data/images/${imageFilename}`;
    res.json({ url, filename: imageFilename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notes - Get all notes
notesRouter.get('/', (req, res) => {
  try {
    const notes = getAllNotes();
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notes/stats - Get statistics
notesRouter.get('/stats', (req, res) => {
  try {
    const stats = getNoteStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notes - Create a new note (or update stub if title matches)
notesRouter.post('/', (req, res) => {
  try {
    const { title, content } = req.body;

    // If a title is provided and a stub note with that title exists, update it
    if (title && title !== 'Untitled' && title !== 'New Note') {
      const existing = findNoteByTitle(title);
      if (existing && (!existing.content || existing.content.trim() === '')) {
        const note = updateNote(existing.id, { title, content: content || '' });
        return res.status(200).json(note);
      }
    }

    let id;
    try { id = crypto.randomUUID(); } catch {
      id = Date.now().toString(36) + Math.random().toString(36).substr(2) + '_' + Math.random().toString(36).substr(2, 8);
    }
    const note = createNote({ id, title: title || 'Untitled', content: content || '' });
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notes/tags - Get all tags
notesRouter.get('/tags', (req, res) => {
  try {
    const tags = getAllTags();
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notes/tags/:name - Get notes by tag
notesRouter.get('/tags/:name', (req, res) => {
  try {
    const notes = getNotesByTag(req.params.name);
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notes/daily/:date - Get or create daily note
notesRouter.get('/daily/:date', (req, res) => {
  try {
    const note = getOrCreateDailyNote(req.params.date);
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notes/export/:id - Export note as markdown
notesRouter.get('/export/:id', (req, res) => {
  try {
    const result = exportNote(req.params.id);
    if (!result) return res.status(404).json({ error: 'Note not found' });
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Type', 'text/markdown');
    res.send(result.content);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notes/:id - Get a single note
notesRouter.get('/:id', (req, res) => {
  try {
    const note = getNote(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/notes/:id - Update a note
notesRouter.put('/:id', (req, res) => {
  try {
    const { title, content } = req.body;
    const note = updateNote(req.params.id, { title, content });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notes/:id - Delete a note
notesRouter.delete('/:id', (req, res) => {
  try {
    deleteNote(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
