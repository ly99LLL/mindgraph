import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { initDatabase } from './db/database.js';
import { notesRouter } from './routes/notes.js';
import { searchRouter } from './routes/search.js';
import { graphRouter } from './routes/graph.js';
import { aiRouter } from './routes/ai.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env file (simple parser, no dependency needed)
const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// Ensure data directories exist
const DATA_DIR = join(__dirname, 'data');
const IMAGES_DIR = join(DATA_DIR, 'images');
if (!existsSync(IMAGES_DIR)) {
  mkdirSync(IMAGES_DIR, { recursive: true });
}

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(join(__dirname, 'public')));

// Serve uploaded images
app.use('/data/images', express.static(IMAGES_DIR));

// API Routes
app.use('/api/notes', notesRouter);
app.use('/api/search', searchRouter);
app.use('/api/graph', graphRouter);
app.use('/api/ai', aiRouter);

// Serve frontend for all other routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Create server with async init
function createServer() {
  // Init DB first, then return the app
  return initDatabase().then(() => app);
}

export { app, createServer };
