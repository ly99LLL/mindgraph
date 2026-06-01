import { Router } from 'express';
import { getGraphData } from '../db/database.js';

export const graphRouter = Router();

// GET /api/graph
graphRouter.get('/', (req, res) => {
  try {
    const data = getGraphData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
