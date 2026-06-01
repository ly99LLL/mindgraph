import { Router } from 'express';
import { searchNotes } from '../db/database.js';

export const searchRouter = Router();

// GET /api/search?q=query
searchRouter.get('/', (req, res) => {
  try {
    const query = req.query.q || '';
    const results = searchNotes(query);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
