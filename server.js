import { app, createServer } from './server-lib.js';

const PORT = process.env.PORT || 3456;

// Initialize database then start server
createServer().then(() => {
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║          🧠  MindGraph is running!           ║
║                                              ║
║    Local:  http://localhost:${PORT}              ║
║    Press  Ctrl+C to stop                     ║
╚══════════════════════════════════════════════╝
    `);
  });
}).catch(err => {
  console.error('Failed to initialize MindGraph:', err);
  process.exit(1);
});
