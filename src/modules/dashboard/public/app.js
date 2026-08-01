const Hallows = (() => {
  const state = {
    guildId: null,
    nodes: [],
    nodesByModule: {},
    roles: [],
    selectedRoleId: null,
    currentPermissions: {},
    pendingChanges: {},
    auditLog: [],
    wings: [],
    selectedWingId: null,
    editingWingId: null,
    editingRoleId: null,
    modules: [],
    tickets: [],
    selectedTicketId: null,
    selectedTicketIds: new Set(),
    logs: [],
    logsTotal: 0,
    logsOffset: 0,
    logsLimit: 50,
    logsActionFilter: '',
    logsActorFilter: '',
    wingSearchQuery: '',
    modCases: [],
    modStats: {},
    modTotal: 0,
    modOffset: 0,
    modLimit: 50,
    modActionFilter: '',
    modUserFilter: '',
    modModeratorFilter: '',
    modStartDate: '',
    modEndDate: '',
    channels: [],
    selectedChannelId: null,
    channelSearchQuery: '',
    channelTypeFilter: '',
    fullRoles: [],
    selectedFullRoleId: null,
    roleSearchQuery: '',
    roleFilterType: '',
    roleMembers: [],
    pbanWeights: []
  };

  async function init() {
    console.log('Initializing dashboard...');
    state.guildId = await getGuildId();
    console.log('Guild ID:', state.guildId);
    
    if (!state.guildId) {
      console.warn('No guild ID found - showing error message');
      showError('Unable to load server data. Please ensure you have logged in and have access to a server with Hallows installed.');
      return;
    }

    try {
      console.log('Loading nodes...');
      await loadNodes();
      console.log('Loading other data...');
      await Promise.all([
        loadRoles(), 
        loadStats(), 
        loadWings(), 
        loadModules(), 
        loadTickets(), 
        loadLogActionTypes(), 
        loadRecentActivity(),
        loadModStats(),
        loadChannels()
      ]);
      console.log('Rendering data...');
      renderRolesList();
      renderWingsList();
      renderModules();
      renderTickets();
      renderChannelsTree();
      renderFullRolesList();
      await loadLogs();
      await loadModCases();
      console.log('Dashboard initialized successfully');
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      showError('Failed to load dashboard data: ' + error.message);
    }
    bindEvents();
    setupNavigation();
  }

  function showError(message) {
    const main = document.querySelector('main');
    if (main) {
      main.innerHTML = `
        <div style="text-align: center; padding: 4rem 2rem;">
          <h2 style="color: var(--hallows-orange); margin-bottom: 1rem;">⚠️ Configuration Required</h2>
          <p style="color: var(--text-secondary); margin-bottom: 2rem;">${message}</p>
          <div style="background: var(--bg-secondary); padding: 1.5rem; border-radius: 8px; text-align: left; max-width: 600px; margin: 0 auto;">
            <h3 style="color: var(--hallows-orange); margin-bottom: 1rem;">Troubleshooting Steps:</h3>
            <ol style="color: var(--text-secondary); line-height: 1.8;">
              <li>Ensure you're logged in with Discord</li>
              <li>Check that your Discord application has <code>http://localhost:3000/auth/discord/callback</code> in Redirect URIs</li>
              <li>Verify the bot is in your server and has proper permissions</li>
              <li>Try logging out and logging back in</li>
            </ol>
          </div>
          <button onclick="window.location.href='/auth/discord'" style="margin-top: 2rem; padding: 0.75rem 2rem; background: var(--hallows-orange); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem;">Login with Discord</button>
        </div>
      `;
    }
  }

  async function getGuildId() {
    try {
      const res = await fetch('/api/user');
      if (res.status === 401) {
        window.location.href = '/auth/discord';
        return null;
      }
      if (!res.ok) return null;
      const user = await res.json();
      // Use the configured guild ID first, fall back to the first guild from OAuth
      return user.guildId || user.guilds?.[0]?.id || null;
    } catch {
      return null;
    }
  }

  async function loadStats() {
    if (!state.guildId) return;
    try {
      const res = await fetch(`/api/stats/${state.guildId}`);
      const stats = await res.json();
      document.getElementById('node-count').textContent = stats.nodeCount || 0;
      document.getElementById('wing-count').textContent = stats.wingCount || 0;
      document.getElementById('ticket-count').textContent = stats.ticketCount || 0;
      document.getElementById('total-ticket-count').textContent = stats.totalTicketCount || 0;
      document.getElementById('closed-ticket-count').textContent = stats.closedTicketCount || 0;
      document.getElementById('module-count').textContent = stats.moduleCount || 0;
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  }

  async function loadRecentActivity() {
    if (!state.guildId) return;
    try {
      const res = await fetch(`/api/recent-activity/${state.guildId}?limit=5`);
      const data = await res.json();
      renderRecentActivity(data);
    } catch (e) {
      console.error('Failed to load recent activity:', e);
      showError('recent-activity', 'Failed to load recent activity');
    }
  }

  function renderRecentActivity(data) {
    const container = document.getElementById('recent-activity');
    if (!container) return;

    const activities = [];

    // Add recent logs
    if (data.logs && data.logs.length > 0) {
      data.logs.forEach(log => {
        activities.push({
          type: 'log',
          timestamp: new Date(log.timestamp),
          icon: '📝',
          text: `${log.action} by ${log.actor_id}`,
          details: log.details || ''
        });
      });
    }

    // Add recent tickets
    if (data.tickets && data.tickets.length > 0) {
      data.tickets.forEach(ticket => {
        activities.push({
          type: 'ticket',
          timestamp: new Date(ticket.created_at),
          icon: '🎫',
          text: `Ticket #${ticket.id} ${ticket.status}`,
          details: `User: ${ticket.user_id} | Wing: ${ticket.department_id}`
        });
      });
    }

    // Sort by timestamp (most recent first)
    activities.sort((a, b) => b.timestamp - a.timestamp);

    if (activities.length === 0) {
      container.innerHTML = '<p class="empty-state">No recent activity</p>';
      return;
    }

    container.innerHTML = activities.slice(0, 10).map(activity => `
      <div class="activity-item">
        <span class="activity-icon">${activity.icon}</span>
        <div class="activity-content">
          <div class="activity-text">${escapeHtml(activity.text)}</div>
          ${activity.details ? `<div class="activity-details">${escapeHtml(activity.details)}</div>` : ''}
          <div class="activity-time">${activity.timestamp.toLocaleString()}</div>
        </div>
      </div>
    `).join('');
  }

  async function loadNodes() {
    try {
      const res = await fetch('/api/nodes');
      state.nodes = await res.json();
      const nodeCountEl = document.getElementById('node-count');
      if (nodeCountEl) nodeCountEl.textContent = state.nodes.length;

      state.nodesByModule = {};
      for (const node of state.nodes) {
        const mod = node.module || 'other';
        if (!state.nodesByModule[mod]) state.nodesByModule[mod] = [];
        state.nodesByModule[mod].push(node);
      }
    } catch (e) {
      console.error('Failed to load nodes:', e);
      showError('permission-tree', 'Failed to load permission nodes');
    }
  }

  async function loadRoles() {
    if (!state.guildId) return;
    try {
      const res = await fetch(`/api/roles/${state.guildId}/enhanced`);
      state.fullRoles = await res.json();
      state.roles = state.fullRoles.map(r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        position: r.position,
        memberCount: r.memberCount
      }));
    } catch (e) {
      console.error('Failed to load roles:', e);
    }
  }

  function setupNavigation() {
    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (href === '/logout') return;
        e.preventDefault();
        const section = href.slice(1) || 'overview';
        showSection(section);
      });
    });
    // Restore section from URL hash on load
    const hash = window.location.hash.slice(1);
    if (hash && document.getElementById(hash)) {
      showSection(hash);
    }
  }

  function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    
    const section = document.getElementById(id);
    if (section) section.classList.add('active');
    
    const navLink = document.querySelector(`[href="/${id === 'overview' ? '' : id}"]`);
    if (navLink) navLink.classList.add('active');

    if (window.location.hash !== '#' + id) {
      window.location.hash = id;
    }

    if (id === 'settings' && !Object.keys(state.settings).length) loadSettings();
    if (id === 'leveling' && !state.levelConfig?.guild_id) loadLeveling();
    if (id === 'starboard' && !state.starboardConfig?.guild_id) loadStarboard();
    if (id === 'security') loadSecurity(); // always refresh security (weights may change)
    if (id === 'counters') { loadChannels(); loadCounters(); }
    if (id === 'autoroles') { loadRoles(); loadAutoroles(); }
    if (id === 'staff') { loadFakePerms(); renderWingsList(); }
  }

  function renderRolesList() {
    const container = document.getElementById('roles-list');
    if (!container) return;
    
    if (!state.roles.length) {
      container.innerHTML = '<p class="empty-state">No roles found</p>';
      return;
    }

    container.innerHTML = state.roles
      .filter(r => r.name !== '@everyone')
      .map(r => `
        <div class="role-item ${state.selectedRoleId === r.id ? 'selected' : ''}" data-role-id="${r.id}">
          <span class="role-color" style="background: ${r.color || '#99aab5'}"></span>
          <span class="role-name">${escapeHtml(r.name)}</span>
        </div>
      `).join('');
  }

  async function selectRole(roleId) {
    state.selectedRoleId = roleId;
    state.pendingChanges = {};

    renderRolesList();

    const role = state.roles.find(r => r.id === roleId);
    const titleEl = document.getElementById('selected-role-title');
    if (titleEl) titleEl.textContent = role ? `Editing: ${role.name}` : 'Select a role';

    try {
      const res = await fetch(`/api/permissions/roles/${state.guildId}`);
      const perms = await res.json();
      state.currentPermissions = {};
      for (const p of perms) {
        if (p.role_id === roleId) {
          state.currentPermissions[p.node] = p.mode;
        }
      }
    } catch (e) {
      console.error('Failed to load role permissions:', e);
      state.currentPermissions = {};
    }

    renderPermissionTree();
    updateActionButtons();
  }

  function renderPermissionTree() {
    const container = document.getElementById('permission-tree');
    if (!container) return;

    if (!state.selectedRoleId) {
      container.innerHTML = '<p class="empty-state">Select a role from the sidebar to edit permissions</p>';
      return;
    }

    const modules = Object.keys(state.nodesByModule).sort();
    if (!modules.length) {
      container.innerHTML = '<p class="empty-state">No permission nodes registered</p>';
      return;
    }

    container.innerHTML = modules.map(mod => {
      const nodes = state.nodesByModule[mod];
      const moduleLabel = mod.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const allNodes = nodes.every(n => getEffectiveMode(n.node) === 'allow');
      const someNodes = nodes.some(n => getEffectiveMode(n.node) !== 'deny');

      return `
        <div class="permission-module">
          <div class="module-header" data-module="${mod}">
            <label class="module-checkbox">
              <input type="checkbox" class="module-toggle" data-module="${mod}" ${allNodes ? 'checked' : ''} ${!allNodes && !someNodes ? 'data-indeterminate' : ''}>
              <span class="module-label">${moduleLabel}</span>
            </label>
            <span class="module-count">${nodes.filter(n => getEffectiveMode(n.node) === 'allow').length}/${nodes.length}</span>
          </div>
          <div class="module-nodes">
            ${nodes.map(n => renderNodeRow(n)).join('')}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.module-toggle').forEach(cb => {
      if (cb.hasAttribute('data-indeterminate')) cb.indeterminate = true;
    });
  }

  function renderNodeRow(node) {
    const mode = getEffectiveMode(node.node);
    const isChanged = state.pendingChanges[node.node] !== undefined;
    const pendingMode = state.pendingChanges[node.node];

    return `
      <div class="node-row ${isChanged ? 'changed' : ''}" data-node="${node.node}">
        <div class="node-info">
          <code class="node-name">${node.node}</code>
          <span class="node-desc">${escapeHtml(node.description || '')}</span>
        </div>
        <div class="node-controls">
          <button class="node-btn allow ${mode === 'allow' ? 'active' : ''}" data-node="${node.node}" data-mode="allow" title="Allow">
            &#10003;
          </button>
          <button class="node-btn deny ${mode === 'deny' ? 'active' : ''}" data-node="${node.node}" data-mode="deny" title="Deny">
            &#10007;
          </button>
          <button class="node-btn unset ${mode === 'unset' ? 'active' : ''}" data-node="${node.node}" data-mode="unset" title="Unset (inherit)">
            &#8212;
          </button>
          ${isChanged ? `<span class="change-indicator" title="Changed from ${state.currentPermissions[node.node] || 'unset'} to ${pendingMode}">*</span>` : ''}
        </div>
      </div>
    `;
  }

  function getEffectiveMode(node) {
    if (state.pendingChanges[node] !== undefined) {
      return state.pendingChanges[node];
    }
    return state.currentPermissions[node] || 'unset';
  }

  function toggleNode(node, mode) {
    const currentMode = getEffectiveMode(node);
    const newMode = currentMode === mode ? 'unset' : mode;

    if (newMode === 'unset') {
      delete state.pendingChanges[node];
    } else {
      state.pendingChanges[node] = newMode;
    }

    renderPermissionTree();
    updateActionButtons();
  }

  function toggleModule(moduleName, mode) {
    const nodes = state.nodesByModule[moduleName];
    for (const n of nodes) {
      if (mode === 'unset') {
        delete state.pendingChanges[n.node];
      } else {
        state.pendingChanges[n.node] = mode;
      }
    }
    renderPermissionTree();
    updateActionButtons();
  }

  function updateActionButtons() {
    const hasChanges = Object.keys(state.pendingChanges).length > 0;
    const saveBtn = document.getElementById('btn-save-perms');
    const cancelBtn = document.getElementById('btn-cancel-perms');
    if (saveBtn) saveBtn.disabled = !hasChanges;
    if (cancelBtn) cancelBtn.disabled = !hasChanges;
  }

  async function savePermissions() {
    if (!state.selectedRoleId || !Object.keys(state.pendingChanges).length) return;

    const btn = document.getElementById('btn-save-perms');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      for (const [node, mode] of Object.entries(state.pendingChanges)) {
        const apiMode = mode === 'unset' ? 'revoke' : mode;
        await fetch(`/api/permissions/roles/${state.guildId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roleId: state.selectedRoleId,
            node,
            mode: apiMode,
            grantedBy: 'dashboard'
          })
        });
      }

      state.currentPermissions = { ...state.currentPermissions };
      for (const [node, mode] of Object.entries(state.pendingChanges)) {
        if (mode === 'unset') {
          delete state.currentPermissions[node];
        } else {
          state.currentPermissions[node] = mode;
        }
      }
      state.pendingChanges = {};
      renderPermissionTree();
      updateActionButtons();
    } catch (e) {
      console.error('Failed to save permissions:', e);
    }

    btn.textContent = 'Save Changes';
    updateActionButtons();
  }

  function cancelChanges() {
    state.pendingChanges = {};
    renderPermissionTree();
    updateActionButtons();
  }

  async function showAuditLog() {
    const modal = document.getElementById('audit-modal');
    const content = document.getElementById('audit-log-content');
    if (!modal || !content) return;
    
    modal.style.display = 'flex';
    content.innerHTML = '<p class="loading">Loading audit log...</p>';

    try {
      const res = await fetch(`/api/permissions/audit/${state.guildId}?limit=50`);
      const logs = await res.json();

      if (!logs.length) {
        content.innerHTML = '<p class="empty-state">No audit entries yet</p>';
        return;
      }

      content.innerHTML = `
        <table class="audit-table">
          <thead>
            <tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr>
          </thead>
          <tbody>
            ${logs.map(l => `
              <tr>
                <td>${new Date(l.timestamp).toLocaleString()}</td>
                <td><code>${l.actor_id}</code></td>
                <td><span class="audit-action">${l.action}</span></td>
                <td>${l.target_type ? `<code>${l.target_type}</code>` : '-'}</td>
                <td>${l.details ? escapeHtml(l.details) : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      content.innerHTML = '<p class="error">Failed to load audit log</p>';
    }
  }

  function bindEvents() {
    const rolesList = document.getElementById('roles-list');
    if (rolesList) {
      rolesList.addEventListener('click', (e) => {
        const item = e.target.closest('.role-item');
        if (item) selectRole(item.dataset.roleId);
      });
    }

    const permTree = document.getElementById('permission-tree');
    if (permTree) {
      permTree.addEventListener('click', (e) => {
        const btn = e.target.closest('.node-btn');
        if (btn) {
          toggleNode(btn.dataset.node, btn.dataset.mode);
          return;
        }

        const header = e.target.closest('.module-header');
        if (header && !e.target.closest('.module-checkbox')) {
          const mod = header.dataset.module;
          const nodes = state.nodesByModule[mod];
          const allAllow = nodes.every(n => getEffectiveMode(n.node) === 'allow');
          toggleModule(mod, allAllow ? 'unset' : 'allow');
        }
      });

      permTree.addEventListener('change', (e) => {
        if (e.target.classList.contains('module-toggle')) {
          const mod = e.target.dataset.module;
          toggleModule(mod, e.target.checked ? 'allow' : 'unset');
        }
      });
    }

    const saveBtn = document.getElementById('btn-save-perms');
    if (saveBtn) saveBtn.addEventListener('click', savePermissions);
    
    const cancelBtn = document.getElementById('btn-cancel-perms');
    if (cancelBtn) cancelBtn.addEventListener('click', cancelChanges);
    
    const auditBtn = document.getElementById('btn-view-audit');
    if (auditBtn) auditBtn.addEventListener('click', showAuditLog);

    // Hierarchy events
    const wingsList = document.getElementById('wings-list');
    if (wingsList) {
      wingsList.addEventListener('click', (e) => {
        const item = e.target.closest('.wing-item');
        if (item && !e.target.closest('.drag-handle')) {
          selectWing(item.dataset.wingId);
        }
      });
    }

    const addWingBtn = document.getElementById('btn-add-wing');
    if (addWingBtn) addWingBtn.addEventListener('click', showAddWingModal);

    const wingForm = document.getElementById('wing-form');
    if (wingForm) wingForm.addEventListener('submit', handleWingFormSubmit);

    const roleForm = document.getElementById('role-form');
    if (roleForm) roleForm.addEventListener('submit', handleRoleFormSubmit);

    const wingSearchInput = document.getElementById('wing-search-input');
    if (wingSearchInput) {
      wingSearchInput.addEventListener('input', (e) => {
        filterWings(e.target.value);
      });
    }

    // Modules events
    const modulesGrid = document.getElementById('modules-grid');
    if (modulesGrid) {
      modulesGrid.addEventListener('change', (e) => {
        if (e.target.classList.contains('module-toggle')) {
          const moduleName = e.target.dataset.module;
          const enabled = e.target.checked;
          toggleModule(moduleName, enabled);
        }
      });

      modulesGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.module-details-btn');
        if (btn) {
          const moduleName = btn.dataset.module;
          showModuleDetail(moduleName);
        }
      });
    }

    // Tickets events
    const ticketsList = document.getElementById('tickets-list');
    if (ticketsList) {
      ticketsList.addEventListener('click', (e) => {
        const item = e.target.closest('.ticket-item');
        const checkbox = e.target.closest('.ticket-checkbox');
        
        if (checkbox) {
          const ticketId = parseInt(checkbox.dataset.ticketId);
          toggleTicketSelection(ticketId, checkbox.checked);
          e.stopPropagation();
          return;
        }
        
        if (item) {
          const ticketId = item.dataset.ticketId;
          selectTicket(ticketId);
        }
      });
    }

    const ticketSelectAll = document.getElementById('ticket-select-all');
    if (ticketSelectAll) {
      ticketSelectAll.addEventListener('change', (e) => {
        toggleSelectAllTickets(e.target.checked);
      });
    }

    const ticketBulkCloseBtn = document.getElementById('ticket-bulk-close-btn');
    if (ticketBulkCloseBtn) {
      ticketBulkCloseBtn.addEventListener('click', bulkCloseTickets);
    }

    const ticketBulkPriorityBtn = document.getElementById('ticket-bulk-priority-btn');
    if (ticketBulkPriorityBtn) {
      ticketBulkPriorityBtn.addEventListener('click', showPriorityModal);
    }

    // Logs events
    const logActionFilter = document.getElementById('log-action-filter');
    if (logActionFilter) {
      logActionFilter.addEventListener('change', (e) => {
        state.logsActionFilter = e.target.value;
        state.logsOffset = 0;
        loadLogs();
      });
    }

    const logActorFilter = document.getElementById('log-actor-filter');
    if (logActorFilter) {
      let debounceTimer;
      logActorFilter.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          state.logsActorFilter = e.target.value.trim();
          state.logsOffset = 0;
          loadLogs();
        }, 500);
      });
    }

    const logRefreshBtn = document.getElementById('log-refresh-btn');
    if (logRefreshBtn) {
      logRefreshBtn.addEventListener('click', () => {
        loadLogs();
      });
    }

    const logPrevBtn = document.getElementById('log-prev-btn');
    if (logPrevBtn) {
      logPrevBtn.addEventListener('click', () => {
        state.logsOffset = Math.max(0, state.logsOffset - state.logsLimit);
        loadLogs();
      });
    }

    const logNextBtn = document.getElementById('log-next-btn');
    if (logNextBtn) {
      logNextBtn.addEventListener('click', () => {
        state.logsOffset += state.logsLimit;
        loadLogs();
      });
    }

    const logExportJsonBtn = document.getElementById('log-export-json-btn');
    if (logExportJsonBtn) {
      logExportJsonBtn.addEventListener('click', () => exportLogs('json'));
    }

    const logExportCsvBtn = document.getElementById('log-export-csv-btn');
    if (logExportCsvBtn) {
      logExportCsvBtn.addEventListener('click', () => exportLogs('csv'));
    }

    // Moderation events
    const modActionFilter = document.getElementById('mod-action-filter');
    if (modActionFilter) {
      modActionFilter.addEventListener('change', (e) => {
        state.modActionFilter = e.target.value;
        state.modOffset = 0;
        loadModCases();
      });
    }

    const modUserFilter = document.getElementById('mod-user-filter');
    if (modUserFilter) {
      let debounceTimer;
      modUserFilter.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          state.modUserFilter = e.target.value.trim();
          state.modOffset = 0;
          loadModCases();
        }, 500);
      });
    }

    const modModeratorFilter = document.getElementById('mod-moderator-filter');
    if (modModeratorFilter) {
      let debounceTimer;
      modModeratorFilter.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          state.modModeratorFilter = e.target.value.trim();
          state.modOffset = 0;
          loadModCases();
        }, 500);
      });
    }

    const modStartDate = document.getElementById('mod-start-date');
    if (modStartDate) {
      modStartDate.addEventListener('change', (e) => {
        state.modStartDate = e.target.value;
        state.modOffset = 0;
        loadModCases();
      });
    }

    const modEndDate = document.getElementById('mod-end-date');
    if (modEndDate) {
      modEndDate.addEventListener('change', (e) => {
        state.modEndDate = e.target.value;
        state.modOffset = 0;
        loadModCases();
      });
    }

    const modRefreshBtn = document.getElementById('mod-refresh-btn');
    if (modRefreshBtn) {
      modRefreshBtn.addEventListener('click', () => {
        loadModStats();
        loadModCases();
      });
    }

    const modPrevBtn = document.getElementById('mod-prev-btn');
    if (modPrevBtn) {
      modPrevBtn.addEventListener('click', () => {
        state.modOffset = Math.max(0, state.modOffset - state.modLimit);
        loadModCases();
      });
    }

    const modNextBtn = document.getElementById('mod-next-btn');
    if (modNextBtn) {
      modNextBtn.addEventListener('click', () => {
        state.modOffset += state.modLimit;
        loadModCases();
      });
    }

    const modExportJsonBtn = document.getElementById('mod-export-json-btn');
    if (modExportJsonBtn) {
      modExportJsonBtn.addEventListener('click', () => exportModCases('json'));
    }

    const modExportCsvBtn = document.getElementById('mod-export-csv-btn');
    if (modExportCsvBtn) {
      modExportCsvBtn.addEventListener('click', () => exportModCases('csv'));
    }

    // Channels events
    const channelSearchInput = document.getElementById('channel-search-input');
    if (channelSearchInput) {
      channelSearchInput.addEventListener('input', (e) => {
        filterChannels(e.target.value);
      });
    }

    const channelTypeFilter = document.getElementById('channel-type-filter');
    if (channelTypeFilter) {
      channelTypeFilter.addEventListener('change', (e) => {
        filterChannelsByType(e.target.value);
      });
    }

    const btnRefreshChannels = document.getElementById('btn-refresh-channels');
    if (btnRefreshChannels) {
      btnRefreshChannels.addEventListener('click', async () => {
        await loadChannels();
        renderChannelsTree();
      });
    }

    // Roles events
    const roleSearchInput = document.getElementById('role-search-input');
    if (roleSearchInput) {
      roleSearchInput.addEventListener('input', (e) => {
        filterFullRoles(e.target.value);
      });
    }

    const roleFilter = document.getElementById('role-filter');
    if (roleFilter) {
      roleFilter.addEventListener('change', (e) => {
        filterRolesByType(e.target.value);
      });
    }

    const btnRefreshRoles = document.getElementById('btn-refresh-roles');
    if (btnRefreshRoles) {
      btnRefreshRoles.addEventListener('click', async () => {
        await loadRoles();
        renderFullRolesList();
        renderRolesList();
      });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function copyToClipboard(text, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Copied: ${text}`);
    }).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast(`Copied: ${text}`);
    });
  }

  function showError(containerId, message) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = '<p class="empty-state" style="color:var(--hallows-orange)">⚠️ ' + message + '</p>';
  }

  function isValidSnowflake(id) {
    return /^\d{17,20}$/.test(id.trim());
  }

  function validateChannelId(id) {
    if (!id || !id.trim()) return true;
    return isValidSnowflake(id) || id.startsWith('<#') && id.endsWith('>');
  }

  function showToast(message, type) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();
    
    if (!type) {
      if (message.toLowerCase().includes('fail') || message.toLowerCase().includes('invalid') || message.toLowerCase().includes('error')) type = 'error';
      else type = 'success';
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    if (type === 'error') toast.style.background = '#ed4245';
    else if (type === 'warning') toast.style.background = '#faa61a';
    else toast.style.background = 'var(--hallows-orange)';
    toast.textContent = (type === 'error' ? '✕ ' : type === 'warning' ? '⚠ ' : '✓ ') + message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    const duration = type === 'error' ? 4000 : 2500;
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ── Hierarchy Functions ──

  async function loadWings() {
    if (!state.guildId) return;
    try {
      const res = await fetch(`/api/wings/${state.guildId}`);
      state.wings = await res.json();
    } catch (e) {
      console.error('Failed to load wings:', e);
    }
  }

  async function loadWingRoles(wingId) {
    if (!state.guildId || !wingId) return [];
    try {
      const res = await fetch(`/api/wings/${state.guildId}/${wingId}/roles`);
      return await res.json();
    } catch (e) {
      console.error('Failed to load wing roles:', e);
      return [];
    }
  }

  function renderWingsList() {
    const container = document.getElementById('wings-list');
    if (!container) return;

    if (!state.wings.length) {
      container.innerHTML = '<p class="empty-state">No wings configured</p>';
      return;
    }

    // Filter wings by search query
    const query = state.wingSearchQuery.toLowerCase();
    const filteredWings = query
      ? state.wings.filter(w => 
          w.id.toLowerCase().includes(query) || 
          w.label.toLowerCase().includes(query) ||
          (w.description && w.description.toLowerCase().includes(query))
        )
      : state.wings;

    if (!filteredWings.length) {
      container.innerHTML = '<p class="empty-state">No wings match your search</p>';
      return;
    }

    container.innerHTML = filteredWings.map(w => `
      <div class="wing-item ${state.selectedWingId === w.id ? 'selected' : ''}" data-wing-id="${w.id}" draggable="true">
        <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
        <div class="wing-info">
          <span class="wing-label">${escapeHtml(w.label)}</span>
          <span class="wing-id">${escapeHtml(w.id)}</span>
        </div>
      </div>
    `).join('');

    setupDragAndDrop();
  }

  function filterWings(query) {
    state.wingSearchQuery = query;
    renderWingsList();
  }

  async function selectWing(wingId) {
    state.selectedWingId = wingId;
    renderWingsList();
    await loadFakePerms();
    await renderWingDetail(wingId);
  }

  async function renderWingDetail(wingId) {
    const container = document.getElementById('staff-detail');
    if (!container) return;

    const wing = state.wings.find(w => w.id === wingId);
    if (!wing) {
      container.innerHTML = '<p class="empty-state">Select a wing from the sidebar to view its roles</p>';
      return;
    }

    const roles = await loadWingRoles(wingId);
    const allFakePerms = state.fakePerms || {};

    container.innerHTML = `
      <div class="wing-detail-header">
        <div class="wing-detail-info">
          <h2>${escapeHtml(wing.label)}</h2>
          <div class="wing-meta">
            <span class="wing-meta-item"><strong>ID:</strong> ${escapeHtml(wing.id)}</span>
            <span class="wing-meta-item"><strong>Prefix:</strong> ${escapeHtml(wing.channel_prefix)}</span>
            ${wing.category_id ? `<span class="wing-meta-item"><strong>Category:</strong> <code>${wing.category_id}</code></span>` : ''}
          </div>
          ${wing.description ? `<p class="wing-description">${escapeHtml(wing.description)}</p>` : ''}
        </div>
        <div class="wing-detail-actions">
          <button class="btn-secondary" onclick="editWing('${wing.id}')">Edit Wing</button>
          <button class="btn-danger" onclick="deleteWing('${wing.id}')">Delete Wing</button>
        </div>
      </div>

      <div class="wing-roles-section">
        <div class="wing-roles-header">
          <h3>Roles (${roles.length})</h3>
          <button class="btn-primary btn-small" onclick="showAddRoleModal('${wing.id}')">+ Add Role</button>
        </div>
        
        ${roles.length ? `
          <div class="staff-roles-list">
            ${roles.sort((a, b) => (b.rank || 0) - (a.rank || 0)).map(r => {
              const discordRole = state.roles.find(dr => dr.id === r.role_id) || state.fullRoles.find(dr => dr.id === r.role_id);
              const roleName = discordRole ? discordRole.name : `Unknown (${r.role_id})`;
              const roleColor = discordRole ? discordRole.color : '#99aab5';
              const roleFakePerms = Object.entries(allFakePerms)
                .filter(([flag, roles]) => roles.includes(r.role_id))
                .map(([flag]) => flag);
              return `
                <div class="staff-role-card" data-role-id="${r.role_id}">
                  <div class="staff-role-header">
                    <span class="role-color" style="background: ${roleColor}; width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0;"></span>
                    <span class="staff-role-name">${escapeHtml(roleName)}</span>
                    <div class="staff-role-badges">
                      <span class="badge badge-rank">Rank ${r.rank}</span>
                      ${r.is_lead ? '<span class="badge badge-lead">Lead</span>' : ''}
                      ${r.is_internal ? '<span class="badge badge-internal">Internal</span>' : ''}
                    </div>
                    <div class="staff-role-actions">
                      <button class="btn-secondary btn-small" onclick="editWingRolePerms('${wing.id}', '${r.role_id}')">Fake Perms</button>
                      <button class="btn-icon" onclick="editWingRole('${wing.id}', '${r.role_id}')" title="Edit Role">✎</button>
                      <button class="btn-icon btn-icon-danger" onclick="removeWingRole('${wing.id}', '${r.role_id}')" title="Remove">×</button>
                    </div>
                  </div>
                  ${roleFakePerms.length ? `
                    <div class="staff-role-fake-perms">
                      ${roleFakePerms.map(flag => `<span class="fake-perm-badge">${escapeHtml(flag)}</span>`).join('')}
                    </div>
                  ` : '<div class="staff-role-fake-perms empty">No fake permissions</div>'}
                </div>
              `;
            }).join('')}
          </div>
        ` : '<p class="empty-state">No roles assigned to this wing</p>'}
      </div>
    `;
  }

  function setupDragAndDrop() {
    const items = document.querySelectorAll('.wing-item');
    let draggedItem = null;

    items.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        draggedItem = null;
        document.querySelectorAll('.wing-item').forEach(i => i.classList.remove('drag-over'));
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (item !== draggedItem) {
          item.classList.add('drag-over');
        }
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', async (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        
        if (item === draggedItem) return;

        const wingsList = document.getElementById('wings-list');
        const allItems = [...wingsList.querySelectorAll('.wing-item')];
        const draggedIndex = allItems.indexOf(draggedItem);
        const targetIndex = allItems.indexOf(item);

        if (draggedIndex < targetIndex) {
          item.after(draggedItem);
        } else {
          item.before(draggedItem);
        }

        const newOrder = [...wingsList.querySelectorAll('.wing-item')].map(i => i.dataset.wingId);
        
        try {
          await fetch(`/api/hierarchy/wings/${state.guildId}/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wingIds: newOrder })
          });
          state.wings = newOrder.map(id => state.wings.find(w => w.id === id));
        } catch (e) {
          console.error('Failed to reorder wings:', e);
          renderWingsList();
        }
      });
    });
  }

  function showAddWingModal() {
    state.editingWingId = null;
    const modal = document.getElementById('wing-modal');
    const title = document.getElementById('wing-modal-title');
    const form = document.getElementById('wing-form');
    
    title.textContent = 'Add Wing';
    form.reset();
    document.getElementById('wing-id').disabled = false;
    modal.style.display = 'flex';
  }

  function editWing(wingId) {
    const wing = state.wings.find(w => w.id === wingId);
    if (!wing) return;

    state.editingWingId = wingId;
    const modal = document.getElementById('wing-modal');
    const title = document.getElementById('wing-modal-title');
    
    title.textContent = 'Edit Wing';
    document.getElementById('wing-id').value = wing.id;
    document.getElementById('wing-id').disabled = true;
    document.getElementById('wing-label').value = wing.label;
    document.getElementById('wing-prefix').value = wing.channel_prefix;
    document.getElementById('wing-description').value = wing.description || '';
    
    modal.style.display = 'flex';
  }

  async function deleteWing(wingId) {
    if (!confirm(`Are you sure you want to delete wing "${wingId}"? This will also remove all roles from this wing.`)) {
      return;
    }

    try {
      await fetch(`/api/hierarchy/wings/${state.guildId}/${wingId}`, {
        method: 'DELETE'
      });
      state.wings = state.wings.filter(w => w.id !== wingId);
      if (state.selectedWingId === wingId) {
        state.selectedWingId = null;
      }
      renderWingsList();
      renderWingDetail(state.selectedWingId);
    } catch (e) {
      console.error('Failed to delete wing:', e);
    }
  }

  function closeWingModal() {
    const modal = document.getElementById('wing-modal');
    if (modal) modal.style.display = 'none';
    state.editingWingId = null;
  }

  async function handleWingFormSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('wing-id').value.trim();
    const label = document.getElementById('wing-label').value.trim();
    const channelPrefix = document.getElementById('wing-prefix').value.trim();
    const description = document.getElementById('wing-description').value.trim();

    if (!id || !label || !channelPrefix) return;

    try {
      if (state.editingWingId) {
        await fetch(`/api/hierarchy/wings/${state.guildId}/${state.editingWingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label, channelPrefix, description })
        });
        const wing = state.wings.find(w => w.id === state.editingWingId);
        if (wing) {
          wing.label = label;
          wing.channel_prefix = channelPrefix;
          wing.description = description;
        }
      } else {
        await fetch(`/api/hierarchy/wings/${state.guildId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, label, channelPrefix, description })
        });
        state.wings.push({ id, label, channel_prefix: channelPrefix, description });
      }
      
      renderWingsList();
      if (state.editingWingId) {
        renderWingDetail(state.editingWingId);
      }
      closeWingModal();
    } catch (e) {
      console.error('Failed to save wing:', e);
    }
  }

  function showAddRoleModal(wingId) {
    state.editingRoleId = null;
    const modal = document.getElementById('role-modal');
    const title = document.getElementById('role-modal-title');
    const form = document.getElementById('role-form');
    const roleSelect = document.getElementById('role-select');
    
    title.textContent = 'Add Role';
    form.reset();
    document.getElementById('role-rank').value = '1';
    document.getElementById('role-lead').checked = false;
    document.getElementById('role-internal').checked = false;
    document.getElementById('role-category').checked = false;

    const wing = state.wings.find(w => w.id === wingId);
    modal.dataset.wingId = wingId;

    loadWingRoles(wingId).then(roles => {
      const assignedRoleIds = roles.map(r => r.role_id);
      const availableRoles = state.roles.filter(r => !assignedRoleIds.includes(r.id) && r.name !== '@everyone');
      
      roleSelect.innerHTML = '<option value="">Select a role...</option>' + 
        availableRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    });
    
    modal.style.display = 'flex';
  }

  async function editWingRole(wingId, roleId) {
    const roles = await loadWingRoles(wingId);
    const role = roles.find(r => r.role_id === roleId);
    if (!role) return;

    state.editingRoleId = roleId;
    const modal = document.getElementById('role-modal');
    const title = document.getElementById('role-modal-title');
    
    const discordRole = state.roles.find(r => r.id === roleId) || state.fullRoles.find(r => r.id === roleId);
    title.textContent = `${discordRole ? discordRole.name : roleId} — Edit Rank & Flags`;
    modal.dataset.wingId = wingId;
    modal.dataset.roleId = roleId;

    const rolesList = await loadWingRoles(wingId);
    const assignedRoleIds = rolesList.map(r => r.role_id);
    const availableRoles = state.roles.filter(r => 
      (r.id === roleId || !assignedRoleIds.includes(r.id)) && r.name !== '@everyone'
    );
    
    const roleSelect = document.getElementById('role-select');
    if (roleSelect) {
      roleSelect.innerHTML = availableRoles.map(r => 
        `<option value="${r.id}" ${r.id === roleId ? 'selected' : ''}>${escapeHtml(r.name)}</option>`
      ).join('');
    }

    document.getElementById('role-rank').value = role.rank;
    document.getElementById('role-lead').checked = !!role.is_lead;
    document.getElementById('role-internal').checked = !!role.is_internal;
    
    modal.style.display = 'flex';
  }

  async function editWingRolePerms(wingId, roleId) {
    const discordRole = state.roles.find(r => r.id === roleId) || state.fullRoles.find(r => r.id === roleId);
    const roleName = discordRole ? discordRole.name : roleId;
    
    const modal = document.getElementById('role-modal');
    const title = document.getElementById('role-modal-title');
    const content = document.getElementById('staff-role-perms');
    
    title.textContent = `${escapeHtml(roleName)} — Fake Permissions`;
    modal.dataset.wingId = wingId;
    modal.dataset.roleId = roleId;
    
    const allFakePerms = state.fakePerms || {};
    const flagOptions = ['banMembers', 'kickMembers', 'manageMessages', 'moderateMembers', 'manageChannels', 'manageGuild', 'viewAuditLog', 'administrator'];
    
    content.innerHTML = `
      <p style="margin-bottom: 1rem; color: var(--hallows-gray);">Toggle fake permissions for this role:</p>
      <div class="fake-perm-toggles">
        ${flagOptions.map(flag => {
          const hasPerm = allFakePerms[flag]?.includes(roleId);
          return `
            <label class="fake-perm-toggle-row">
              <label class="toggle-switch">
                <input type="checkbox" class="fp-flag-toggle" data-flag="${flag}" ${hasPerm ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
              <span class="fp-flag-label">${escapeHtml(flag)}</span>
            </label>
          `;
        }).join('')}
      </div>
      <div class="form-actions" style="margin-top: 1.5rem;">
        <button type="button" class="btn-secondary" onclick="closeRoleModal()">Close</button>
        <button type="button" class="btn-primary" onclick="saveRoleFakePerms('${wingId}', '${roleId}')">Save Changes</button>
      </div>
    `;
    
    modal.style.display = 'flex';
  }

  async function saveRoleFakePerms(wingId, roleId) {
    const toggles = document.querySelectorAll('.fp-flag-toggle');
    const changes = [];
    toggles.forEach(cb => {
      changes.push({ flag: cb.dataset.flag, checked: cb.checked });
    });

    try {
      for (const { flag, checked } of changes) {
        if (checked) {
          await fetch(`/api/fake-perms/${state.guildId}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ flag, roleId })
          });
        } else {
          await fetch(`/api/fake-perms/${state.guildId}/${flag}/${roleId}`, { method: 'DELETE' });
        }
      }
      await loadFakePerms();
      await renderWingDetail(wingId);
      showToast('Fake permissions updated');
    } catch (e) {
      showToast('Failed to save permissions');
    }
  }

  async function removeWingRole(wingId, roleId) {
    const discordRole = state.roles.find(r => r.id === roleId);
    const roleName = discordRole ? discordRole.name : roleId;
    
    if (!confirm(`Remove "${roleName}" from this wing?`)) return;

    try {
      await fetch(`/api/hierarchy/wings/${state.guildId}/${wingId}/roles/${roleId}`, {
        method: 'DELETE'
      });
      renderWingDetail(wingId);
    } catch (e) {
      console.error('Failed to remove role:', e);
    }
  }

  function closeRoleModal() {
    const modal = document.getElementById('role-modal');
    if (modal) modal.style.display = 'none';
    state.editingRoleId = null;
  }

  async function handleRoleFormSubmit(e) {
    e.preventDefault();
    
    const modal = document.getElementById('role-modal');
    const wingId = modal.dataset.wingId;
    const roleId = document.getElementById('role-select')?.value;
    const rank = document.getElementById('role-rank')?.value;
    const isLead = document.getElementById('role-lead')?.checked || false;
    const isInternal = document.getElementById('role-internal')?.checked || false;

    if (!roleId || !wingId) return;

    try {
      if (state.editingRoleId) {
        await fetch(`/api/hierarchy/wings/${state.guildId}/${wingId}/roles/${state.editingRoleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roleId, rank, isLead, isInternal, isCategory: false })
        });
      } else {
        await fetch(`/api/hierarchy/wings/${state.guildId}/${wingId}/roles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roleId, rank, isLead, isInternal, isCategory: false })
        });
      }
      
      renderWingDetail(wingId);
      closeRoleModal();
    } catch (e) {
      console.error('Failed to save role:', e);
    }
  }

  // ── Modules Functions ──

  async function loadModules() {
    if (!state.guildId) return;
    try {
      const res = await fetch(`/api/modules/${state.guildId}`);
      state.modules = await res.json();
    } catch (e) {
      console.error('Failed to load modules:', e);
    }
  }

  function renderModules() {
    const container = document.getElementById('modules-grid');
    if (!container) return;

    if (!state.modules.length) {
      container.innerHTML = '<p class="empty-state">No modules found</p>';
      return;
    }

    container.innerHTML = state.modules.map(mod => `
      <div class="module-card ${mod.enabled ? 'enabled' : 'disabled'}" data-module="${mod.name}">
        <div class="module-card-header">
          <h3 class="module-name">${escapeHtml(mod.name)}</h3>
          <label class="toggle-switch">
            <input type="checkbox" class="module-toggle" data-module="${mod.name}" ${mod.enabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <p class="module-description">${escapeHtml(mod.description)}</p>
        <div class="module-stats">
          ${mod.prefixCommands ? `<span class="module-stat">📝 ${mod.prefixCommands} prefix</span>` : ''}
          ${mod.slashCommands ? `<span class="module-stat">⚡ ${mod.slashCommands} slash</span>` : ''}
          ${mod.hasComponents ? `<span class="module-stat">🎛️ Components</span>` : ''}
        </div>
        <button class="btn-secondary btn-small module-details-btn" data-module="${mod.name}">Details</button>
      </div>
    `).join('');
  }

  async function toggleModule(moduleName, enabled) {
    try {
      await fetch(`/api/modules/${state.guildId}/${moduleName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      
      const mod = state.modules.find(m => m.name === moduleName);
      if (mod) mod.enabled = enabled;
      
      renderModules();
    } catch (e) {
      console.error('Failed to toggle module:', e);
      renderModules();
    }
  }

  async function showModuleDetail(moduleName) {
    const modal = document.getElementById('module-detail-modal');
    const title = document.getElementById('module-detail-title');
    const content = document.getElementById('module-detail-content');
    
    if (!modal || !title || !content) return;

    title.textContent = moduleName;
    content.innerHTML = '<p class="loading">Loading...</p>';
    modal.style.display = 'flex';

    try {
      const res = await fetch(`/api/modules/${state.guildId}/${moduleName}`);
      const mod = await res.json();

      content.innerHTML = `
        <div class="module-detail-section">
          <h4>Overview</h4>
          <p><strong>Version:</strong> ${escapeHtml(mod.version)}</p>
          <p><strong>Status:</strong> <span class="badge ${mod.enabled ? 'badge-enabled' : 'badge-disabled'}">${mod.enabled ? 'Enabled' : 'Disabled'}</span></p>
          <p><strong>Description:</strong> ${escapeHtml(mod.description)}</p>
        </div>

        ${mod.prefixCommands?.length ? `
          <div class="module-detail-section">
            <h4>Prefix Commands (${mod.prefixCommands.length})</h4>
            <ul class="command-list">
              ${mod.prefixCommands.map(cmd => `<li><code>${escapeHtml(cmd.command)}</code></li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${mod.slashCommands?.length ? `
          <div class="module-detail-section">
            <h4>Slash Commands (${mod.slashCommands.length})</h4>
            <ul class="command-list">
              ${mod.slashCommands.map(cmd => `<li><code>/${escapeHtml(cmd.name)}</code></li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${Object.keys(mod.permissionNodes || {}).length ? `
          <div class="module-detail-section">
            <h4>Permission Nodes</h4>
            <ul class="command-list">
              ${Object.entries(mod.permissionNodes).map(([node, info]) => 
                `<li><code>${escapeHtml(node)}</code> - ${escapeHtml(info.description || '')}</li>`
              ).join('')}
            </ul>
          </div>
        ` : ''}
      `;
    } catch (e) {
      content.innerHTML = '<p class="error">Failed to load module details</p>';
    }
  }

  function closeModuleDetailModal() {
    const modal = document.getElementById('module-detail-modal');
    if (modal) modal.style.display = 'none';
  }

  // ── Tickets Functions ──

  async function loadTickets() {
    if (!state.guildId) return;
    try {
      const res = await fetch(`/api/tickets/${state.guildId}`);
      state.tickets = await res.json();
      
      const badge = document.getElementById('ticket-count-badge');
      if (badge) badge.textContent = state.tickets.length;
    } catch (e) {
      console.error('Failed to load tickets:', e);
    }
  }

  function renderTickets() {
    const container = document.getElementById('tickets-list');
    if (!container) return;

    if (!state.tickets.length) {
      container.innerHTML = '<p class="empty-state">No active tickets</p>';
      return;
    }

    container.innerHTML = state.tickets.map(ticket => {
      const priorityClass = ticket.priority === 'urgent' ? 'priority-urgent' : 
                           ticket.priority === 'high' ? 'priority-high' : 
                           ticket.priority === 'low' ? 'priority-low' : 'priority-normal';
      
      const isSelected = state.selectedTicketIds.has(ticket.id);
      
      return `
        <div class="ticket-item ${state.selectedTicketId === ticket.id ? 'selected' : ''}" data-ticket-id="${ticket.id}">
          <div class="ticket-item-checkbox">
            <input type="checkbox" class="ticket-checkbox" data-ticket-id="${ticket.id}" ${isSelected ? 'checked' : ''}>
          </div>
          <div class="ticket-item-content">
            <div class="ticket-item-header">
              <span class="ticket-priority ${priorityClass}">${ticket.priority}</span>
              <span class="ticket-department">${ticket.departmentId}</span>
            </div>
            <div class="ticket-item-info">
              <span class="ticket-user">${ticket.userId}</span>
              <span class="ticket-time">${new Date(ticket.createdAt).toLocaleString()}</span>
            </div>
            ${ticket.claimedBy ? `<div class="ticket-claimed">Claimed by ${ticket.claimedBy}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    updateBulkActionButtons();
  }

  function updateBulkActionButtons() {
    const closeBtn = document.getElementById('ticket-bulk-close-btn');
    const priorityBtn = document.getElementById('ticket-bulk-priority-btn');
    const selectAllCheckbox = document.getElementById('ticket-select-all');
    
    const hasSelection = state.selectedTicketIds.size > 0;
    
    if (closeBtn) closeBtn.disabled = !hasSelection;
    if (priorityBtn) priorityBtn.disabled = !hasSelection;
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = state.selectedTicketIds.size === state.tickets.length && state.tickets.length > 0;
      selectAllCheckbox.indeterminate = state.selectedTicketIds.size > 0 && state.selectedTicketIds.size < state.tickets.length;
    }
  }

  function toggleTicketSelection(ticketId, checked) {
    if (checked) {
      state.selectedTicketIds.add(ticketId);
    } else {
      state.selectedTicketIds.delete(ticketId);
    }
    updateBulkActionButtons();
  }

  function toggleSelectAllTickets(checked) {
    if (checked) {
      state.tickets.forEach(ticket => state.selectedTicketIds.add(ticket.id));
    } else {
      state.selectedTicketIds.clear();
    }
    renderTickets();
  }

  async function bulkCloseTickets() {
    if (state.selectedTicketIds.size === 0) return;
    
    if (!confirm(`Are you sure you want to close ${state.selectedTicketIds.size} ticket(s)?`)) return;

    try {
      for (const ticketId of state.selectedTicketIds) {
        await fetch(`/api/tickets/${state.guildId}/${ticketId}/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Bulk closed via dashboard' })
        });
      }

      state.selectedTicketIds.clear();
      await loadTickets();
      renderTickets();
      
      const detail = document.getElementById('ticket-detail');
      if (detail) detail.innerHTML = '<p class="empty-state">Select a ticket to view details</p>';
    } catch (e) {
      console.error('Failed to bulk close tickets:', e);
    }
  }

  function showPriorityModal() {
    if (state.selectedTicketIds.size === 0) return;
    const modal = document.getElementById('ticket-priority-modal');
    if (modal) modal.style.display = 'flex';
  }

  function closePriorityModal() {
    const modal = document.getElementById('ticket-priority-modal');
    if (modal) modal.style.display = 'none';
  }

  async function applyBulkPriority() {
    if (state.selectedTicketIds.size === 0) return;
    
    const prioritySelect = document.getElementById('priority-select');
    const priority = prioritySelect ? prioritySelect.value : 'normal';

    try {
      for (const ticketId of state.selectedTicketIds) {
        await fetch(`/api/tickets/${state.guildId}/${ticketId}/priority`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority })
        });
      }

      state.selectedTicketIds.clear();
      closePriorityModal();
      await loadTickets();
      renderTickets();
    } catch (e) {
      console.error('Failed to bulk update priority:', e);
    }
  }

  async function selectTicket(ticketId) {
    state.selectedTicketId = ticketId;
    renderTickets();
    
    const container = document.getElementById('ticket-detail');
    if (!container) return;

    const ticket = state.tickets.find(t => t.id === ticketId);
    if (!ticket) {
      container.innerHTML = '<p class="empty-state">Ticket not found</p>';
      return;
    }

    container.innerHTML = `
      <div class="ticket-detail-header">
        <div>
          <h2>Ticket #${ticket.id}</h2>
          <div class="ticket-meta">
            <span class="ticket-priority ${ticket.priority}">${ticket.priority}</span>
            <span class="ticket-department">${ticket.departmentId}</span>
          </div>
        </div>
        <div class="ticket-actions">
          <button class="btn-secondary" onclick="viewTicketHistory(${ticket.id})">View History</button>
          <button class="btn-danger" onclick="closeTicket(${ticket.id})">Close Ticket</button>
        </div>
      </div>
      
      <div class="ticket-info-grid">
        <div class="ticket-info-item">
          <label>User ID</label>
          <span>${ticket.userId}</span>
        </div>
        <div class="ticket-info-item">
          <label>Channel</label>
          <span>${ticket.channelId ? `<code>${ticket.channelId}</code>` : 'N/A'}</span>
        </div>
        <div class="ticket-info-item">
          <label>Created</label>
          <span>${new Date(ticket.createdAt).toLocaleString()}</span>
        </div>
        <div class="ticket-info-item">
          <label>Claimed By</label>
          <span>${ticket.claimedBy || 'Unclaimed'}</span>
        </div>
      </div>
    `;
  }

  async function viewTicketHistory(ticketId) {
    const modal = document.getElementById('ticket-modal');
    const content = document.getElementById('ticket-modal-content');
    
    if (!modal || !content) return;

    content.innerHTML = '<p class="loading">Loading history...</p>';
    modal.style.display = 'flex';

    try {
      const res = await fetch(`/api/tickets/${state.guildId}/${ticketId}`);
      const data = await res.json();
      
      if (!data.history || !data.history.length) {
        content.innerHTML = '<p class="empty-state">No history available</p>';
        return;
      }

      content.innerHTML = `
        <div class="ticket-history">
          ${data.history.map(entry => `
            <div class="history-entry">
              <div class="history-header">
                <span class="history-user">${entry.userId}</span>
                <span class="history-time">${new Date(entry.timestamp).toLocaleString()}</span>
              </div>
              <div class="history-content">${escapeHtml(entry.content || '')}</div>
              ${entry.attachment_urls ? `<div class="history-attachments">${entry.attachment_urls}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      content.innerHTML = '<p class="error">Failed to load ticket history</p>';
    }
  }

  async function closeTicket(ticketId) {
    if (!confirm('Are you sure you want to close this ticket?')) return;

    try {
      await fetch(`/api/tickets/${state.guildId}/${ticketId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Closed via dashboard' })
      });

      await loadTickets();
      renderTickets();
      
      const detail = document.getElementById('ticket-detail');
      if (detail) detail.innerHTML = '<p class="empty-state">Select a ticket to view details</p>';
    } catch (e) {
      console.error('Failed to close ticket:', e);
    }
  }

  function closeTicketModal() {
    const modal = document.getElementById('ticket-modal');
    if (modal) modal.style.display = 'none';
  }

  // ── Logs Functions ──

  async function loadLogs() {
    if (!state.guildId) return;
    
    try {
      const params = new URLSearchParams({
        limit: state.logsLimit,
        offset: state.logsOffset
      });
      
      if (state.logsActionFilter) {
        params.append('action', state.logsActionFilter);
      }
      
      if (state.logsActorFilter) {
        params.append('actor', state.logsActorFilter);
      }
      
      const res = await fetch(`/api/logs/${state.guildId}?${params}`);
      const data = await res.json();
      
      state.logs = data.logs || [];
      state.logsTotal = data.total || 0;
      
      renderLogs();
    } catch (e) {
      console.error('Failed to load logs:', e);
    }
  }

  function renderLogs() {
    const tbody = document.getElementById('logs-tbody');
    if (!tbody) return;

    if (!state.logs.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No logs found</td></tr>';
      updateLogsPagination();
      return;
    }

    tbody.innerHTML = state.logs.map(log => `
      <tr>
        <td>${new Date(log.timestamp).toLocaleString()}</td>
        <td><code>${escapeHtml(log.actor_id || 'unknown')}</code></td>
        <td><span class="log-action">${escapeHtml(log.action)}</span></td>
        <td>${log.target_type ? escapeHtml(log.target_type) : '-'}</td>
        <td>${log.target_id ? `<code>${escapeHtml(log.target_id)}</code>` : '-'}</td>
        <td>${log.details ? `<code class="log-details">${escapeHtml(log.details)}</code>` : '-'}</td>
      </tr>
    `).join('');

    updateLogsPagination();
  }

  function updateLogsPagination() {
    const prevBtn = document.getElementById('log-prev-btn');
    const nextBtn = document.getElementById('log-next-btn');
    const pageInfo = document.getElementById('log-page-info');
    
    if (!prevBtn || !nextBtn || !pageInfo) return;

    const currentPage = Math.floor(state.logsOffset / state.logsLimit) + 1;
    const totalPages = Math.ceil(state.logsTotal / state.logsLimit);
    
    pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1} (${state.logsTotal} total)`;
    
    prevBtn.disabled = state.logsOffset === 0;
    nextBtn.disabled = state.logsOffset + state.logsLimit >= state.logsTotal;
  }

  async function loadLogActionTypes() {
    if (!state.guildId) return;
    
    try {
      const res = await fetch(`/api/logs/${state.guildId}/actions`);
      const actions = await res.json();
      
      const select = document.getElementById('log-action-filter');
      if (!select) return;
      
      select.innerHTML = '<option value="">All Actions</option>' + 
        actions.map(action => `<option value="${escapeHtml(action)}">${escapeHtml(action)}</option>`).join('');
    } catch (e) {
      console.error('Failed to load action types:', e);
    }
  }

  function exportLogs(format) {
    if (!state.logs || state.logs.length === 0) {
      alert('No logs to export');
      return;
    }

    let content, filename, mimeType;

    if (format === 'json') {
      content = JSON.stringify(state.logs, null, 2);
      filename = `audit-logs-${new Date().toISOString().split('T')[0]}.json`;
      mimeType = 'application/json';
    } else if (format === 'csv') {
      const headers = ['Timestamp', 'Actor ID', 'Action', 'Target Type', 'Target ID', 'Details'];
      const rows = state.logs.map(log => [
        log.timestamp,
        log.actor_id,
        log.action,
        log.target_type || '',
        log.target_id || '',
        log.details || ''
      ]);
      
      content = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      
      filename = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
      mimeType = 'text/csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Moderation functions
  async function loadModStats() {
    if (!state.guildId) return;
    try {
      const res = await fetch(`/api/moderation/stats/${state.guildId}`);
      state.modStats = await res.json();
      renderModStats();
    } catch (e) {
      console.error('Failed to load moderation stats:', e);
    }
  }

  function renderModStats() {
    const stats = state.modStats;
    document.getElementById('mod-total-cases').textContent = stats.totalCases || 0;
    document.getElementById('mod-active-bans').textContent = stats.activeBans || 0;
    document.getElementById('mod-total-kicks').textContent = stats.totalKicks || 0;
    document.getElementById('mod-total-warns').textContent = stats.totalWarns || 0;
    document.getElementById('mod-total-mutes').textContent = stats.totalMutes || 0;
    document.getElementById('mod-total-timeouts').textContent = stats.totalTimeouts || 0;
  }

  async function loadModCases() {
    if (!state.guildId) return;
    
    try {
      const params = new URLSearchParams({
        limit: state.modLimit,
        offset: state.modOffset
      });
      
      if (state.modActionFilter) {
        params.append('action', state.modActionFilter);
      }
      
      if (state.modUserFilter) {
        params.append('userId', state.modUserFilter);
      }
      
      if (state.modModeratorFilter) {
        params.append('moderatorId', state.modModeratorFilter);
      }
      
      if (state.modStartDate) {
        params.append('startDate', state.modStartDate);
      }
      
      if (state.modEndDate) {
        params.append('endDate', state.modEndDate);
      }
      
      const res = await fetch(`/api/moderation/cases/${state.guildId}?${params}`);
      const data = await res.json();
      
      state.modCases = data.cases || [];
      state.modTotal = data.total || 0;
      
      renderModCases();
    } catch (e) {
      console.error('Failed to load moderation cases:', e);
    }
  }

  function renderModCases() {
    const tbody = document.getElementById('moderation-tbody');
    if (!tbody) return;

    if (!state.modCases.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No moderation cases found</td></tr>';
      updateModPagination();
      return;
    }

    tbody.innerHTML = state.modCases.map(caseItem => `
      <tr>
        <td>#${caseItem.id}</td>
        <td><span class="mod-action mod-action-${caseItem.action}">${escapeHtml(caseItem.action)}</span></td>
        <td><code>${escapeHtml(caseItem.user_id)}</code></td>
        <td><code>${escapeHtml(caseItem.moderator_id)}</code></td>
        <td>${caseItem.reason ? escapeHtml(caseItem.reason) : '-'}</td>
        <td>${new Date(caseItem.created_at).toLocaleString()}</td>
        <td>
          <button class="btn-icon" onclick="viewCaseDetail(${caseItem.id})" title="View details">👁️</button>
        </td>
      </tr>
    `).join('');

    updateModPagination();
  }

  function updateModPagination() {
    const prevBtn = document.getElementById('mod-prev-btn');
    const nextBtn = document.getElementById('mod-next-btn');
    const pageInfo = document.getElementById('mod-page-info');
    
    if (!prevBtn || !nextBtn || !pageInfo) return;

    const currentPage = Math.floor(state.modOffset / state.modLimit) + 1;
    const totalPages = Math.ceil(state.modTotal / state.modLimit);
    
    pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1} (${state.modTotal} total)`;
    
    prevBtn.disabled = state.modOffset === 0;
    nextBtn.disabled = state.modOffset + state.modLimit >= state.modTotal;
  }

  async function viewCaseDetail(caseId) {
    const modal = document.getElementById('case-detail-modal');
    const content = document.getElementById('case-detail-content');
    
    if (!modal || !content) return;

    content.innerHTML = '<p class="loading">Loading case details...</p>';
    modal.style.display = 'flex';

    try {
      const res = await fetch(`/api/moderation/cases/${state.guildId}/${caseId}`);
      const data = await res.json();
      
      if (data.error) {
        content.innerHTML = `<p class="error">${escapeHtml(data.error)}</p>`;
        return;
      }

      const caseItem = data.case;
      const evidence = data.evidence || [];

      content.innerHTML = `
        <div class="case-detail-header">
          <h3>Case #${caseItem.id}</h3>
          <span class="mod-action mod-action-${caseItem.action}">${escapeHtml(caseItem.action)}</span>
        </div>
        
        <div class="case-detail-info">
          <div class="case-info-row">
            <label>User:</label>
            <code>${escapeHtml(caseItem.user_id)}</code>
          </div>
          <div class="case-info-row">
            <label>Moderator:</label>
            <code>${escapeHtml(caseItem.moderator_id)}</code>
          </div>
          <div class="case-info-row">
            <label>Date:</label>
            <span>${new Date(caseItem.created_at).toLocaleString()}</span>
          </div>
          ${caseItem.duration ? `
          <div class="case-info-row">
            <label>Duration:</label>
            <span>${escapeHtml(caseItem.duration)}</span>
          </div>
          ` : ''}
          ${caseItem.channel_id ? `
          <div class="case-info-row">
            <label>Channel:</label>
            <code>${escapeHtml(caseItem.channel_id)}</code>
          </div>
          ` : ''}
          ${caseItem.message_count ? `
          <div class="case-info-row">
            <label>Messages:</label>
            <span>${caseItem.message_count}</span>
          </div>
          ` : ''}
        </div>
        
        ${caseItem.reason ? `
        <div class="case-detail-section">
          <h4>Reason</h4>
          <p>${escapeHtml(caseItem.reason)}</p>
        </div>
        ` : ''}
        
        ${evidence.length > 0 ? `
        <div class="case-detail-section">
          <h4>Evidence (${evidence.length})</h4>
          <div class="evidence-list">
            ${evidence.map(ev => `
              <div class="evidence-item">
                <div class="evidence-header">
                  <span class="evidence-uploader">By: <code>${escapeHtml(ev.uploaded_by)}</code></span>
                  <span class="evidence-time">${new Date(ev.created_at).toLocaleString()}</span>
                </div>
                ${ev.url ? `<a href="${escapeHtml(ev.url)}" target="_blank" class="evidence-link">${escapeHtml(ev.filename || ev.url)}</a>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
      `;
    } catch (e) {
      content.innerHTML = '<p class="error">Failed to load case details</p>';
    }
  }

  function closeCaseDetailModal() {
    const modal = document.getElementById('case-detail-modal');
    if (modal) modal.style.display = 'none';
  }

  // ── Channels Functions ──

  async function loadChannels() {
    if (!state.guildId) return;
    try {
      const res = await fetch(`/api/channels/${state.guildId}`);
      state.channels = await res.json();
    } catch (e) {
      console.error('Failed to load channels:', e);
    }
  }

  function renderChannelsTree() {
    const container = document.getElementById('channels-tree');
    if (!container) return;

    let channels = state.channels;

    if (state.channelSearchQuery) {
      const q = state.channelSearchQuery.toLowerCase();
      channels = channels.filter(ch => ch.name.toLowerCase().includes(q));
    }
    if (state.channelTypeFilter) {
      channels = channels.filter(ch => String(ch.type) === state.channelTypeFilter);
    }

    if (!channels.length) {
      container.innerHTML = '<p class="empty-state">No channels found</p>';
      return;
    }

    const categories = channels.filter(ch => ch.type === 4);
    const uncategorized = channels.filter(ch => ch.type !== 4 && !ch.parentId);
    
    let html = '';

    for (const cat of categories) {
      const children = channels.filter(ch => ch.parentId === cat.id);
      html += `
        <div class="channel-category" data-category-id="${cat.id}">
          <div class="channel-category-header" onclick="toggleChannelCategory('${cat.id}')">
            <span class="category-icon">&#9660;</span>
            <span class="channel-icon">&#128193;</span>
            <span class="channel-name">${escapeHtml(cat.name)}</span>
          </div>
          <div class="channel-category-children" id="cat-children-${cat.id}">
            ${children.map(ch => renderChannelItem(ch)).join('')}
          </div>
        </div>
      `;
    }

    if (uncategorized.length) {
      html += `
        <div class="channel-category">
          <div class="channel-category-header" onclick="toggleChannelCategory('uncategorized')">
            <span class="category-icon">&#9660;</span>
            <span class="channel-name">Uncategorized</span>
          </div>
          <div class="channel-category-children" id="cat-children-uncategorized">
            ${uncategorized.map(ch => renderChannelItem(ch)).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  function renderChannelItem(ch) {
    const icons = { 0: '#', 2: '&#128264;', 5: '&#128227;', 13: '&#127908;', 15: '&#128172;', 11: '&#128172;', 12: '&#128274;' };
    const icon = icons[ch.type] || '#';
    const selected = state.selectedChannelId === ch.id ? 'selected' : '';
    return `
      <div class="channel-item ${selected}" data-channel-id="${ch.id}">
        <span class="channel-icon" onclick="selectChannel('${ch.id}')">${icon}</span>
        <span class="channel-name" onclick="selectChannel('${ch.id}')">${escapeHtml(ch.name)}</span>
        <span class="channel-type-badge">${escapeHtml(ch.typeName)}</span>
        <button class="copy-id-btn" onclick="copyToClipboard('${ch.id}', event)" title="Copy ID: ${ch.id}">&#128203;</button>
      </div>
    `;
  }

  function toggleChannelCategory(catId) {
    const header = document.querySelector(`[data-category-id="${catId}"] .channel-category-header`) ||
                   document.querySelector(`#cat-children-${catId}`)?.previousElementSibling;
    const children = document.getElementById(`cat-children-${catId}`);
    if (!children) return;
    
    children.classList.toggle('collapsed');
    if (header) header.classList.toggle('collapsed');
  }

  async function selectChannel(channelId) {
    state.selectedChannelId = channelId;
    renderChannelsTree();
    await renderChannelDetail(channelId);
  }

  async function renderChannelDetail(channelId) {
    const container = document.getElementById('channel-detail');
    if (!container) return;

    const channel = state.channels.find(ch => ch.id === channelId);
    if (!channel) {
      container.innerHTML = '<p class="empty-state">Channel not found</p>';
      return;
    }

    const overwrites = channel.permissionOverwrites || [];
    const overwriteHtml = overwrites.length ? overwrites.map(ow => {
      const targetType = ow.type === 0 ? 'role' : 'member';
      const targetName = targetType === 'role' 
        ? (state.roles.find(r => r.id === ow.id)?.name || state.fullRoles.find(r => r.id === ow.id)?.name || ow.id)
        : ow.id;
      return `
        <div class="overwrite-item">
          <div class="overwrite-target">
            <span class="target-type ${targetType}">${targetType}</span>
            <span>${escapeHtml(targetName)}</span>
          </div>
          <div class="overwrite-perms">
            <span class="overwrite-allow" title="Allowed permissions">Allow: ${parseInt(ow.allow).toString(16)}</span>
            <span class="overwrite-deny" title="Denied permissions">Deny: ${parseInt(ow.deny).toString(16)}</span>
          </div>
        </div>
      `;
    }).join('') : '<p class="empty-state">No permission overwrites</p>';

    container.innerHTML = `
      <div class="channel-detail-header">
        <div class="channel-detail-info">
          <h2>${escapeHtml(channel.name)} <button class="copy-id-btn" onclick="copyToClipboard('${channel.id}')" title="Copy ID: ${channel.id}">&#128203;</button></h2>
          <div class="channel-detail-meta">
            <span class="channel-detail-meta-item"><strong>Type:</strong> ${escapeHtml(channel.typeName)}</span>
            ${channel.parentName ? `<span class="channel-detail-meta-item"><strong>Category:</strong> ${escapeHtml(channel.parentName)}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="channel-info-grid">
        <div class="channel-info-item">
          <label>Topic</label>
          <span>${channel.topic ? escapeHtml(channel.topic) : '<em>Not set</em>'}</span>
        </div>
        <div class="channel-info-item">
          <label>Position</label>
          <span>${channel.position}</span>
        </div>
        <div class="channel-info-item">
          <label>NSFW</label>
          <span>${channel.nsfw ? 'Yes' : 'No'}</span>
        </div>
        ${channel.rateLimitPerUser ? `
        <div class="channel-info-item">
          <label>Slowmode</label>
          <span>${channel.rateLimitPerUser}s</span>
        </div>` : ''}
        ${channel.bitrate ? `
        <div class="channel-info-item">
          <label>Bitrate</label>
          <span>${channel.bitrate}kbps</span>
        </div>` : ''}
        ${channel.userLimit ? `
        <div class="channel-info-item">
          <label>User Limit</label>
          <span>${channel.userLimit}</span>
        </div>` : ''}
      </div>

      <div class="channel-overwrites-section">
        <h3>Permission Overwrites (${overwrites.length})</h3>
        <div class="overwrite-list">
          ${overwriteHtml}
        </div>
      </div>
    `;
  }

  function closeChannelModal() {
    const modal = document.getElementById('channel-modal');
    if (modal) {
      modal.style.display = 'none';
      delete modal.dataset.channelId;
    }
  }

  function filterChannels(query) {
    state.channelSearchQuery = query;
    renderChannelsTree();
  }

  function filterChannelsByType(type) {
    state.channelTypeFilter = type;
    renderChannelsTree();
  }

  // ── Full Roles Functions ──

  function renderFullRolesList() {
    const container = document.getElementById('roles-full-list');
    if (!container) return;

    let roles = state.fullRoles.filter(r => r.name !== '@everyone');

    if (state.roleSearchQuery) {
      const q = state.roleSearchQuery.toLowerCase();
      roles = roles.filter(r => r.name.toLowerCase().includes(q));
    }
    if (state.roleFilterType === 'hoisted') {
      roles = roles.filter(r => r.hoist);
    } else if (state.roleFilterType === 'mentionable') {
      roles = roles.filter(r => r.mentionable);
    } else if (state.roleFilterType === 'managed') {
      roles = roles.filter(r => r.managed);
    }

    if (!roles.length) {
      container.innerHTML = '<p class="empty-state">No roles found</p>';
      return;
    }

    container.innerHTML = roles.map(r => `
      <div class="role-full-item ${state.selectedFullRoleId === r.id ? 'selected' : ''}" data-role-id="${r.id}">
        <span class="role-color" style="background: ${r.color || '#99aab5'}" onclick="selectFullRole('${r.id}')"></span>
        <div class="role-info" onclick="selectFullRole('${r.id}')">
          <div class="role-name">${escapeHtml(r.name)}</div>
          <div class="role-meta">${r.memberCount} members &middot; Position ${r.position}</div>
        </div>
        <div class="role-badges">
          ${r.hoist ? '<span class="role-badge hoisted">Hoisted</span>' : ''}
          ${r.mentionable ? '<span class="role-badge mentionable">Mentionable</span>' : ''}
          ${r.managed ? '<span class="role-badge managed">Bot</span>' : ''}
        </div>
        <button class="copy-id-btn" onclick="copyToClipboard('${r.id}', event)" title="Copy ID: ${r.id}">&#128203;</button>
      </div>
    `).join('');
  }

  async function selectFullRole(roleId) {
    state.selectedFullRoleId = roleId;
    renderFullRolesList();
    await renderFullRoleDetail(roleId);
  }

  async function renderFullRoleDetail(roleId) {
    const container = document.getElementById('role-full-detail');
    if (!container) return;

    const role = state.fullRoles.find(r => r.id === roleId);
    if (!role) {
      container.innerHTML = '<p class="empty-state">Role not found</p>';
      return;
    }

    const perms = role.permissionsArray || [];
    const permLabels = perms.map(p => p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
    const permsHtml = permLabels.length 
      ? permLabels.map(p => `<div class="role-perm-item"><span class="perm-icon">&#10003;</span> ${escapeHtml(p)}</div>`).join('')
      : '<p class="empty-state">No special permissions</p>';

    container.innerHTML = `
      <div class="role-full-detail-header">
        <div class="role-full-detail-info">
          <div class="role-color-large" style="background: ${role.color || '#99aab5'}; border-radius: 8px;"></div>
          <div>
            <h2>${escapeHtml(role.name)} <button class="copy-id-btn" onclick="copyToClipboard('${role.id}')" title="Copy ID: ${role.id}">&#128203;</button></h2>
          </div>
        </div>
        <div class="role-full-detail-actions">
          <button class="btn-secondary" onclick="showRoleMembersModal('${role.id}')">View Members</button>
        </div>
      </div>

      <div class="role-info-grid">
        <div class="role-info-item">
          <label>Members</label>
          <span>${role.memberCount}</span>
        </div>
        <div class="role-info-item">
          <label>Position</label>
          <span>${role.position}</span>
        </div>
        <div class="role-info-item">
          <label>Color</label>
          <span>${role.color}</span>
        </div>
        <div class="role-info-item">
          <label>Hoisted</label>
          <span>${role.hoist ? 'Yes' : 'No'}</span>
        </div>
        <div class="role-info-item">
          <label>Mentionable</label>
          <span>${role.mentionable ? 'Yes' : 'No'}</span>
        </div>
        <div class="role-info-item">
          <label>Managed</label>
          <span>${role.managed ? 'Yes' : 'No'}</span>
        </div>
        <div class="role-info-item">
          <label>Created</label>
          <span>${new Date(role.createdAt).toLocaleDateString()}</span>
        </div>
        <div class="role-info-item">
          <label>Editable</label>
          <span>${role.editable ? 'Yes' : 'No'}</span>
        </div>
      </div>

      <div class="role-permissions-section">
        <h3>Permissions (${perms.length})</h3>
        <div class="role-permissions-grid">
          ${permsHtml}
        </div>
      </div>
    `;
  }

  function closeRoleCreateModal() {
    const modal = document.getElementById('role-create-modal');
    if (modal) {
      modal.style.display = 'none';
      delete modal.dataset.roleId;
    }
  }

  async function showRoleMembersModal(roleId) {
    const modal = document.getElementById('role-members-modal');
    const title = document.getElementById('role-members-title');
    const content = document.getElementById('role-members-content');
    
    if (!modal || !title || !content) return;

    const role = state.fullRoles.find(r => r.id === roleId);
    title.textContent = `Members with "${role?.name || 'Role'}"`;
    content.innerHTML = '<p class="loading">Loading members...</p>';
    modal.style.display = 'flex';

    try {
      const res = await fetch(`/api/roles/${state.guildId}/${roleId}/members`);
      const members = await res.json();

      if (!members.length) {
        content.innerHTML = '<p class="empty-state">No members have this role</p>';
        return;
      }

      content.innerHTML = `
        <p style="margin-bottom: 1rem; color: var(--hallows-gray);">${members.length} member(s)</p>
        <div class="role-members-preview">
          ${members.map(m => `
            <div class="role-member-item">
              <img src="${m.avatar}" alt="">
              <span class="member-name">${escapeHtml(m.displayName)}</span>
              <code style="font-size: 0.75rem; color: var(--hallows-gray);">${m.id}</code>
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      content.innerHTML = '<p class="error">Failed to load members</p>';
    }
  }

  function closeRoleMembersModal() {
    const modal = document.getElementById('role-members-modal');
    if (modal) modal.style.display = 'none';
  }

  function filterFullRoles(query) {
    state.roleSearchQuery = query;
    renderFullRolesList();
  }

  function filterRolesByType(type) {
    state.roleFilterType = type;
    renderFullRolesList();
  }

  async function exportModCases(format) {
    if (!state.guildId) return;
    
    try {
      const params = new URLSearchParams();
      
      if (state.modActionFilter) {
        params.append('action', state.modActionFilter);
      }
      
      if (state.modUserFilter) {
        params.append('userId', state.modUserFilter);
      }
      
      if (state.modModeratorFilter) {
        params.append('moderatorId', state.modModeratorFilter);
      }
      
      if (state.modStartDate) {
        params.append('startDate', state.modStartDate);
      }
      
      if (state.modEndDate) {
        params.append('endDate', state.modEndDate);
      }
      
      const res = await fetch(`/api/moderation/export/${state.guildId}?${params}`);
      const cases = await res.json();
      
      if (!cases || cases.length === 0) {
        alert('No cases to export');
        return;
      }

      let content, filename, mimeType;

      if (format === 'json') {
        content = JSON.stringify(cases, null, 2);
        filename = `moderation-cases-${new Date().toISOString().split('T')[0]}.json`;
        mimeType = 'application/json';
      } else if (format === 'csv') {
        const headers = ['ID', 'Action', 'User ID', 'Moderator ID', 'Reason', 'Duration', 'Channel ID', 'Message Count', 'Created At'];
        const rows = cases.map(c => [
          c.id,
          c.action,
          c.user_id,
          c.moderator_id,
          c.reason || '',
          c.duration || '',
          c.channel_id || '',
          c.message_count || '',
          c.created_at
        ]);
        
        content = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        filename = `moderation-cases-${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export moderation cases:', e);
      alert('Failed to export cases');
    }
  }

  // ── Settings Functions ──
  state.settings = {};
  state.levelConfig = {};
  state.levelRewards = [];
  state.starboardConfig = {};
  state.raidConfig = {};
  state.antinukeConfig = {};
  state.counters = [];
  state.autoroles = [];
  state.fakePerms = {};

  async function loadSettings() {
    if (!state.guildId) return;
    try {
      const res = await fetch(`/api/settings/${state.guildId}`);
      state.settings = await res.json();
      renderSettings();
    } catch (e) { console.error('Failed to load settings:', e); }
  }

  function renderSettings() {
    const container = document.getElementById('settings-content');
    if (!container) return;
    container.innerHTML = `
      <div class="settings-card">
        <h3>General</h3>
        <div class="setting-row">
          <label>Command Prefix</label>
          <input type="text" id="s-prefix" value="${escapeHtml(state.settings.prefix || '?')}" maxlength="3" class="setting-input">
          <button class="btn-primary btn-small" onclick="saveSetting('prefix', document.getElementById('s-prefix').value)">Save</button>
        </div>
      </div>
      <div class="settings-card">
        <h3>Moderation Channels</h3>
        <div class="setting-row">
          <label>Modlog Channel ID</label>
          <input type="text" id="s-modlog" value="${escapeHtml(state.settings.modlog_channel || '')}" class="setting-input" placeholder="Channel ID">
          <button class="btn-primary btn-small" onclick="saveSetting('modlog_channel', document.getElementById('s-modlog').value)">Save</button>
        </div>
        <div class="setting-row">
          <label>Documents Evidence Channel ID</label>
          <input type="text" id="s-documents" value="${escapeHtml(state.settings.documents_channel || '')}" class="setting-input" placeholder="Channel ID">
          <button class="btn-primary btn-small" onclick="saveSetting('documents_channel', document.getElementById('s-documents').value)">Save</button>
        </div>
      </div>
      <div class="settings-card">
        <h3>Jail Configuration</h3>
        <div class="setting-row">
          <label>Jail Role ID</label>
          <input type="text" id="s-jail-role" value="${escapeHtml(state.settings.jail_role_id || '')}" class="setting-input" placeholder="Role ID">
          <button class="btn-primary btn-small" onclick="saveSetting('jail_role_id', document.getElementById('s-jail-role').value)">Save</button>
        </div>
        <div class="setting-row">
          <label>Jail Channel ID (for jailed user notifications)</label>
          <input type="text" id="s-jail-channel" value="${escapeHtml(state.settings.jail_channel_id || '')}" class="setting-input" placeholder="Channel ID">
          <button class="btn-primary btn-small" onclick="saveSetting('jail_channel_id', document.getElementById('s-jail-channel').value)">Save</button>
        </div>
      </div>
      <div class="settings-card">
        <h3>Command Aliases (JSON)</h3>
        <p style="color:var(--hallows-gray); font-size:0.85rem; margin-bottom:0.5rem;">Map internal command names to prefix strings (e.g., "claim": "?c"). Changes take effect after restart.</p>
        <textarea id="s-aliases" rows="6" class="setting-input" style="max-width:100%; font-family:monospace; font-size:0.8rem;">${escapeHtml(JSON.stringify((state.settings._command_aliases ? JSON.parse(state.settings._command_aliases) : {}), null, 2))}</textarea>
        <button class="btn-primary btn-small" onclick="saveAliases()" style="margin-top:0.5rem">Save Aliases</button>
      </div>
      <div class="settings-card">
        <h3>Staff Stats</h3>
        <div class="setting-row">
          <label>Excluded Channels (comma-sep IDs)</label>
          <input type="text" id="s-stats-exclude" value="${(state.settings.stats_excluded_channels ? JSON.parse(state.settings.stats_excluded_channels).join(', ') : '')}" class="setting-input" placeholder="123, 456, 789">
          <button class="btn-primary btn-small" onclick="saveStatsExcluded()">Save</button>
        </div>
        <div class="setting-row">
          <label>Success Response (mod actions)</label>
          <input type="text" id="s-success" value="${escapeHtml(state.settings.success_response || '👍')}" maxlength="10" class="setting-input" style="max-width:80px">
          <button class="btn-primary btn-small" onclick="saveSetting('success_response', document.getElementById('s-success').value)">Save</button>
        </div>
      </div>
    `;
  }

  async function saveSetting(key, value) {
    if ((key.endsWith('_channel_id') || key.endsWith('_channel') || key === 'modlog_channel' || key === 'documents_channel') && value && !validateChannelId(value)) {
      showToast('Invalid channel ID format', 'error');
      return;
    }
    if ((key.endsWith('_role_id') || key.endsWith('_role') || key === 'jail_role_id' || key === 'leadCategoryRole') && value && !isValidSnowflake(value.replace(/[<@&>]/g, ''))) {
      showToast('Invalid role ID format', 'error');
      return;
    }
    try {
      await fetch(`/api/settings/${state.guildId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
      state.settings[key] = value;
      // Re-render settings to reflect changes
      renderSettings();
      showToast('Setting saved');
    } catch (e) { showToast('Failed to save', 'error'); }
  }

  function saveAliases() {
    const val = document.getElementById('s-aliases')?.value;
    if (!val) return;
    try {
      JSON.parse(val);
      saveSetting('_command_aliases', val);
    } catch { showToast('Invalid JSON', 'error'); }
  }

  function saveStatsExcluded() {
    const raw = document.getElementById('s-stats-exclude').value;
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    saveSetting('stats_excluded_channels', JSON.stringify(ids));
  }

  // ── Leveling Functions ──
  async function loadLeveling() {
    if (!state.guildId) return;
    try {
      const res = await fetch(`/api/leveling/${state.guildId}`);
      const data = await res.json();
      state.levelConfig = data.config || {};
      state.levelRewards = data.rewards || [];
      renderLeveling();
    } catch (e) { console.error('Failed to load leveling:', e); }
  }

  function renderLeveling() {
    const container = document.getElementById('leveling-content');
    if (!container) return;
    const c = state.levelConfig;
    container.innerHTML = `
      <div class="settings-card">
        <h3>XP Configuration</h3>
        <div class="setting-row">
          <label>Enabled</label>
          <label class="toggle-switch"><input type="checkbox" id="lv-enabled" ${c.enabled ? 'checked' : ''} onchange="saveLevelConfig('enabled', this.checked ? 1 : 0)"><span class="toggle-slider"></span></label>
        </div>
        <div class="setting-row">
          <label>XP per message (min)</label>
          <input type="number" id="lv-xpmin" value="${c.xp_min || 5}" min="1" max="100" class="setting-input" onchange="saveLevelConfig('xp_min', parseInt(this.value))">
        </div>
        <div class="setting-row">
          <label>XP per message (max)</label>
          <input type="number" id="lv-xpmax" value="${c.xp_max || 15}" min="1" max="100" class="setting-input" onchange="saveLevelConfig('xp_max', parseInt(this.value))">
        </div>
        <div class="setting-row">
          <label>Cooldown (seconds)</label>
          <input type="number" id="lv-cooldown" value="${c.cooldown_seconds || 60}" min="5" max="3600" class="setting-input" onchange="saveLevelConfig('cooldown_seconds', parseInt(this.value))">
        </div>
        <div class="setting-row">
          <label>Scaling Factor (higher = slower)</label>
          <input type="number" id="lv-factor" value="${c.scaling_factor || 100}" min="1" max="10000" class="setting-input" onchange="saveLevelConfig('scaling_factor', parseInt(this.value))">
        </div>
        <div class="setting-row">
          <label>Announce Level Up</label>
          <label class="toggle-switch"><input type="checkbox" id="lv-announce" ${c.announce_levelup ? 'checked' : ''} onchange="saveLevelConfig('announce_levelup', this.checked ? 1 : 0)"><span class="toggle-slider"></span></label>
        </div>
        <div class="setting-row">
          <label>Announcement Channel ID</label>
          <input type="text" id="lv-announce-ch" value="${escapeHtml(c.announce_channel_id || '')}" class="setting-input" placeholder="Channel ID">
          <button class="btn-primary btn-small" onclick="saveLevelConfig('announce_channel_id', document.getElementById('lv-announce-ch').value)">Save</button>
        </div>
      </div>
      <div class="settings-card">
        <h3>Level Rewards</h3>
        <div class="form-row">
          <input type="number" id="lr-level" placeholder="Level" min="1" max="500" class="setting-input" style="width:80px">
          <input type="text" id="lr-role" placeholder="Role ID" class="setting-input">
          <button class="btn-primary btn-small" onclick="addLevelReward()">Add Reward</button>
        </div>
        <div id="level-rewards-list">
          ${state.levelRewards.length ? state.levelRewards.map(r => `
            <div class="reward-row">
              <span>Level ${r.level} → <code>${escapeHtml(r.role_id)}</code></span>
              <button class="btn-icon btn-icon-danger" onclick="removeLevelReward(${r.level})" title="Remove">×</button>
            </div>
          `).join('') : '<p class="empty-state">No rewards configured</p>'}
        </div>
      </div>
    `;
  }

  async function saveLevelConfig(key, value) {
    try {
      await fetch(`/api/leveling/${state.guildId}/config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
      showToast('Level config updated');
    } catch (e) { showToast('Failed to save'); }
  }

  async function addLevelReward() {
    const level = parseInt(document.getElementById('lr-level').value);
    const roleId = document.getElementById('lr-role').value.trim();
    if (!level || !roleId) { showToast('Enter level and role ID'); return; }
    try {
      await fetch(`/api/leveling/${state.guildId}/rewards`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, roleId })
      });
      await loadLeveling();
    } catch (e) { showToast('Failed to add reward'); }
  }

  async function removeLevelReward(level) {
    try {
      await fetch(`/api/leveling/${state.guildId}/rewards/${level}`, { method: 'DELETE' });
      await loadLeveling();
    } catch (e) { showToast('Failed to remove reward'); }
  }

  // ── Starboard Functions ──
  async function loadStarboard() {
    if (!state.guildId) return;
    try {
      const res = await fetch(`/api/starboard/${state.guildId}`);
      state.starboardConfig = await res.json();
      renderStarboard();
    } catch (e) { console.error('Failed to load starboard:', e); }
  }

  function renderStarboard() {
    const container = document.getElementById('starboard-content');
    if (!container) return;
    const c = state.starboardConfig;
    container.innerHTML = `
      <div class="settings-card">
        <h3>Starboard Settings</h3>
        <div class="setting-row">
          <label>Enabled</label>
          <label class="toggle-switch"><input type="checkbox" ${c.enabled ? 'checked' : ''} onchange="saveStarboard('enabled', this.checked ? 1 : 0)"><span class="toggle-slider"></span></label>
        </div>
        <div class="setting-row">
          <label>Channel ID</label>
          <input type="text" id="sb-channel" value="${escapeHtml(c.channel_id || '')}" class="setting-input" placeholder="Channel ID">
          <button class="btn-primary btn-small" onclick="saveStarboard('channel_id', document.getElementById('sb-channel').value)">Save</button>
        </div>
        <div class="setting-row">
          <label>Reaction Threshold</label>
          <input type="number" id="sb-threshold" value="${c.threshold || 3}" min="1" max="100" class="setting-input" onchange="saveStarboard('threshold', parseInt(this.value))">
        </div>
        <div class="setting-row">
          <label>Emoji</label>
          <input type="text" id="sb-emoji" value="${escapeHtml(c.emoji || '⭐')}" class="setting-input" maxlength="10" onchange="saveStarboard('emoji', this.value)">
        </div>
      </div>
    `;
  }

  async function saveStarboard(key, value) {
    try {
      await fetch(`/api/starboard/${state.guildId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
      showToast('Starboard updated');
    } catch (e) { showToast('Failed to save'); }
  }

  // ── Security Functions ──
  async function loadSecurity() {
    if (!state.guildId) return;
    try {
      const [raidRes, nukeRes, pbanRes] = await Promise.all([
        fetch(`/api/antiraid/${state.guildId}`),
        fetch(`/api/antinuke/${state.guildId}`),
        fetch(`/api/pban/weights/${state.guildId}`)
      ]);
      state.raidConfig = await raidRes.json();
      state.antinukeConfig = await nukeRes.json();
      state.pbanWeights = await pbanRes.json();
      renderSecurity('antiraid');
    } catch (e) { console.error('Failed to load security:', e); }
  }

  function renderSecurity(tab) {
    const container = document.getElementById('security-content');
    if (!container) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'antiraid') {
      const r = state.raidConfig;
      container.innerHTML = `
        <div class="settings-card">
          <h3>Anti-Raid Configuration</h3>
          <div class="setting-row"><label>Enabled</label><label class="toggle-switch"><input type="checkbox" ${r.enabled ? 'checked' : ''} onchange="saveRaid('enabled', this.checked ? 1 : 0)"><span class="toggle-slider"></span></label></div>
          <div class="setting-row"><label>Join Threshold</label><input type="number" value="${r.join_threshold || 10}" min="1" class="setting-input" onchange="saveRaid('join_threshold', parseInt(this.value))"></div>
          <div class="setting-row"><label>Time Window (seconds)</label><input type="number" value="${r.time_window_seconds || 10}" min="1" class="setting-input" onchange="saveRaid('time_window_seconds', parseInt(this.value))"></div>
          <div class="setting-row"><label>Auto-Lockout (minutes)</label><input type="number" value="${r.auto_lockout_minutes || 15}" min="1" class="setting-input" onchange="saveRaid('auto_lockout_minutes', parseInt(this.value))"></div>
          <div class="setting-row"><label>Whitelisted Roles (IDs, comma-separated)</label><input type="text" value="${(r.whitelist_role_ids || []).join(',')}" class="setting-input" onchange="saveRaid('whitelist_role_ids', this.value.split(',').map(s=>s.trim()).filter(Boolean))"></div>
        </div>`;
    } else if (tab === 'antinuke') {
      const n = state.antinukeConfig;
      container.innerHTML = `
        <div class="settings-card">
          <h3>Anti-Nuke Configuration</h3>
          <div class="setting-row"><label>Enabled</label><label class="toggle-switch"><input type="checkbox" ${n.enabled ? 'checked' : ''} onchange="saveNuke('enabled', this.checked ? 1 : 0)"><span class="toggle-slider"></span></label></div>
          <div class="setting-row"><label>Channel Delete Threshold</label><input type="number" value="${n.channel_delete_threshold || 3}" min="1" class="setting-input" onchange="saveNuke('channel_delete_threshold', parseInt(this.value))"></div>
          <div class="setting-row"><label>Role Delete Threshold</label><input type="number" value="${n.role_delete_threshold || 3}" min="1" class="setting-input" onchange="saveNuke('role_delete_threshold', parseInt(this.value))"></div>
          <div class="setting-row"><label>Ban Add Threshold</label><input type="number" value="${n.ban_add_threshold || 3}" min="1" class="setting-input" onchange="saveNuke('ban_add_threshold', parseInt(this.value))"></div>
          <div class="setting-row"><label>Time Window (seconds)</label><input type="number" value="${n.time_window_seconds || 5}" min="1" class="setting-input" onchange="saveNuke('time_window_seconds', parseInt(this.value))"></div>
          <div class="setting-row"><label>Auto-Unlock (minutes)</label><input type="number" value="${n.auto_lockout_minutes || 30}" min="1" class="setting-input" onchange="saveNuke('auto_lockout_minutes', parseInt(this.value))"></div>
          <div class="setting-row"><label>Action on Trigger</label>
            <select class="setting-input" onchange="saveNuke('action_on_trigger', this.value)">
              <option value="log" ${n.action_on_trigger === 'log' ? 'selected' : ''}>Log Only</option>
              <option value="lockdown" ${n.action_on_trigger === 'lockdown' ? 'selected' : ''}>Lockdown</option>
              <option value="rollback" ${n.action_on_trigger === 'rollback' ? 'selected' : ''}>Lockdown + Rollback</option>
            </select>
          </div>
        </div>`;
    } else if (tab === 'pbanweights') {
      const weights = state.pbanWeights || [];
      container.innerHTML = `
        <div class="settings-card">
          <h3>PBAN Vote Weights</h3>
          <p style="color: var(--hallows-gray); margin-bottom: 1rem;">Set how much each role's vote counts. Weight 6 = passes immediately. Defaults apply if not set here.</p>
          ${weights.length ? weights.map(w => `
            <div class="setting-row">
              <label><@&${w.role_id}> (${escapeHtml(w.label || '')})</label>
              <input type="number" class="setting-input" value="${w.weight}" min="0" max="10" id="pw-${w.role_id}" style="max-width:80px" onchange="updatePbanWeight('${w.role_id}', parseInt(this.value), '${escapeHtml(w.label || '')}')">
              <button class="btn-icon btn-icon-danger" onclick="deletePbanWeight('${w.role_id}')" title="Remove">×</button>
            </div>
          `).join('') : '<p class="empty-state">No custom vote weights configured. All votes use defaults.</p>'}
        </div>
        <div class="settings-card">
          <h4>Add Vote Weight</h4>
          <div class="form-row">
            <input type="text" id="pw-role-id" placeholder="Role ID" class="setting-input">
            <input type="number" id="pw-weight" placeholder="Weight (1-10)" class="setting-input" min="1" max="10" style="max-width:100px">
            <input type="text" id="pw-label" placeholder="Label (optional)" class="setting-input">
            <button class="btn-primary btn-small" onclick="addPbanWeight()">Add</button>
          </div>
        </div>
        <div class="settings-card" style="font-size:0.85rem; color:var(--hallows-gray);">
          <h4>How Weights Work</h4>
          <p>Total vote weight needed to pass a PBAN: <strong>6</strong>. If no custom weight is set, defaults apply (e.g., Mod rank 1 = 3, HR lead = 4, staff = 6). Roles with weight 0 cannot vote. Partnership wing cannot vote by default.</p>
        </div>`;
    }
  }

  async function addPbanWeight() {
    const roleId = document.getElementById('pw-role-id')?.value.trim();
    const weight = parseInt(document.getElementById('pw-weight')?.value, 10);
    const label = document.getElementById('pw-label')?.value.trim() || '';
    if (!roleId || !weight) { showToast('Enter role ID and weight'); return; }
    try {
      await fetch(`/api/pban/weights/${state.guildId}/${roleId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight, label })
      });
      document.getElementById('pw-role-id').value = '';
      document.getElementById('pw-weight').value = '';
      document.getElementById('pw-label').value = '';
      await loadSecurity();
    } catch (e) { showToast('Failed to save'); }
  }

  async function updatePbanWeight(roleId, weight, label) {
    try {
      await fetch(`/api/pban/weights/${state.guildId}/${roleId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight, label })
      });
      showToast('Weight updated');
    } catch (e) { showToast('Failed to update'); }
  }

  async function deletePbanWeight(roleId) {
    if (!confirm('Remove this PBAN vote weight?')) return;
    try {
      await fetch(`/api/pban/weights/${state.guildId}/${roleId}`, { method: 'DELETE' });
      await loadSecurity();
    } catch (e) { showToast('Failed to delete'); }
  }

  async function saveRaid(key, value) {
    try {
      await fetch(`/api/antiraid/${state.guildId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
      showToast('Anti-raid config updated');
    } catch (e) { showToast('Failed to save'); }
  }

  async function saveNuke(key, value) {
    try {
      await fetch(`/api/antinuke/${state.guildId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
      showToast('Anti-nuke config updated');
    } catch (e) { showToast('Failed to save'); }
  }

  // ── Counters Functions ──
  async function loadCounters() {
    if (!state.guildId) return;
    try {
      const res = await fetch(`/api/counters/${state.guildId}`);
      state.counters = await res.json();
      renderCounters();
    } catch (e) { console.error('Failed to load counters:', e); }
  }

  function renderCounters() {
    const container = document.getElementById('counters-content');
    if (!container) return;
    if (!state.counters.length) {
      container.innerHTML = '<p class="empty-state">No counters configured</p>';
      return;
    }
    container.innerHTML = `
      <table class="simple-table">
        <thead><tr><th>Type</th><th>Channel ID</th><th>Name Format</th><th>Actions</th></tr></thead>
        <tbody>${state.counters.map(c => `
          <tr>
            <td><span class="badge">${escapeHtml(c.counter_type)}</span></td>
            <td><code>${escapeHtml(c.channel_id)}</code></td>
            <td>${escapeHtml(c.name || c.format || '{count}')}</td>
            <td><button class="btn-icon btn-icon-danger" onclick="deleteCounter('${c.channel_id}')" title="Delete">×</button></td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  }

  async function deleteCounter(channelId) {
    if (!confirm('Delete this counter?')) return;
    try {
      await fetch(`/api/counters/${state.guildId}/${channelId}`, { method: 'DELETE' });
      await loadCounters();
    } catch (e) { showToast('Failed to delete'); }
  }

  // ── Auto-roles Functions ──
  async function loadAutoroles() {
    if (!state.guildId) return;
    try {
      const res = await fetch(`/api/autoroles/${state.guildId}`);
      state.autoroles = await res.json();
      renderAutoroles();
    } catch (e) { console.error('Failed to load autoroles:', e); }
  }

  function renderAutoroles() {
    const container = document.getElementById('autoroles-content');
    if (!container) return;
    if (!state.autoroles.length) {
      container.innerHTML = '<p class="empty-state">No auto-roles configured</p>';
      return;
    }
    container.innerHTML = `
      <table class="simple-table">
        <thead><tr><th>Role ID</th><th>Actions</th></tr></thead>
        <tbody>${state.autoroles.map(r => `
          <tr>
            <td><code>${escapeHtml(r)}</code></td>
            <td><button class="btn-icon btn-icon-danger" onclick="removeAutorole('${r}')" title="Remove">×</button></td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  }

  async function removeAutorole(roleId) {
    if (!confirm('Remove this auto-role?')) return;
    try {
      await fetch(`/api/autoroles/${state.guildId}/${roleId}`, { method: 'DELETE' });
      await loadAutoroles();
    } catch (e) { showToast('Failed to remove'); }
  }

  // ── Fake Permissions Functions ──
  async function loadFakePerms() {
    if (!state.guildId) return;
    try {
      const res = await fetch(`/api/fake-perms/${state.guildId}`);
      state.fakePerms = await res.json();
      renderFakePerms();
    } catch (e) { console.error('Failed to load fake perms:', e); }
  }

  function renderFakePerms() {
    const container = document.getElementById('fake-perms-content');
    if (!container) return;
    const flags = Object.keys(state.fakePerms);
    if (!flags.length) {
      container.innerHTML = '<p class="empty-state">No fake permissions configured</p><div class="fake-perms-add"><div class="form-row"><select id="fp-flag" class="setting-input"><option value="banMembers">Ban Members</option><option value="kickMembers">Kick Members</option><option value="manageMessages">Manage Messages</option><option value="moderateMembers">Moderate Members</option><option value="manageChannels">Manage Channels</option><option value="manageGuild">Manage Guild</option><option value="administrator">Administrator</option></select><input type="text" id="fp-role" placeholder="Role ID" class="setting-input"><button class="btn-primary btn-small" onclick="grantFakePerm()">Grant</button></div></div>';
      return;
    }
    container.innerHTML = Object.entries(state.fakePerms).map(([flag, roles]) => `
      <div class="permission-card">
        <div class="permission-card-header">
          <strong>${escapeHtml(flag)}</strong>
          <span class="badge">${roles.length} role(s)</span>
        </div>
        <div class="permission-card-body">
          ${roles.map(roleId => `
            <div class="permission-role-item">
              <code>${escapeHtml(roleId)}</code>
              <button class="btn-icon btn-icon-danger" onclick="revokeFakePerm('${flag}','${roleId}')" title="Revoke">×</button>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('') + `
      <div class="fake-perms-add" style="margin-top:1rem">
        <div class="form-row">
          <select id="fp-flag" class="setting-input">
            <option value="banMembers">Ban Members</option>
            <option value="kickMembers">Kick Members</option>
            <option value="manageMessages">Manage Messages</option>
            <option value="moderateMembers">Moderate Members</option>
            <option value="manageChannels">Manage Channels</option>
            <option value="manageGuild">Manage Guild</option>
            <option value="administrator">Administrator</option>
          </select>
          <input type="text" id="fp-role" placeholder="Role ID" class="setting-input">
          <button class="btn-primary btn-small" onclick="grantFakePerm()">Grant</button>
        </div>
      </div>`;
  }

  async function grantFakePerm() {
    const flag = document.getElementById('fp-flag')?.value;
    const roleId = document.getElementById('fp-role')?.value.trim();
    if (!flag || !roleId) { showToast('Select flag and enter role ID'); return; }
    try {
      await fetch(`/api/fake-perms/${state.guildId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag, roleId })
      });
      document.getElementById('fp-role').value = '';
      await loadFakePerms();
    } catch (e) { showToast('Failed to grant'); }
  }

  async function revokeFakePerm(flag, roleId) {
    if (!confirm('Revoke this fake permission from this role?')) return;
    try {
      await fetch(`/api/fake-perms/${state.guildId}/${flag}/${roleId}`, { method: 'DELETE' });
      await loadFakePerms();
    } catch (e) { showToast('Failed to revoke'); }
  }

  // ── Updated init with progressive rendering ──
  const origInit = init;
  init = async function() {
    state.guildId = await getGuildId();
    if (!state.guildId) { showError('Unable to load server data.'); return; }

    window.addEventListener('hashchange', () => {
      const id = window.location.hash.slice(1) || 'overview';
      showSection(id);
    });

    // Phase 1: Stats + recent activity render immediately
    await Promise.all([loadStats(), loadRecentActivity()]);

    // Phase 2: Load everything else in parallel
    try {
      await Promise.all([
        loadNodes().then(() => { renderRolesList(); }),
        loadRoles().then(() => { renderFullRolesList(); }),
        loadWings().then(() => { renderWingsList(); }),
        loadModules().then(() => { renderModules(); }),
        loadTickets().then(() => { renderTickets(); }),
        loadLogActionTypes(),
        loadModStats(),
        loadChannels().then(() => { renderChannelsTree(); }),
        loadLogs(),
        loadModCases()
      ]);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      document.querySelectorAll('section:not(#overview) .loading').forEach(el => {
        el.textContent = '⚠️ Failed to load. Refresh the page to retry.';
      });
    }
    bindEvents();
    setupNavigation();

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        renderSecurity(tab);
      });
    });
    document.getElementById('counter-create-btn')?.addEventListener('click', showCounterModal);
    document.getElementById('counter-refresh-btn')?.addEventListener('click', loadCounters);
    document.getElementById('counter-form')?.addEventListener('submit', handleCounterCreate);
    document.getElementById('autorole-add-btn')?.addEventListener('click', showAutoroleModal);
    document.getElementById('autorole-refresh-btn')?.addEventListener('click', loadAutoroles);
    document.getElementById('autorole-form')?.addEventListener('submit', handleAutoroleAdd);
  };

  function showCounterModal() {
    const modal = document.getElementById('counter-modal');
    if (!modal) return;
    document.getElementById('counter-form').reset();
    const select = document.getElementById('counter-channel');
    select.innerHTML = '<option value="">Select voice channel...</option>' +
      (state.channels || []).filter(c => c.type === 2).map(c =>
        `<option value="${c.id}">${escapeHtml(c.name)}</option>`
      ).join('');
    modal.style.display = 'flex';
  }

  async function handleCounterCreate(e) {
    e.preventDefault();
    const channelId = document.getElementById('counter-channel').value;
    const counterType = document.getElementById('counter-type').value;
    const name = document.getElementById('counter-name').value.trim();
    if (!channelId || !counterType) { showToast('Fill all fields'); return; }
    try {
      await fetch(`/api/counters/${state.guildId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, counterType, name })
      });
      document.getElementById('counter-modal').style.display = 'none';
      await loadCounters();
    } catch (e) { showToast('Failed to create'); }
  }

  function showAutoroleModal() {
    const modal = document.getElementById('autorole-modal');
    if (!modal) return;
    document.getElementById('autorole-form').reset();
    const select = document.getElementById('autorole-select');
    select.innerHTML = '<option value="">Select role...</option>' +
      (state.fullRoles || []).filter(r => r.name !== '@everyone').map(r =>
        `<option value="${r.id}">${escapeHtml(r.name)}</option>`
      ).join('');
    modal.style.display = 'flex';
  }

  async function handleAutoroleAdd(e) {
    e.preventDefault();
    const roleId = document.getElementById('autorole-select').value;
    if (!roleId) { showToast('Select a role'); return; }
    try {
      await fetch(`/api/autoroles/${state.guildId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId })
      });
      document.getElementById('autorole-modal').style.display = 'none';
      await loadAutoroles();
    } catch (e) { showToast('Failed to add'); }
  }

  return { 
    init,
    showAddWingModal, editWing, deleteWing,
    showAddRoleModal, editWingRole, removeWingRole,
    toggleModule, showModuleDetail, closeModuleDetailModal,
    viewTicketHistory, closeTicket, closeTicketModal,
    loadLogs, loadLogActionTypes, showSection, exportLogs,
    closePriorityModal, applyBulkPriority, filterWings,
    viewCaseDetail, closeCaseDetailModal, exportModCases,
    selectChannel, toggleChannelCategory, filterChannels, filterChannelsByType,
    selectFullRole, showRoleMembersModal, closeRoleMembersModal,
    filterFullRoles, filterRolesByType, copyToClipboard,
    loadSettings, saveSetting, saveStatsExcluded, saveAliases,
    loadLeveling, saveLevelConfig, addLevelReward, removeLevelReward,
    loadStarboard, saveStarboard,
    loadSecurity, saveRaid, saveNuke, addPbanWeight, updatePbanWeight, deletePbanWeight,
    loadCounters, deleteCounter,
    loadAutoroles, removeAutorole,
    loadFakePerms, grantFakePerm, revokeFakePerm,
    editWingRolePerms, saveRoleFakePerms
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  Hallows.init();
});

function closeAuditModal() {
  const modal = document.getElementById('audit-modal');
  if (modal) modal.style.display = 'none';
}

function closeWingModal() {
  const modal = document.getElementById('wing-modal');
  if (modal) modal.style.display = 'none';
}

function closeRoleModal() {
  const modal = document.getElementById('role-modal');
  if (modal) modal.style.display = 'none';
}

function showAddWingModal() {
  Hallows.showAddWingModal && Hallows.showAddWingModal();
}

function editWing(wingId) {
  Hallows.editWing && Hallows.editWing(wingId);
}

function deleteWing(wingId) {
  Hallows.deleteWing && Hallows.deleteWing(wingId);
}

function showAddRoleModal(wingId) {
  Hallows.showAddRoleModal && Hallows.showAddRoleModal(wingId);
}

function editWingRole(wingId, roleId) {
  Hallows.editWingRole && Hallows.editWingRole(wingId, roleId);
}

function removeWingRole(wingId, roleId) {
  Hallows.removeWingRole && Hallows.removeWingRole(wingId, roleId);
}

function closeModuleDetailModal() {
  Hallows.closeModuleDetailModal && Hallows.closeModuleDetailModal();
}

function viewTicketHistory(ticketId) {
  Hallows.viewTicketHistory && Hallows.viewTicketHistory(ticketId);
}

function closeTicket(ticketId) {
  Hallows.closeTicket && Hallows.closeTicket(ticketId);
}

function closeTicketModal() {
  Hallows.closeTicketModal && Hallows.closeTicketModal();
}

function showSection(sectionId) {
  Hallows.showSection && Hallows.showSection(sectionId);
}

function exportLogs(format) {
  Hallows.exportLogs && Hallows.exportLogs(format);
}

function closePriorityModal() {
  Hallows.closePriorityModal && Hallows.closePriorityModal();
}

function applyBulkPriority() {
  Hallows.applyBulkPriority && Hallows.applyBulkPriority();
}

function viewCaseDetail(caseId) {
  Hallows.viewCaseDetail && Hallows.viewCaseDetail(caseId);
}

function closeCaseDetailModal() {
  Hallows.closeCaseDetailModal && Hallows.closeCaseDetailModal();
}

function exportModCases(format) {
  Hallows.exportModCases && Hallows.exportModCases(format);
}

function selectChannel(channelId) {
  Hallows.selectChannel && Hallows.selectChannel(channelId);
}

function toggleChannelCategory(catId) {
  Hallows.toggleChannelCategory && Hallows.toggleChannelCategory(catId);
}

function selectFullRole(roleId) {
  Hallows.selectFullRole && Hallows.selectFullRole(roleId);
}

function showRoleMembersModal(roleId) {
  Hallows.showRoleMembersModal && Hallows.showRoleMembersModal(roleId);
}

function closeRoleMembersModal() {
  Hallows.closeRoleMembersModal && Hallows.closeRoleMembersModal();
}

function copyToClipboard(text, event) {
  Hallows.copyToClipboard && Hallows.copyToClipboard(text, event);
}

// Settings/Leveling/Starboard globals
function saveSetting(key, value) { Hallows.saveSetting && Hallows.saveSetting(key, value); }
function saveLevelConfig(key, value) { Hallows.saveLevelConfig && Hallows.saveLevelConfig(key, value); }
function addLevelReward() { Hallows.addLevelReward && Hallows.addLevelReward(); }
function removeLevelReward(level) { Hallows.removeLevelReward && Hallows.removeLevelReward(level); }
function saveStarboard(key, value) { Hallows.saveStarboard && Hallows.saveStarboard(key, value); }
function saveRaid(key, value) { Hallows.saveRaid && Hallows.saveRaid(key, value); }
function saveNuke(key, value) { Hallows.saveNuke && Hallows.saveNuke(key, value); }
function deleteCounter(channelId) { Hallows.deleteCounter && Hallows.deleteCounter(channelId); }
function closeCounterModal() { document.getElementById('counter-modal') && (document.getElementById('counter-modal').style.display = 'none'); }
function removeAutorole(roleId) { Hallows.removeAutorole && Hallows.removeAutorole(roleId); }
function closeAutoroleModal() { document.getElementById('autorole-modal') && (document.getElementById('autorole-modal').style.display = 'none'); }
function grantFakePerm() { Hallows.grantFakePerm && Hallows.grantFakePerm(); }
function revokeFakePerm(flag, roleId) { Hallows.revokeFakePerm && Hallows.revokeFakePerm(flag, roleId); }
function editWingRolePerms(wingId, roleId) { Hallows.editWingRolePerms && Hallows.editWingRolePerms(wingId, roleId); }
function saveRoleFakePerms(wingId, roleId) { Hallows.saveRoleFakePerms && Hallows.saveRoleFakePerms(wingId, roleId); }
function saveStatsExcluded() { Hallows.saveStatsExcluded && Hallows.saveStatsExcluded(); }
function addPbanWeight() { Hallows.addPbanWeight && Hallows.addPbanWeight(); }
function updatePbanWeight(roleId, weight, label) { Hallows.updatePbanWeight && Hallows.updatePbanWeight(roleId, weight, label); }
function deletePbanWeight(roleId) { Hallows.deletePbanWeight && Hallows.deletePbanWeight(roleId); }