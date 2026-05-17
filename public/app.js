import { api } from './api.js';
import { escapeHtml, formatDate } from './format.js';

const state = {
  accounts: [],
  selectedAccount: null,
  memory: null,
  selectedIssueId: null,
  selectedIssueIds: new Set(),
  issuePreview: null,
  requestToken: 0,
};

const els = {
  systemStatus: document.getElementById('systemStatus'),
  importButton: document.getElementById('importButton'),
  accountList: document.getElementById('accountList'),
  accountTitle: document.getElementById('accountTitle'),
  accountMeta: document.getElementById('accountMeta'),
  scoreStrip: document.getElementById('scoreStrip'),
  loadLedgerButton: document.getElementById('loadLedgerButton'),
  createIssuesButton: document.getElementById('createIssuesButton'),
  dryRunButton: document.getElementById('dryRunButton'),
  toolbarMessage: document.getElementById('toolbarMessage'),
  issueSafetyStrip: document.getElementById('issueSafetyStrip'),
  issueCount: document.getElementById('issueCount'),
  issueList: document.getElementById('issueList'),
  detailRisk: document.getElementById('detailRisk'),
  detailContent: document.getElementById('detailContent'),
  guardPanel: document.getElementById('guardPanel'),
  answerPanel: document.getElementById('answerPanel'),
  timelinePanel: document.getElementById('timelinePanel'),
  activityLog: document.getElementById('activityLog'),
};

els.importButton.addEventListener('click', importGbrain);
els.loadLedgerButton.addEventListener('click', loadMemory);
els.dryRunButton.addEventListener('click', previewIssues);
els.createIssuesButton.addEventListener('click', createIssues);

await boot();

async function boot() {
  await Promise.all([loadAccounts(), loadHealth()]);
  if (state.accounts.length) selectAccount(state.accounts[0].accountSlug);
}

async function loadHealth() {
  try {
    const health = await api('/api/health');
    const ghOk = health.github?.auth?.ok;
    const gbOk = health.gbrain?.ok && health.gbrain?.stdout?.includes('"connection","status":"ok"');
    setStatus(ghOk && gbOk ? 'ok' : 'pending', ghOk && gbOk ? 'GBrain and GitHub ready' : 'GBrain/GitHub connected with warnings');
  } catch (error) {
    setStatus('error', error.message);
  }
}

async function loadAccounts() {
  const data = await api('/api/accounts');
  state.accounts = data.accounts;
  renderAccounts();
  if (data.importManifest) {
    log(`Imported ${data.importManifest.importedCount} GBrain pages at ${formatDate(data.importManifest.importedAt)}.`);
  }
}

function renderAccounts() {
  els.accountList.innerHTML = '';
  for (const account of state.accounts) {
    const button = document.createElement('button');
    button.className = `account-button${state.selectedAccount?.accountSlug === account.accountSlug ? ' active' : ''}`;
    button.type = 'button';
    button.innerHTML = `<strong>${escapeHtml(account.accountName)}</strong><span>${escapeHtml(account.scenarioType)} · ${account.importedPages || 0} GBrain pages</span>`;
    button.addEventListener('click', () => selectAccount(account.accountSlug));
    els.accountList.appendChild(button);
  }
}

function selectAccount(accountSlug) {
  state.requestToken += 1;
  state.selectedAccount = state.accounts.find((account) => account.accountSlug === accountSlug);
  state.memory = null;
  state.selectedIssueId = null;
  state.selectedIssueIds.clear();
  state.issuePreview = null;
  renderAll();
}

function renderAll() {
  renderAccounts();
  renderHeader();
  renderIssues();
  renderDetail();
  renderMemoryRail();
  renderSafetyStrip();
  setBusy(false, '');
}

function renderHeader() {
  const account = state.selectedAccount;
  const summary = state.memory?.summary || {};
  els.accountTitle.textContent = account ? account.accountName : 'Select an account';
  els.accountMeta.textContent = account
    ? `${account.industry} · ${account.primaryDemoMoment} · ${account.importedPages || 0} imported pages`
    : 'Import the sales-system corpus, then extract promise debt from GBrain.';
  els.scoreStrip.innerHTML = `
    <div><strong>${summary.developerIssueCount || 0}</strong><span>issues</span></div>
    <div><strong>${summary.criticalCount || 0}</strong><span>critical</span></div>
    <div><strong>${summary.sourcePages || 0}</strong><span>sources</span></div>
  `;
}

async function importGbrain() {
  setBusy(true, 'Importing all mock data into GBrain. This can take a minute.');
  try {
    const result = await api('/api/import', { method: 'POST' });
    log(`GBrain import finished: ${result.importedCount}/${result.totalFiles} files imported.`);
    await loadAccounts();
    await loadHealth();
  } catch (error) {
    log(`Import failed: ${error.message}`);
  } finally {
    setBusy(false, '');
  }
}

async function loadMemory() {
  if (!state.selectedAccount) return;
  const accountSlug = state.selectedAccount.accountSlug;
  const token = state.requestToken + 1;
  state.requestToken = token;
  state.issuePreview = null;
  setBusy(true, `Extracting ${state.selectedAccount.accountName} account memory from GBrain.`);
  try {
    const memory = await api(`/api/accounts/${encodeURIComponent(accountSlug)}/memory`);
    if (token !== state.requestToken || accountSlug !== state.selectedAccount?.accountSlug) return;
    state.memory = memory;
    state.selectedIssueIds = new Set(memory.ledger.obligations.map((item) => item.id));
    state.selectedIssueId = memory.ledger.obligations[0]?.id || null;
    log(`Extracted ${memory.summary.developerIssueCount} issues, ${memory.timeline.length} timeline events, ${memory.guardResults.length} Guard checks.`);
    renderAll();
  } catch (error) {
    if (token === state.requestToken) log(`Extraction failed: ${error.message}`);
  } finally {
    if (token === state.requestToken) setBusy(false, '');
  }
}

function renderIssues() {
  const issues = state.memory?.ledger?.obligations || [];
  els.issueCount.textContent = issues.length ? `${issues.length} extracted` : 'No extracted issues';
  els.issueList.innerHTML = '';

  if (!issues.length) {
    els.issueList.innerHTML = '<p class="empty-state" style="padding:14px;">No issue queue yet.</p>';
    return;
  }

  for (const issue of issues) {
    const item = document.createElement('div');
    item.className = `issue-item${state.selectedIssueId === issue.id ? ' active' : ''}`;
    item.innerHTML = `
      <input type="checkbox" ${state.selectedIssueIds.has(issue.id) ? 'checked' : ''} aria-label="Select issue">
      <div>
        <div class="issue-title">
          <strong>${escapeHtml(issue.title)}</strong>
          <span class="risk ${issue.risk}">${escapeHtml(issue.risk)}</span>
        </div>
        <p class="issue-summary">${escapeHtml(issue.summary)}</p>
        <div class="flag-row">${issue.flags.map((flag) => `<span class="flag">${escapeHtml(flag)}</span>`).join('')}</div>
      </div>
    `;
    item.addEventListener('click', (event) => {
      if (event.target.tagName === 'INPUT') return;
      state.selectedIssueId = issue.id;
      renderIssues();
      renderDetail();
    });
    item.querySelector('input').addEventListener('change', (event) => {
      if (event.target.checked) state.selectedIssueIds.add(issue.id);
      else state.selectedIssueIds.delete(issue.id);
      state.issuePreview = null;
      renderIssues();
      renderSafetyStrip();
      setBusy(false, '');
    });
    els.issueList.appendChild(item);
  }
}

function renderDetail() {
  const issue = state.memory?.ledger?.obligations?.find((item) => item.id === state.selectedIssueId);
  if (!issue) {
    els.detailRisk.textContent = 'No selection';
    els.detailContent.innerHTML = '<p class="empty-state">Select an extracted promise-debt item to inspect the exact GitHub issue body and source evidence.</p>';
    return;
  }

  els.detailRisk.textContent = `${issue.risk.toUpperCase()} · ${issue.termLabel}`;
  els.detailContent.innerHTML = `
    <h4>Developer task</h4>
    <p>${escapeHtml(issue.developerAction)}</p>
    <h4>Promise evidence</h4>
    ${renderEvidence(issue.sourceEvidence)}
    <h4>Conflicting or limiting evidence</h4>
    ${renderEvidence(issue.conflictingEvidence)}
    <h4>GitHub issue body</h4>
    <pre class="issue-body">${escapeHtml(issue.githubBody)}</pre>
  `;
}

function renderMemoryRail() {
  renderGuardPanel();
  renderAnswerPanel();
  renderTimelinePanel();
}

function renderGuardPanel() {
  const results = state.memory?.guardResults || [];
  if (!results.length) {
    els.guardPanel.innerHTML = '<div class="memory-panel-title">Promise Guard</div><p class="empty-state">Extract account memory to evaluate outbound drafts.</p>';
    return;
  }
  els.guardPanel.innerHTML = `
    <div class="memory-panel-title">Promise Guard</div>
    ${results.map((result) => `
      <div class="guard-result">
        <span class="status-chip ${result.decision === 'block' ? 'blocked' : 'safe'}">${result.decision === 'block' ? 'Blocked' : 'Safe'}</span>
        <strong>${escapeHtml(result.subject)}</strong>
        <p>${result.blockedClaims.length ? `${result.blockedClaims.length} unsupported claim(s) found.` : 'No unsupported claims found.'}</p>
        ${result.blockedClaims.map(renderBlockedClaim).join('')}
      </div>
    `).join('')}
  `;
}

function renderBlockedClaim(claim) {
  return `
    <div class="blocked-claim">
      <p>${escapeHtml(claim.text)}</p>
      ${renderGithubIssueState(claim.githubIssueState)}
      <p><strong>Safe wording:</strong> ${escapeHtml(claim.safeAlternative || 'Use source-backed wording before sending this draft.')}</p>
      <div class="citation-row">${(claim.conflictingSourceIds || []).slice(0, 3).map((sourceId) => `<span class="citation">${escapeHtml(sourceId)}</span>`).join('')}</div>
    </div>
  `;
}

function renderGithubIssueState(issueState) {
  if (!issueState) return '';
  const issue = issueState.issue;
  const issueLink = issue?.url
    ? `<a href="${escapeHtml(issue.url)}" target="_blank" rel="noreferrer">#${escapeHtml(issue.number)} ${escapeHtml(issue.title || 'GitHub issue')}</a>`
    : '';
  const duplicateCopy = issueState.duplicateCount > 1
    ? `<span class="citation">${issueState.duplicateCount} duplicate issues</span>`
    : '';
  const errorCopy = issueState.status === 'unavailable' && issueState.errorCode
    ? `<span class="citation">${escapeHtml(issueState.errorCode)}</span>`
    : '';

  return `
    <div class="engineering-status">
      <span class="status-chip ${githubIssueStatusClass(issueState.status)}">${escapeHtml(issueState.engineeringStatus || 'GitHub status unknown')}</span>
      ${issueLink}
      ${duplicateCopy}
      ${errorCopy}
    </div>
  `;
}

function githubIssueStatusClass(status) {
  if (status === 'closed_approved_with_wording') return 'safe';
  if (status === 'closed_not_supported') return 'critical';
  return 'warn';
}

function renderAnswerPanel() {
  const answer = state.memory?.presetAnswers?.[0];
  if (!answer) {
    els.answerPanel.innerHTML = '<div class="memory-panel-title">Account Q&A</div><p class="empty-state">What do we owe Acme before kickoff?</p>';
    return;
  }
  els.answerPanel.innerHTML = `
    <div class="memory-panel-title">Account Q&A</div>
    <strong>${escapeHtml(answer.question)}</strong>
    ${answer.bullets.map((bullet) => `
      <div class="answer-bullet">
        <span class="status-chip ${bullet.risk === 'critical' ? 'critical' : 'warn'}">${escapeHtml(bullet.risk)}</span>
        <p>${escapeHtml(bullet.text)}</p>
        <div class="citation-row">${bullet.citations.slice(0, 3).map((item) => `<span class="citation">${escapeHtml(item.sourceId)}</span>`).join('')}</div>
      </div>
    `).join('')}
  `;
}

function renderTimelinePanel() {
  const events = state.memory?.timeline || [];
  if (!events.length) {
    els.timelinePanel.innerHTML = '<div class="memory-panel-title">Source timeline</div><p class="empty-state">Timeline appears after extraction.</p>';
    return;
  }
  els.timelinePanel.innerHTML = `
    <div class="memory-panel-title">Source timeline</div>
    ${events.slice(0, 8).map((event) => `
      <div class="timeline-event">
        <span class="status-chip ${event.eventKind === 'conflict' ? 'critical' : event.eventKind === 'support' ? 'safe' : 'warn'}">${escapeHtml(event.eventKind)}</span>
        <strong>${escapeHtml(event.date)}</strong>
        <p>${escapeHtml(event.summary)}</p>
        <div class="citation-row"><span class="citation">${escapeHtml(event.sourceId)}</span></div>
      </div>
    `).join('')}
  `;
}

function renderEvidence(items) {
  if (!items.length) return '<p class="empty-state">No evidence found.</p>';
  return `<div class="evidence-list">${items.map((item) => `
    <div class="evidence">
      <strong>${escapeHtml(item.sourceId)} · ${escapeHtml(item.locator || '')}</strong>
      <p>${escapeHtml(item.quote)}</p>
    </div>
  `).join('')}</div>`;
}

async function previewIssues() {
  if (!state.selectedAccount || !state.memory) return;
  const issueIds = [...state.selectedIssueIds];
  if (!issueIds.length) return;
  setBusy(true, 'Previewing GitHub issue creation and freezing selected plan.');
  try {
    state.issuePreview = await api(`/api/accounts/${encodeURIComponent(state.selectedAccount.accountSlug)}/issues/preview`, {
      method: 'POST',
      body: JSON.stringify({ issueIds }),
    });
    renderSafetyStrip();
    log(`Previewed ${state.issuePreview.selectedCount} GitHub issue(s); frozen token ${state.issuePreview.frozenPlanToken}.`);
  } catch (error) {
    state.issuePreview = null;
    renderSafetyStrip(error);
    log(`Issue preview failed: ${error.message}`);
  } finally {
    setBusy(false, '');
  }
}

async function createIssues() {
  if (!state.selectedAccount || !state.issuePreview?.nonce) return;
  const ok = window.confirm(`Create ${state.issuePreview.selectedCount} real GitHub issue(s) in ${state.issuePreview.repo}?`);
  if (!ok) return;

  setBusy(true, 'Creating exact frozen GitHub issue plan.');
  try {
    const result = await api(`/api/accounts/${encodeURIComponent(state.selectedAccount.accountSlug)}/issues/create`, {
      method: 'POST',
      body: JSON.stringify({ nonce: state.issuePreview.nonce }),
    });
    const lines = result.results.map((item) => {
      if (item.status === 'created') return `Created: <a href="${item.url}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>`;
      if (item.status === 'exists') return `Already exists: <a href="${item.issue.url}" target="_blank" rel="noreferrer">#${item.issue.number} ${escapeHtml(item.issue.title)}</a>`;
      return `${escapeHtml(item.status)}: ${escapeHtml(item.title || item.obligationId)}`;
    });
    state.issuePreview = null;
    renderSafetyStrip();
    log(lines.join('<br>'));
  } catch (error) {
    log(`Issue creation failed: ${error.message}`);
    state.issuePreview = null;
    renderSafetyStrip(error);
  } finally {
    setBusy(false, '');
  }
}

function renderSafetyStrip(error = null) {
  const selectedCount = state.selectedIssueIds.size;
  if (error) {
    els.issueSafetyStrip.classList.remove('empty');
    els.issueSafetyStrip.innerHTML = `
      <div><strong>GitHub safety error</strong><span>${escapeHtml(error.message)}</span></div>
      <div><strong>${selectedCount} selected</strong><span>Plan not frozen</span></div>
      <div><strong>Create disabled</strong><span>Preview required</span></div>
      <div><strong>Duplicates unknown</strong><span>Check failed</span></div>
      <div><strong>No token</strong><span>${escapeHtml(error.code || 'ERROR')}</span></div>
    `;
    return;
  }

  if (!state.issuePreview) {
    els.issueSafetyStrip.classList.add('empty');
    els.issueSafetyStrip.innerHTML = `
      <div><strong>Target repo</strong><span>Preview issue creation to freeze a plan.</span></div>
      <div><strong>${selectedCount} selected</strong><span>${selectedCount ? 'Ready to preview' : 'Select at least one issue'}</span></div>
      <div><strong>Dry run required</strong><span>Real create disabled</span></div>
      <div><strong>Duplicates unchecked</strong><span>Waiting for preview</span></div>
      <div><strong>No token</strong><span>Frozen plan missing</span></div>
    `;
    return;
  }

  const duplicateCount = state.issuePreview.results.filter((item) => item.status === 'exists').length;
  els.issueSafetyStrip.classList.remove('empty');
  els.issueSafetyStrip.innerHTML = `
    <div><strong>${escapeHtml(state.issuePreview.repo)}</strong><span>target repo</span></div>
    <div><strong>${state.issuePreview.selectedCount} selected</strong><span>frozen issue plan</span></div>
    <div><strong>Dry run ready</strong><span>real create enabled</span></div>
    <div><strong>${duplicateCount ? `${duplicateCount} duplicate(s)` : 'No duplicates'}</strong><span>checked now</span></div>
    <div><strong>${escapeHtml(state.issuePreview.frozenPlanToken)}</strong><span>frozen token</span></div>
  `;
}

function setStatus(kind, message) {
  const dot = els.systemStatus.querySelector('.dot');
  dot.className = `dot ${kind === 'ok' ? '' : kind}`;
  els.systemStatus.querySelector('span:last-child').textContent = message;
}

function setBusy(isBusy, message) {
  const hasSelection = state.selectedIssueIds.size > 0;
  els.importButton.disabled = isBusy;
  els.loadLedgerButton.disabled = isBusy || !state.selectedAccount;
  els.dryRunButton.disabled = isBusy || !state.memory || !hasSelection;
  els.createIssuesButton.disabled = isBusy || !state.issuePreview?.nonce;
  els.toolbarMessage.textContent = message;
}

function log(message) {
  const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  els.activityLog.innerHTML = `<strong>${time}</strong> ${message}<br>${els.activityLog.innerHTML}`;
}
