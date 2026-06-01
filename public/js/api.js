// ========== API Client ==========
const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Notes
  getAllNotes: () => request(`${BASE}/notes`),
  getNote: (id) => request(`${BASE}/notes/${id}`),
  createNote: (data) => request(`${BASE}/notes`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateNote: (id, data) => request(`${BASE}/notes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  deleteNote: (id) => request(`${BASE}/notes/${id}`, { method: 'DELETE' }),

  // Daily notes
  getDailyNote: (date) => request(`${BASE}/notes/daily/${date}`),

  // Search
  search: (q) => request(`${BASE}/search?q=${encodeURIComponent(q)}`),

  // Tags
  getAllTags: () => request(`${BASE}/notes/tags`),
  getNotesByTag: (tag) => request(`${BASE}/notes/tags/${encodeURIComponent(tag)}`),

  // Graph
  getGraphData: () => request(`${BASE}/graph`),

  // Stats
  getStats: () => request(`${BASE}/notes/stats`),

  // Export
  getExportUrl: (id) => `${BASE}/notes/export/${id}`,

  // Image upload
  uploadImage: (data, filename) => request(`${BASE}/notes/upload-image`, {
    method: 'POST',
    body: JSON.stringify({ data, filename }),
  }),

  // AI
  suggestTags: (content, title) => request(`${BASE}/ai/suggest-tags`, {
    method: 'POST',
    body: JSON.stringify({ content, title }),
  }),
  summarize: (content, title) => request(`${BASE}/ai/summarize`, {
    method: 'POST',
    body: JSON.stringify({ content, title }),
  }),
  enhance: (content, title, existingNotes) => request(`${BASE}/ai/enhance`, {
    method: 'POST',
    body: JSON.stringify({ content, title, existingNotes }),
  }),
};
