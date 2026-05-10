let sb = null;
let currentRoomId = null;
let activeChannels = [];
let availableModels = [];
let currentPrompts = [];
let currentIdeas = [];

// ============================================================================
// Initialization & Config
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const url = localStorage.getItem('sb_url');
  const key = localStorage.getItem('sb_key');
  
  if (url && key) {
    initSupabase(url, key);
  } else {
    document.getElementById('config-overlay').style.display = 'flex';
  }
});

function saveConfig() {
  const url = document.getElementById('cfg-url').value.trim();
  const key = document.getElementById('cfg-key').value.trim();
  
  if (!url || !key) {
    document.getElementById('cfg-error').innerText = 'Please enter both URL and Key';
    return;
  }
  
  localStorage.setItem('sb_url', url);
  localStorage.setItem('sb_key', key);
  initSupabase(url, key);
}

function logout() {
  localStorage.removeItem('sb_url');
  localStorage.removeItem('sb_key');
  location.reload();
}

async function initSupabase(url, key) {
  try {
    sb = window.supabase.createClient(url, key);
    document.getElementById('config-overlay').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';
    
    await loadModels();
    await loadRooms();
  } catch (err) {
    console.error(err);
    document.getElementById('config-overlay').style.display = 'flex';
    document.getElementById('cfg-error').innerText = 'Failed to connect. Check console.';
  }
}

// ============================================================================
// Models
// ============================================================================

async function loadModels() {
  const { data, error } = await sb.functions.invoke('room-management', {
    body: { action: 'list_models' }
  });
  
  if (error || !data) {
    console.error('Failed to load models:', error);
    return;
  }
  
  availableModels = data.models || [];
  const select = document.getElementById('model-select');
  select.innerHTML = availableModels.map(m => 
    `<option value="${m.id}">${m.display_name}</option>`
  ).join('');
}

// ============================================================================
// Rooms
// ============================================================================

async function loadRooms() {
  const { data, error } = await sb.functions.invoke('room-management', {
    body: { action: 'list_rooms' }
  });
  
  if (error || !data) {
    console.error('Failed to load rooms:', error);
    return;
  }
  
  const list = document.getElementById('rooms-list');
  list.innerHTML = data.rooms.map(room => `
    <div class="nav-item ${room.id === currentRoomId ? 'active' : ''}" 
         onclick="selectRoom('${room.id}', '${escapeHtml(room.name)}')">
      ${escapeHtml(room.name)}
    </div>
  `).join('');
}

function showNewRoomInput() {
  const input = document.getElementById('new-room-container');
  input.style.display = input.style.display === 'none' ? 'block' : 'none';
  if (input.style.display === 'block') {
    document.getElementById('new-room-name').focus();
  }
}

async function createRoom() {
  const input = document.getElementById('new-room-name');
  const name = input.value.trim();
  if (!name) return;
  
  input.disabled = true;
  const { data, error } = await sb.functions.invoke('room-management', {
    body: { action: 'create_room', name }
  });
  
  input.disabled = false;
  input.value = '';
  document.getElementById('new-room-container').style.display = 'none';
  
  if (error || !data) {
    alert('Failed to create room: ' + (error?.message || 'Unknown error'));
    return;
  }
  
  await loadRooms();
  selectRoom(data.room.id, data.room.name);
}

async function deleteCurrentRoom() {
  if (!currentRoomId || !confirm('Are you sure? This deletes all ideas in this room forever.')) return;
  
  const { error } = await sb.functions.invoke('room-management', {
    body: { action: 'delete_room', room_id: currentRoomId }
  });
  
  if (error) {
    alert('Failed to delete room');
    return;
  }
  
  currentRoomId = null;
  document.getElementById('room-view').style.display = 'none';
  document.getElementById('empty-state').style.display = 'flex';
  closeIdeaPanel();
  await loadRooms();
}

async function selectRoom(roomId, roomName) {
  currentRoomId = roomId;
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('room-view').style.display = 'flex';
  document.getElementById('current-room-name').innerText = roomName;
  closeIdeaPanel();
  
  // Highlight in sidebar
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeEl = Array.from(document.querySelectorAll('.nav-item')).find(el => el.textContent.trim() === roomName);
  if (activeEl) activeEl.classList.add('active');
  
  // Load full room data (gets prompts and selected model)
  const { data, error } = await sb.functions.invoke('room-management', {
    body: { action: 'get_room', room_id: roomId }
  });
  
  if (error || !data) {
    console.error('Failed to load room config:', error);
    return;
  }
  
  // Set dropdown to selected model
  if (data.selected_model_id) {
    document.getElementById('model-select').value = data.selected_model_id;
  }
  
  renderPrompts(data.prompts || []);
  await loadIdeas();
  setupRealtime(roomId);
}

async function updateRoomModel() {
  if (!currentRoomId) return;
  const modelId = document.getElementById('model-select').value;
  
  await sb.functions.invoke('room-management', {
    body: { action: 'update_room', room_id: currentRoomId, selected_model_id: modelId }
  });
}

// ============================================================================
// Prompts Configuration
// ============================================================================

function togglePromptsPanel() {
  const panel = document.getElementById('prompts-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function renderPrompts(prompts) {
  currentPrompts = prompts.map(p => ({
    id: p.id,
    name: p.name || '',
    system_prompt: p.system_prompt || '',
    is_enabled: p.is_enabled ?? true
  }));
  drawPrompts();
}

function drawPrompts() {
  const list = document.getElementById('prompt-list');
  
  if (currentPrompts.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:12px;">No prompts defined. AI will not process ideas until you add steps.</p>';
    return;
  }
  
  list.innerHTML = currentPrompts.map((p, i) => `
    <div class="prompt-row">
      <div class="prompt-fields">
        <input type="text" placeholder="Step Name (e.g. categorize, evaluate)" 
               value="${escapeHtml(p.name)}" 
               onchange="currentPrompts[${i}].name=this.value" />
        <textarea placeholder="System Prompt Instructions...
(e.g. You are an expert. End response with CATEGORY: x)" 
                  onchange="currentPrompts[${i}].system_prompt=this.value">${escapeHtml(p.system_prompt)}</textarea>
        <label style="font-size:12px;display:flex;align-items:center;gap:6px;">
          <input type="checkbox" style="width:auto;" ${p.is_enabled ? 'checked' : ''} 
                 onchange="currentPrompts[${i}].is_enabled=this.checked" /> Enabled
        </label>
      </div>
      <div class="prompt-actions">
        <button class="btn icon-btn outline" onclick="movePrompt(${i}, -1)" ${i===0?'disabled':''}>↑</button>
        <button class="btn icon-btn outline" onclick="movePrompt(${i}, 1)" ${i===currentPrompts.length-1?'disabled':''}>↓</button>
        <button class="btn icon-btn outline danger" onclick="removePrompt(${i})" style="margin-top:auto">✕</button>
      </div>
    </div>
  `).join('');
}

window.addPromptRow = function() {
  currentPrompts.push({ name: '', system_prompt: '', is_enabled: true });
  drawPrompts();
};

window.removePrompt = function(i) {
  currentPrompts.splice(i, 1);
  drawPrompts();
};

window.movePrompt = function(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= currentPrompts.length) return;
  [currentPrompts[i], currentPrompts[j]] = [currentPrompts[j], currentPrompts[i]];
  drawPrompts();
};

window.savePrompts = async function() {
  const btn = document.querySelector('#prompts-panel .primary');
  btn.innerText = 'Saving...';
  
  const { error } = await sb.functions.invoke('room-management', {
    body: { action: 'set_prompts', room_id: currentRoomId, prompts: currentPrompts }
  });
  
  btn.innerText = 'Save Pipeline';
  if (error) alert('Failed to save prompts: ' + error.message);
  else togglePromptsPanel();
};

// ============================================================================
// Ideas Feed & Realtime
// ============================================================================

async function loadIdeas() {
  if (!currentRoomId) return;
  const { data, error } = await sb.functions.invoke('room-management', {
    body: { action: 'get_ideas', room_id: currentRoomId, page: 0, per_page: 50 }
  });
  
  if (error || !data) return;
  currentIdeas = data.ideas || [];
  drawIdeas();
}

function drawIdeas() {
  const feed = document.getElementById('ideas-feed');
  
  if (currentIdeas.length === 0) {
    feed.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:40px;">No ideas recorded yet. Log one above!</div>';
    return;
  }
  
  feed.innerHTML = currentIdeas.map(idea => `
    <div class="idea-card" onclick="openIdeaDetail('${idea.id}')">
      <div class="idea-header">
        <div class="idea-meta">
          <div class="logo-circle small" style="background:var(--text-muted)"></div>
          <span class="idea-author">${escapeHtml(idea.author_name)}</span>
          <span>•</span>
          <span>${formatDate(idea.created_at)}</span>
        </div>
        <span class="status ${idea.status}">${idea.status}</span>
      </div>
      
      <div class="idea-badges">
        ${idea.idea_metadata?.category ? `<span class="badge category">${escapeHtml(idea.idea_metadata.category)}</span>` : ''}
        ${idea.idea_metadata?.score ? `<span class="badge score ${getScoreClass(idea.idea_metadata.score)}">${escapeHtml(idea.idea_metadata.score)}</span>` : ''}
      </div>
    </div>
  `).join('');
}

async function submitIdea() {
  const author = document.getElementById('idea-author').value.trim();
  const text = document.getElementById('idea-input').value.trim();
  
  if (!author || !text || !currentRoomId) return;
  
  const btn = document.querySelector('.input-actions .primary');
  const ogText = btn.innerText;
  btn.innerText = 'Processing...';
  
  // Call process-idea edge function. It creates the idea, inserts the first chat_message,
  // fires off the prompt chain asynchronously, and returns immediately.
  const { error } = await sb.functions.invoke('process-idea', {
    body: { room_id: currentRoomId, author_name: author, content_text: text }
  });
  
  btn.innerText = ogText;
  if (error) {
    alert('Failed to submit: ' + error.message);
  } else {
    document.getElementById('idea-input').value = '';
    // The realtime subscription will automatically add the new idea to the list!
  }
}

// ── Realtime Subscriptions ──────────────────────────────────────────────────

function setupRealtime(roomId) {
  // Clean up old channels
  activeChannels.forEach(c => sb.removeChannel(c));
  activeChannels = [];
  
  // 1. Listen for Idea changes (status updates, new ideas)
  const ideaChan = sb.channel(`ideas-${roomId}`)
    .on('postgres_changes', { 
      event: '*', schema: 'public', table: 'ideas', filter: `room_id=eq.${roomId}` 
    }, payload => {
      // Refresh ideas list to keep it simple, or update array manually
      loadIdeas(); 
    })
    .subscribe();
    
  // 2. Listen for Metadata changes (category/score parsed)
  const metaChan = sb.channel(`meta-${roomId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'idea_metadata'
    }, payload => {
      // Just reload ideas to pick up the join
      loadIdeas();
    })
    .subscribe();

  // 3. Listen for Chat Messages (live stream into the side panel)
  const chatChan = sb.channel(`chat-${roomId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}`
    }, payload => {
      const msg = payload.new;
      if (currentIdeaId === msg.idea_id) {
        appendChatMessage(msg);
      }
    })
    .subscribe();
    
  activeChannels.push(ideaChan, metaChan, chatChan);
}

// ============================================================================
// Idea Detail / Chat View
// ============================================================================

let currentIdeaId = null;

async function openIdeaDetail(ideaId) {
  currentIdeaId = ideaId;
  const panel = document.getElementById('idea-panel');
  panel.classList.add('open');
  
  const content = document.getElementById('idea-panel-content');
  content.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Loading AI Analysis...</div>';
  
  // 1. Fetch idea info
  const { data: idea } = await sb.from('ideas').select('*').eq('id', ideaId).single();
  // 2. Fetch all chat messages
  const { data: messages } = await sb.from('chat_messages').select('*').eq('idea_id', ideaId).order('created_at', { ascending: true });
  // 3. Fetch metadata
  const { data: meta } = await sb.from('idea_metadata').select('*').eq('idea_id', ideaId).maybeSingle();
  
  renderIdeaPanel(idea, messages || [], meta);
}

function closeIdeaPanel() {
  currentIdeaId = null;
  document.getElementById('idea-panel').classList.remove('open');
}

function renderIdeaPanel(idea, messages, meta) {
  const content = document.getElementById('idea-panel-content');
  
  let html = `
    <div class="detail-header">
      <div>
        <h2 style="font-size:18px;margin-bottom:4px">AI Analysis</h2>
        <span class="status ${idea.status}">${idea.status}</span>
      </div>
      <div style="text-align:right">
        ${meta?.category ? `<div class="badge category" style="margin-bottom:4px">${escapeHtml(meta.category)}</div>` : ''}
        ${meta?.score ? `<div class="badge score ${getScoreClass(meta.score)}">${escapeHtml(meta.score)}</div>` : ''}
      </div>
    </div>
    
    <div class="chat-container" id="chat-container">
  `;
  
  messages.forEach(msg => {
    html += buildChatBubble(msg);
  });
  
  html += `
    </div>
    
    <div class="export-section">
      <button class="btn outline" onclick="exportCurrentIdea()">
        📄 Export to Markdown
      </button>
    </div>
  `;
  
  content.innerHTML = html;
  scrollToBottom();
}

function buildChatBubble(msg) {
  const isUser = msg.role === 'user';
  // Check if this is the original user idea (prompt_id is null) vs a system prompt sent to AI (prompt_id is set)
  const isOriginalIdea = isUser && !msg.prompt_id;
  
  let header = '';
  if (isOriginalIdea) header = 'Original Idea';
  else if (isUser) header = 'System Prompt Sent';
  else header = 'AI Output';
  
  return `
    <div class="chat-bubble ${isUser ? 'user' : 'assistant'}">
      <div class="bubble-meta">
        <span>${header}</span>
        <span>${new Date(msg.created_at).toLocaleTimeString()}</span>
      </div>
      <div class="markdown-body">
        ${formatMarkdown(escapeHtml(msg.content))}
      </div>
      ${msg.metadata?.input_tokens ? `
        <div style="font-size:9px;color:var(--text-muted);margin-top:8px;text-align:right;">
          ${msg.metadata.input_tokens} in | ${msg.metadata.output_tokens} out | ${msg.metadata.provider}
        </div>
      ` : ''}
    </div>
  `;
}

function appendChatMessage(msg) {
  const container = document.getElementById('chat-container');
  if (container) {
    container.insertAdjacentHTML('beforeend', buildChatBubble(msg));
    scrollToBottom();
  }
}

function scrollToBottom() {
  const scroll = document.querySelector('.idea-panel-scroll');
  if (scroll) scroll.scrollTop = scroll.scrollHeight;
}

// ============================================================================
// Export
// ============================================================================

window.exportCurrentIdea = async function() {
  if (!currentIdeaId) return;
  
  const btn = document.querySelector('.export-section .btn');
  btn.innerText = 'Generating...';
  
  const { data, error } = await sb.functions.invoke('room-management', {
    body: { action: 'export_idea', idea_id: currentIdeaId }
  });
  
  btn.innerText = '📄 Export to Markdown';
  
  if (error || !data) {
    alert('Export failed');
    return;
  }
  
  // Show prompt/modal to copy
  const text = data.text;
  navigator.clipboard.writeText(text).then(() => {
    alert('Markdown exported and copied to clipboard!\n\nYou can now paste this into ChatGPT or Claude.');
  }).catch(() => {
    // Fallback if clipboard fails
    alert('Export successful, but clipboard write failed. See console.');
    console.log(text);
  });
};

// ============================================================================
// Utilities
// ============================================================================

function getScoreClass(score) {
  if (!score) return '';
  const s = score.toLowerCase();
  if (s.includes('strong') || s.includes('good') || s.includes('high')) return 'strong';
  if (s.includes('pivot') || s.includes('medium') || s.includes('needs')) return 'pivot';
  if (s.includes('weak') || s.includes('bad') || s.includes('low')) return 'weak';
  return '';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

// Very simple markdown parser for bold, code blocks, and line breaks
function formatMarkdown(text) {
  let parsed = text;
  // Code blocks
  parsed = parsed.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  // Inline code
  parsed = parsed.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  parsed = parsed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Newlines
  parsed = parsed.replace(/\n/g, '<br/>');
  return parsed;
}
