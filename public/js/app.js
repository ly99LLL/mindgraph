import { api } from './api.js';

// ========== Application State ==========
const state = {
  notes: [],
  tags: [],
  currentNote: null,
  isDirty: false,
  theme: localStorage.getItem('mindgraph-theme') || 'light',
};

// ========== DOM References ==========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  app: $('#app'),
  loading: $('#loading'),
  notesList: $('#notes-list'),
  noteCount: $('#note-count'),
  tagsList: $('#tags-list'),
  searchInput: $('#search-input'),
  searchResults: $('#search-results'),
  editorEmpty: $('#editor-empty'),
  editorActive: $('#editor-active'),
  noteTitleInput: $('#note-title-input'),
  noteContentInput: $('#note-content-input'),
  previewContent: $('#preview-content'),
  saveStatus: $('#save-status'),
  backlinksSection: $('#backlinks-section'),
  backlinksList: $('#backlinks-list'),
  outgoingSection: $('#outgoing-section'),
  outgoingList: $('#outgoing-list'),
  noteTagsSection: $('#note-tags-section'),
  noteTagsList: $('#note-tags-list'),
  noteInfoSection: $('#note-info-section'),
  noteInfo: $('#note-info'),
  graphModal: $('#graph-modal'),
  graphContainer: $('#graph-container'),
  graphInfo: $('#graph-info'),
  graphTooltip: $('#graph-tooltip'),
  statsBadge: $('#stats-badge'),
  toast: $('#toast'),
  editorContainer: $('.editor-container'),
  aiPanel: null, // dynamically created
};

// ========== Utility Functions ==========
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'Z');
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function showToast(message, duration = 2500) {
  dom.toast.textContent = message;
  dom.toast.style.display = 'block';
  dom.toast.style.animation = 'none';
  dom.toast.offsetHeight; // reflow
  dom.toast.style.animation = 'toastIn 0.3s ease';
  clearTimeout(dom.toast._timeout);
  dom.toast._timeout = setTimeout(() => {
    dom.toast.style.display = 'none';
  }, duration);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Generate unique ID
function genId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

// ========== Theme ==========
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('mindgraph-theme', state.theme);
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  applyTheme();
  if (state.currentNote) {
    renderPreview();
  }
}

// ========== Markdown Rendering ==========

// Configure marked once
marked.use({
  breaks: true,
  gfm: true,
});

function renderMarkdown(content) {
  if (!content) return '<p style="color:var(--text-muted)">空笔记…</p>';

  // Pre-process: protect code blocks from wiki-link replacement
  const codeBlocks = [];
  let processed = content.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
  });

  // Also protect inline code
  const inlineCode = [];
  processed = processed.replace(/`[^`]+`/g, (match) => {
    inlineCode.push(match);
    return `%%INLINECODE_${inlineCode.length - 1}%%`;
  });

  // Convert [[wiki-links]] to markdown links before rendering
  processed = processed.replace(/\[\[([^\]]+)\]\]/g, (match, title) => {
    return `[${title}](${encodeURIComponent(title)})`;
  });

  // Restore code blocks
  processed = processed.replace(/%%CODEBLOCK_(\d+)%%/g, (_, i) => codeBlocks[parseInt(i)]);
  processed = processed.replace(/%%INLINECODE_(\d+)%%/g, (_, i) => inlineCode[parseInt(i)]);

  // Render with marked
  let html = marked.parse(processed);

  // Post-process: add wiki-link class to links that were [[wiki-links]]
  html = html.replace(/<a href="([^"]+)"/g, (match, href) => {
    // Check if this looks like a wiki-link (the href is a URL-encoded title, not a URL)
    if (href.startsWith('http') || href.startsWith('#') || href.startsWith('/')) {
      return match;
    }
    return `<a href="#" class="wiki-link" data-wiki="${escapeHtml(decodeURIComponent(href))}"`;
  });

  return html;
}

function renderPreview() {
  if (!state.currentNote) return;
  const html = renderMarkdown(state.currentNote.content);
  dom.previewContent.innerHTML = html;

  // Add click handlers for wiki-links
  dom.previewContent.querySelectorAll('.wiki-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const title = link.dataset.wiki;
      navigateToWikiLink(title);
    });
  });
}

async function navigateToWikiLink(title) {
  // Find note by title
  let note = state.notes.find(n => n.title.toLowerCase() === title.toLowerCase());
  if (!note) {
    // Create it
    note = await api.createNote({ title, content: `# ${title}\n\n` });
    await loadNotes();
  }
  loadNoteIntoEditor(note.id);
}

// ========== Note List ==========
function renderNotesList(filter = null) {
  let notes = state.notes;
  if (filter) {
    const q = filter.toLowerCase();
    notes = notes.filter(n =>
      n.title.toLowerCase().includes(q) ||
      (n.content && n.content.toLowerCase().includes(q))
    );
  }

  dom.noteCount.textContent = notes.length;

  if (notes.length === 0) {
    dom.notesList.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:0.85rem;">暂无笔记</div>';
    return;
  }

  dom.notesList.innerHTML = notes.map(n => `
    <div class="note-item ${state.currentNote && state.currentNote.id === n.id ? 'active' : ''}"
         data-id="${n.id}">
      <span class="note-title">${escapeHtml(n.title)}</span>
      <span class="note-meta">
        <span>${formatDate(n.updated_at)}</span>
        ${n.backlink_count > 0 ? `<span>📎${n.backlink_count}</span>` : ''}
        ${n.outgoing_count > 0 ? `<span>🔗${n.outgoing_count}</span>` : ''}
      </span>
    </div>
  `).join('');

  // Add click handlers
  dom.notesList.querySelectorAll('.note-item').forEach(item => {
    item.addEventListener('click', () => {
      loadNoteIntoEditor(item.dataset.id);
    });
  });
}

function renderTagsList() {
  if (state.tags.length === 0) {
    dom.tagsList.innerHTML = '<span style="font-size:0.8rem;color:var(--text-muted);">暂无标签</span>';
    return;
  }
  dom.tagsList.innerHTML = state.tags.map(t => `
    <span class="tag-item" data-tag="${escapeHtml(t.name)}">
      ${escapeHtml(t.name)} (${t.note_count})
    </span>
  `).join('');

  dom.tagsList.querySelectorAll('.tag-item').forEach(tag => {
    tag.addEventListener('click', () => {
      filterByTag(tag.dataset.tag);
    });
  });
}

async function filterByTag(tagName) {
  try {
    const notes = await api.getNotesByTag(tagName);
    dom.searchInput.value = `#${tagName}`;
    renderNotesListWithData(notes);
  } catch (err) {
    showToast('按标签筛选失败');
  }
}

function renderNotesListWithData(notes) {
  dom.noteCount.textContent = notes.length;
  dom.notesList.innerHTML = notes.map(n => `
    <div class="note-item ${state.currentNote && state.currentNote.id === n.id ? 'active' : ''}"
         data-id="${n.id}">
      <span class="note-title">${escapeHtml(n.title)}</span>
      <span class="note-meta">
        <span>${formatDate(n.updated_at)}</span>
      </span>
    </div>
  `).join('');

  dom.notesList.querySelectorAll('.note-item').forEach(item => {
    item.addEventListener('click', () => {
      loadNoteIntoEditor(item.dataset.id);
    });
  });
}

// ========== Editor ==========
async function loadNoteIntoEditor(id) {
  try {
    const note = await api.getNote(id);
    if (!note) return;

    state.currentNote = note;
    state.isDirty = false;
    dismissAiPanel();

    dom.editorEmpty.style.display = 'none';
    dom.editorActive.style.display = 'flex';

    dom.noteTitleInput.value = note.title;
    dom.noteContentInput.value = note.content;
    renderPreview();
    updateRightSidebar(note);
    renderNotesList();
    updateSaveStatus('已加载');

  } catch (err) {
    showToast('加载笔记失败');
    console.error(err);
  }
}

function updateRightSidebar(note) {
  // Backlinks
  if (note.backlinks && note.backlinks.length > 0) {
    dom.backlinksSection.style.display = 'block';
    dom.backlinksList.innerHTML = note.backlinks.map(b => `
      <div class="link-item" data-id="${b.id}">📎 ${escapeHtml(b.title)}</div>
    `).join('');
    dom.backlinksList.querySelectorAll('.link-item').forEach(item => {
      item.addEventListener('click', () => loadNoteIntoEditor(item.dataset.id));
    });
  } else {
    dom.backlinksSection.style.display = 'none';
  }

  // Outgoing links
  if (note.outgoingLinks && note.outgoingLinks.length > 0) {
    dom.outgoingSection.style.display = 'block';
    dom.outgoingList.innerHTML = note.outgoingLinks.map(l => `
      <div class="link-item" data-id="${l.id}">🔗 ${escapeHtml(l.title)}</div>
    `).join('');
    dom.outgoingList.querySelectorAll('.link-item').forEach(item => {
      item.addEventListener('click', () => loadNoteIntoEditor(item.dataset.id));
    });
  } else {
    dom.outgoingSection.style.display = 'none';
  }

  // Tags
  if (note.tags && note.tags.length > 0) {
    dom.noteTagsSection.style.display = 'block';
    dom.noteTagsList.innerHTML = note.tags.map(t => `
      <span class="tag-item" data-tag="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>
    `).join('');
    dom.noteTagsList.querySelectorAll('.tag-item').forEach(tag => {
      tag.addEventListener('click', () => filterByTag(tag.dataset.tag));
    });
  } else {
    dom.noteTagsSection.style.display = 'none';
  }

  // Info
  dom.noteInfoSection.style.display = 'block';
  dom.noteInfo.innerHTML = `
    创建时间：${formatDate(note.created_at)}<br>
    更新时间：${formatDate(note.updated_at)}<br>
    字数：${note.content ? note.content.split(/\s+/).length : 0}<br>
    链接：${note.outgoingLinks ? note.outgoingLinks.length : 0} 出 / ${note.backlinks ? note.backlinks.length : 0} 入<br>
    ${note.is_daily ? '📅 日记' : ''}
  `;
}

function closeEditor() {
  state.currentNote = null;
  state.isDirty = false;
  dom.editorEmpty.style.display = 'flex';
  dom.editorActive.style.display = 'none';
  dom.backlinksSection.style.display = 'none';
  dom.outgoingSection.style.display = 'none';
  dom.noteTagsSection.style.display = 'none';
  dom.noteInfoSection.style.display = 'none';
  renderNotesList();
}

async function saveCurrentNote() {
  if (!state.currentNote || !state.isDirty) return;

  try {
    const title = dom.noteTitleInput.value.trim() || 'Untitled';
    const content = dom.noteContentInput.value;

    const updated = await api.updateNote(state.currentNote.id, { title, content });
    state.currentNote = updated;
    state.isDirty = false;

    updateSaveStatus('已保存 ✓');
    updateRightSidebar(updated);
    await loadNotes();
    renderPreview();
    updateStats();

    setTimeout(() => updateSaveStatus('就绪'), 2000);
  } catch (err) {
    showToast('保存笔记失败');
    updateSaveStatus('保存失败！');
  }
}

const autoSave = debounce(() => {
  if (state.isDirty) {
    saveCurrentNote();
  }
}, 1500);

function updateSaveStatus(msg) {
  dom.saveStatus.textContent = msg;
}

function markDirty() {
  state.isDirty = true;
  updateSaveStatus('未保存的修改…');
  autoSave();
}

// ========== Note CRUD ==========
async function createNewNote() {
  closeEditor();
  try {
    const note = await api.createNote({
      title: 'New Note',
      content: '# New Note\n\nStart writing here...\n',
    });
    await loadNotes();
    loadNoteIntoEditor(note.id);
    dom.noteTitleInput.focus();
    dom.noteTitleInput.select();
    showToast('笔记已创建');
  } catch (err) {
    showToast('创建笔记失败');
  }
}

async function deleteCurrentNote() {
  if (!state.currentNote) return;
  if (!confirm(`确定删除「${state.currentNote.title}」吗？\n此操作不可撤销。`)) return;

  try {
    await api.deleteNote(state.currentNote.id);
    showToast('笔记已删除');
    closeEditor();
    await loadNotes();
    updateStats();
  } catch (err) {
    showToast('删除笔记失败');
  }
}

async function openDailyNote() {
  const today = new Date().toISOString().split('T')[0];
  try {
    const note = await api.getDailyNote(today);
    await loadNotes();
    loadNoteIntoEditor(note.id);
    showToast(`📅 今日日记：${today}`);
  } catch (err) {
    showToast('加载日记失败');
  }
}

async function exportCurrentNote() {
  if (!state.currentNote) return;
  window.open(api.getExportUrl(state.currentNote.id), '_blank');
}

// ========== Search ==========
const searchDebounced = debounce(async (query) => {
  if (!query || query.trim().length === 0) {
    dom.searchResults.style.display = 'none';
    renderNotesList();
    return;
  }

  // If filtering by tag
  if (query.startsWith('#')) {
    const tagName = query.slice(1).trim();
    if (tagName) {
      try {
        const notes = await api.getNotesByTag(tagName);
        renderNotesListWithData(notes);
      } catch { /* ignore */ }
    }
    dom.searchResults.style.display = 'none';
    return;
  }

  try {
    const results = await api.search(query);
    if (results.length === 0) {
      dom.searchResults.innerHTML = '<div class="search-result-item" style="color:var(--text-muted)">未找到结果</div>';
    } else {
      dom.searchResults.innerHTML = results.slice(0, 10).map(r => `
        <div class="search-result-item" data-id="${r.id}">
          <div class="title">${escapeHtml(r.title)}</div>
          <div class="snippet">${escapeHtml((r.content || '').substring(0, 100))}</div>
        </div>
      `).join('');
    }
    dom.searchResults.style.display = 'block';

    dom.searchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        loadNoteIntoEditor(item.dataset.id);
        dom.searchResults.style.display = 'none';
        dom.searchInput.value = '';
      });
    });
  } catch (err) {
    // fallback: filter locally
    renderNotesList(query);
    dom.searchResults.style.display = 'none';
  }
}, 300);

// ========== Graph ==========
let graphSimulation = null;

async function openGraph() {
  dom.graphModal.style.display = 'flex';
  await renderGraph();
}

function closeGraph() {
  dom.graphModal.style.display = 'none';
  if (graphSimulation) {
    graphSimulation.stop();
  }
}

async function renderGraph() {
  const container = dom.graphContainer;
  container.innerHTML = '';

  try {
    const data = await api.getGraphData();
    dom.graphInfo.textContent = `${data.nodes.length} 个节点 · ${data.edges.length} 条边`;

    if (data.nodes.length === 0) {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);">暂无连接。创建笔记并使用 [[笔记标题]] 来构建知识图谱！</div>';
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select('#graph-container')
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    // Define arrow markers
    svg.append('defs').selectAll('marker')
      .data(['arrow'])
      .join('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'var(--text-muted)');

    // Create zoom group
    const g = svg.append('g');

    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Prepare node sizes
    const maxConnections = Math.max(1, ...data.nodes.map(n => n.connection_count || 0));
    const nodeRadius = d => 5 + ((d.connection_count || 0) / maxConnections) * 20;

    // Create simulation
    graphSimulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.edges)
        .id(d => d.id)
        .distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => nodeRadius(d) + 8));

    // Draw links
    const link = g.append('g')
      .selectAll('line')
      .data(data.edges)
      .join('line')
      .attr('class', 'graph-link')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrow)');

    // Draw nodes
    const node = g.append('g')
      .selectAll('g')
      .data(data.nodes)
      .join('g')
      .attr('class', 'graph-node')
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) graphSimulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) graphSimulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      );

    // Node circles
    node.append('circle')
      .attr('r', d => nodeRadius(d))
      .attr('fill', d => {
        const count = d.connection_count || 0;
        if (count === 0) return '#adb5bd';
        if (count < 3) return '#a29bfe';
        if (count < 8) return '#6c5ce7';
        return '#4834d4';
      });

    // Node labels
    node.append('text')
      .text(d => d.title.length > 20 ? d.title.substring(0, 18) + '...' : d.title)
      .attr('x', d => nodeRadius(d) + 6)
      .attr('y', 4)
      .attr('font-size', d => Math.max(8, Math.min(14, 8 + (d.connection_count || 0) * 0.5)));

    // Tooltip
    node.on('mouseenter', (event, d) => {
      dom.graphTooltip.innerHTML = `
        <div class="title">${escapeHtml(d.title)}</div>
        <div class="info">${d.connection_count || 0} 个连接</div>
      `;
      dom.graphTooltip.style.display = 'block';
      dom.graphTooltip.style.left = (event.pageX + 12) + 'px';
      dom.graphTooltip.style.top = (event.pageY - 10) + 'px';
    });

    node.on('mousemove', (event) => {
      dom.graphTooltip.style.left = (event.pageX + 12) + 'px';
      dom.graphTooltip.style.top = (event.pageY - 10) + 'px';
    });

    node.on('mouseleave', () => {
      dom.graphTooltip.style.display = 'none';
    });

    // Double-click to open note
    node.on('dblclick', (event, d) => {
      closeGraph();
      loadNoteIntoEditor(d.id);
    });

    // Simulation tick
    graphSimulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Fit to view button
    $('#btn-graph-fit').onclick = () => {
      svg.transition().duration(750).call(
        zoom.transform,
        d3.zoomIdentity.translate(width / 2, height / 2).scale(1).translate(-width / 2, -height / 2)
      );
      // Center on all nodes
      const bounds = g.node().getBBox();
      const dx = bounds.width;
      const dy = bounds.height;
      const x = bounds.x + dx / 2;
      const y = bounds.y + dy / 2;
      const scale = Math.min(0.9, 0.9 / Math.max(dx / width, dy / height));
      const translate = [width / 2 - scale * x, height / 2 - scale * y];

      svg.transition().duration(750).call(
        zoom.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
      );
    };

  } catch (err) {
    console.error('Graph render error:', err);
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);">加载图谱失败</div>';
  }
}

// ========== Data Loading ==========
async function loadNotes() {
  try {
    state.notes = await api.getAllNotes();
    renderNotesList();
  } catch (err) {
    console.error('Error loading notes:', err);
  }
}

async function loadTags() {
  try {
    state.tags = await api.getAllTags();
    renderTagsList();
  } catch (err) {
    console.error('Error loading tags:', err);
  }
}

async function updateStats() {
  try {
    const stats = await api.getStats();
    dom.statsBadge.textContent = `📝 ${stats.totalNotes} 篇笔记 · 🔗 ${stats.totalLinks} 条链接`;
  } catch (err) {
    // ignore
  }
}

// ========== Image Paste Handler ==========
async function handleImagePaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const blob = item.getAsFile();
      if (!blob) continue;

      // Convert to base64
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          showToast('📤 正在上传图片…', 2000);
          const result = await api.uploadImage(ev.target.result, `pasted-${Date.now()}.png`);
          const textarea = dom.noteContentInput;
          const cursorPos = textarea.selectionStart;
          const before = textarea.value.substring(0, cursorPos);
          const after = textarea.value.substring(cursorPos);
          const imgMarkdown = `\n![pasted-image](${result.url})\n`;
          textarea.value = before + imgMarkdown + after;
          textarea.selectionStart = textarea.selectionEnd = cursorPos + imgMarkdown.length;
          markDirty();
          renderPreview();
          showToast('✅ 图片上传成功！');
        } catch (err) {
          showToast('❌ 图片上传失败');
          console.error('Image upload error:', err);
        }
      };
      reader.readAsDataURL(blob);
      break;
    }
  }
}

// ========== AI Panel ==========
function showAiPanel(icon, label, contentHtml) {
  dismissAiPanel();

  const panel = document.createElement('div');
  panel.className = 'ai-panel';
  panel.id = 'ai-result-panel';
  panel.innerHTML = `
    <div class="ai-icon">${icon}</div>
    <div class="ai-content">
      <div class="ai-label">${label}</div>
      ${contentHtml}
    </div>
    <div class="ai-close" onclick="document.getElementById('ai-result-panel')?.remove()">✕</div>
  `;

  const editorActive = dom.editorActive;
  editorActive.appendChild(panel);
  dom.aiPanel = panel;
}

function dismissAiPanel() {
  const existing = document.getElementById('ai-result-panel');
  if (existing) existing.remove();
  dom.aiPanel = null;
}

// ========== AI Handlers ==========
async function handleAiSuggestTags() {
  if (!state.currentNote) return;
  const content = dom.noteContentInput.value;
  if (content.trim().length < 10) {
    showToast('内容太短，无法推荐标签');
    return;
  }

  const btn = $('#btn-ai-tags');
  btn.disabled = true;
  btn.textContent = '🤖⏳ 思考中…';
  showToast('🤖 AI 正在思考…', 3000);

  try {
    const result = await api.suggestTags(content, state.currentNote.title);
    if (result.tags && result.tags.length > 0) {
      const tagsHtml = `
        <div class="ai-tags">
          ${result.tags.map(t => `
            <span class="ai-tag-suggestion" data-tag="${escapeHtml(t)}">+ ${escapeHtml(t)}</span>
          `).join('')}
        </div>
        <div style="margin-top:4px;font-size:0.75rem;color:var(--text-muted)">点击标签添加到笔记中</div>
      `;
      showAiPanel('🏷️', 'AI 推荐标签', tagsHtml);

      // Add click handlers for tag suggestions
      document.querySelectorAll('.ai-tag-suggestion').forEach(el => {
        el.addEventListener('click', () => {
          const tag = el.dataset.tag;
          const textarea = dom.noteContentInput;
          const cursorPos = textarea.selectionStart;
          const before = textarea.value.substring(0, cursorPos);
          const after = textarea.value.substring(cursorPos);
          textarea.value = before + ` #${tag}` + after;
          textarea.focus();
          markDirty();
          renderPreview();
          el.style.background = 'var(--success)';
          el.style.color = 'white';
          el.style.borderColor = 'var(--success)';
          el.textContent = '✓ ' + tag;
          el.style.cursor = 'default';
          el.onclick = null;
        });
      });
    } else {
      showToast('没有可推荐的标签');
    }
  } catch (err) {
    showToast('❌ AI 标签推荐失败：' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🤖🏷️ 推荐标签';
  }
}

async function handleAiSummarize() {
  if (!state.currentNote) return;
  const content = dom.noteContentInput.value;
  if (content.trim().length < 20) {
    showToast('内容太短，无法生成摘要');
    return;
  }

  const btn = $('#btn-ai-summarize');
  btn.disabled = true;
  btn.textContent = '🤖⏳ 思考中…';
  showToast('🤖 正在生成摘要…', 3000);

  try {
    const result = await api.summarize(content, state.currentNote.title);
    const summaryHtml = `<p>${escapeHtml(result.summary)}</p>`;
    showAiPanel('📝', 'AI 摘要', summaryHtml);
  } catch (err) {
    showToast('❌ AI 摘要生成失败：' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🤖📝 生成摘要';
  }
}

async function handleAiEnhance() {
  if (!state.currentNote) return;
  const content = dom.noteContentInput.value;
  if (content.trim().length < 20) {
    showToast('内容太短，无法提供建议');
    return;
  }

  const btn = $('#btn-ai-enhance');
  btn.disabled = true;
  btn.textContent = '🤖⏳ 思考中…';
  showToast('🤖 正在分析改进建议…', 3000);

  try {
    const existingTitles = state.notes
      .filter(n => n.id !== state.currentNote.id)
      .map(n => n.title);
    const result = await api.enhance(content, state.currentNote.title, existingTitles);

    let html = '';
    if (result.suggestions && result.suggestions.length > 0) {
      html += `<div style="margin-bottom:8px"><strong>💡 改进建议：</strong></div>`;
      html += `<ul style="margin:0 0 12px 0;padding-left:20px">`;
      result.suggestions.forEach(s => { html += `<li>${escapeHtml(s)}</li>`; });
      html += `</ul>`;
    }
    if (result.wikiLinks && result.wikiLinks.length > 0) {
      html += `<div style="margin-bottom:4px"><strong>🔗 建议链接到：</strong></div>`;
      html += `<div class="ai-tags">`;
      result.wikiLinks.forEach(link => {
        html += `<span class="ai-tag-suggestion" data-wiki="${escapeHtml(link)}">🔗 ${escapeHtml(link)}</span>`;
      });
      html += `</div>`;
      html += `<div style="margin-top:4px;font-size:0.75rem;color:var(--text-muted)">点击添加为 wiki 链接</div>`;
    }

    showAiPanel('💡', 'AI 改进建议', html);

    // Add click handlers for wiki-link suggestions
    document.querySelectorAll('.ai-tag-suggestion[data-wiki]').forEach(el => {
      el.addEventListener('click', () => {
        const link = el.dataset.wiki;
        const textarea = dom.noteContentInput;
        const cursorPos = textarea.selectionStart;
        const before = textarea.value.substring(0, cursorPos);
        const after = textarea.value.substring(cursorPos);
        textarea.value = before + ` [[${link}]]` + after;
        textarea.focus();
        markDirty();
        renderPreview();
        el.style.background = 'var(--success)';
        el.style.color = 'white';
        el.style.borderColor = 'var(--success)';
        el.textContent = '✓ ' + link;
        el.style.cursor = 'default';
        el.onclick = null;
      });
    });
  } catch (err) {
    showToast('❌ AI 改进建议失败：' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🤖💡 改进建议';
  }
}

// ========== Event Bindings ==========
function bindEvents() {
  // New note
  $('#btn-new-note').addEventListener('click', createNewNote);

  // Daily note
  $('#btn-daily-note').addEventListener('click', openDailyNote);

  // Graph view
  $('#btn-graph-view').addEventListener('click', openGraph);
  $('#btn-close-graph').addEventListener('click', closeGraph);
  $('#btn-graph-refresh').addEventListener('click', renderGraph);
  dom.graphModal.querySelector('.modal-backdrop')?.addEventListener('click', closeGraph);

  // Theme toggle
  $('#btn-toggle-theme').addEventListener('click', toggleTheme);

  // Save
  $('#btn-save').addEventListener('click', saveCurrentNote);

  // Export
  $('#btn-export').addEventListener('click', exportCurrentNote);

  // Delete
  $('#btn-delete-note').addEventListener('click', deleteCurrentNote);

  // Editor input events
  dom.noteTitleInput.addEventListener('input', () => {
    markDirty();
    renderPreview();
  });

  dom.noteContentInput.addEventListener('input', () => {
    markDirty();
    renderPreview();
  });

  // Image paste handler
  dom.noteContentInput.addEventListener('paste', handleImagePaste);

  // AI buttons
  $('#btn-ai-tags').addEventListener('click', handleAiSuggestTags);
  $('#btn-ai-summarize').addEventListener('click', handleAiSummarize);
  $('#btn-ai-enhance').addEventListener('click', handleAiEnhance);

  // Search
  dom.searchInput.addEventListener('input', () => {
    searchDebounced(dom.searchInput.value);
  });

  dom.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dom.searchResults.style.display = 'none';
      dom.searchInput.value = '';
      renderNotesList();
    }
  });

  // Close search on outside click
  document.addEventListener('click', (e) => {
    if (!dom.searchInput.contains(e.target) && !dom.searchResults.contains(e.target)) {
      dom.searchResults.style.display = 'none';
    }
  });

  // Graph modal backdrop
  dom.graphModal.querySelector('.modal-backdrop').addEventListener('click', closeGraph);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+N: New note
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      createNewNote();
    }
    // Ctrl+S: Save
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      saveCurrentNote();
    }
    // Escape: Close graph
    if (e.key === 'Escape' && dom.graphModal.style.display === 'flex') {
      closeGraph();
    }
  });

  // Handle window resize for graph
  window.addEventListener('resize', debounce(() => {
    if (dom.graphModal.style.display === 'flex') {
      renderGraph();
    }
  }, 500));
}

// ========== Initialization ==========
async function init() {
  try {
    applyTheme();
    bindEvents();
    await loadNotes();
    await loadTags();
    await updateStats();

    // Show app
    dom.loading.style.display = 'none';
    dom.app.style.display = 'block';

    // Render preview on initial load
    if (state.currentNote) {
      renderPreview();
    }

    // Check URL params for direct note access
    const params = new URLSearchParams(window.location.search);
    const noteId = params.get('note');
    if (noteId) {
      loadNoteIntoEditor(noteId);
    }

    // Electron menu IPC listener
    if (window.electronAPI) {
      window.electronAPI.onMenuAction((action) => {
        switch (action) {
          case 'new-note': createNewNote(); break;
          case 'daily-note': openDailyNote(); break;
          case 'export': exportCurrentNote(); break;
          case 'graph': openGraph(); break;
        }
      });
    }

  } catch (err) {
    console.error('Initialization error:', err);
    dom.loading.innerHTML = '<p style="color:red">加载失败，请刷新页面。</p>';
  }
}

// ========== Start App ==========
init();
