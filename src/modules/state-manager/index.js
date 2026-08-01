export default {
  name: 'state-manager',
  version: '1.0.0',
  requires: [],
  prefixCommands: [
    { command: 'state', handler: './handler.js', permission: 'staff.breaks.manage' }
  ],
  slashCommands: [],
  componentHandlers: {
    'state_flush_category': './handler.js',
    'state_flush_all': './handler.js',
    'state_back': './handler.js',
    'state_show_category': './handler.js',
    'state_page_category': './handler.js',
    'state_refresh_category': './handler.js',
    'state_select_entry': './handler.js'
  },
  components: {
    buttons: ['state_flush_category', 'state_flush_all', 'state_back', 'state_show_category', 'state_page_category', 'state_refresh_category'],
    selectMenus: ['state_select_entry'],
    modals: []
  },
  stateTables: [],
  onLoad: async (core) => {},
  onReady: async (core) => {}
};
