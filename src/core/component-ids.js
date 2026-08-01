import config from './config.js';

export function getSupportPanelButtonId() {
  return config.supportPanel.buttonId;
}

export const COMPONENT_IDS = {
  get SUPPORT_PANEL_BUTTON() { return config.supportPanel.buttonId; },
  DEPARTMENT_SELECT: 'modmail_department',
  STAFF_BREAK_APPROVE: 'staff_break_approve',
  STAFF_BREAK_DENY: 'staff_break_deny',
  STAFF_BREAK_REQUEST_MODAL: 'staff_break_request_modal',
  PBAN_CLEANUP: 'pban_cleanup',
  PBAN_VOTE: 'pban_vote',
  PBAN_ABSTAIN: 'pban_abstain'
};

export const PREFIXES = {
  STAFF_BREAK: 'staff_break_',
  PBAN: 'pban_'
};
