const state = {
  accounts: [],
  selectedAccount: null,
  ledger: null,
  selectedIssueId: null,
  selectedIssueIds: new Set(),
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
  issueCount: document.getElementById('issueCount'),
  issueList: document.getElementById('issueList'),
  detailRisk: document.getElementById('detailRisk'),
  detailContent: document.getElementById('detailContent'),
  activityLog: document.getElementById('activityLog'),
};

els.importButton.addEventListener('click', importGbrain);
els.loadLedgerButton.addEventListener('click', loadLedger);
els.createIssuesButton.addEventListener('click', () => createIssues(false));
els.dryRunButton.addEventListener('click', () => createIssues(true));

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
  state.selectedAccount = state.accounts.find((account) => account.accountSlug === accountSlug);
  state.ledger = null;
  state.selectedIssueId = null;
  state.selectedIssueIds.clear();
  renderAccounts();
  renderHeader();
  renderIssues();
  renderDetail();
}

function renderHeader() {
  const account = state.selectedAccount;
  els.accountTitle.textContent = account ? account.accountName : 'Select an account';
  els.accountMeta.textContent = account
    ? `${account.industry} · ${account.primaryDemoMoment} · ${account.importedPages || 0} imported pages`
    : 'Import the sales-system corpus, then extract promise debt from GBrain.';
  const summary = state.ledger?.summary || {};
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

async function loadLedger() {
  if (!state.selectedAccount) return;
  setBusy(true, `Extracting ${state.selectedAccount.accountName} promise debt from GBrain.`);
  try {
    state.ledger = await api(`/api/accounts/${encodeURIComponent(state.selectedAccount.accountSlug)}/ledger`);
    state.selectedIssueIds = new Set(state.ledger.obligations.map((item) => item.id));
    state.selectedIssueId = state.ledger.obligations[0]?.id || null;
    log(`Extracted ${state.ledger.summary.developerIssueCount} GitHub-ready issues from ${state.ledger.summary.sourcePages} GBrain pages.`);
    renderHeader();
    renderIssues();
    renderDetail();
  } catch (error) {
    log(`Extraction failed: ${error.message}`);
  } finally {
    setBusy(false, '');
  }
}

function renderIssues() {
  const issues = state.ledger?.obligations || [];
  els.issueCount.textContent = issues.length ? `${issues.length} extracted` : 'No extracted issues';
  els.issueList.innerHTML = '';
  els.createIssuesButton.disabled = issues.length === 0 || state.selectedIssueIds.size === 0;
  els.dryRunButton.disabled = issues.length === 0 || state.selectedIssueIds.size === 0;

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
      renderIssues();
    });
    els.issueList.appendChild(item);
  }
}

function renderDetail() {
  const issue = state.ledger?.obligations?.find((item) => item.id === state.selectedIssueId);
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

function renderEvidence(items) {
  if (!items.length) return '<p class="empty-state">No evidence found.</p>';
  return `<div class="evidence-list">${items.map((item) => `
    <div class="evidence">
      <strong>${escapeHtml(item.sourceId)} · ${escapeHtml(item.locator || '')}</strong>
      <p>${escapeHtml(item.quote)}</p>
    </div>
  `).join('')}</div>`;
}

async function createIssues(dryRun) {
  if (!state.selectedAccount || !state.ledger) return;
  const issueIds = [...state.selectedIssueIds];
  if (!issueIds.length) return;
  if (!dryRun) {
    const ok = window.confirm(`Create ${issueIds.length} real GitHub issue(s) in vsrikar08/promise-ledger?`);
    if (!ok) return;
  }

  setBusy(true, dryRun ? 'Previewing GitHub issue creation.' : 'Creating GitHub issues.');
  try {
    const result = await api(`/api/accounts/${encodeURIComponent(state.selectedAccount.accountSlug)}/issues`, {
      method: 'POST',
      body: JSON.stringify({ issueIds, dryRun }),
    });
    const lines = result.results.map((item) => {
      if (item.status === 'created') return `Created: <a href="${item.url}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>`;
      if (item.status === 'exists') return `Already exists: <a href="${item.issue.url}" target="_blank" rel="noreferrer">#${item.issue.number} ${escapeHtml(item.issue.title)}</a>`;
      return `Previewed: ${escapeHtml(item.title)}`;
    });
    log(lines.join('<br>'));
  } catch (error) {
    log(`Issue creation failed: ${error.message}`);
  } finally {
    setBusy(false, '');
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function setStatus(kind, message) {
  const dot = els.systemStatus.querySelector('.dot');
  dot.className = `dot ${kind === 'ok' ? '' : kind}`;
  els.systemStatus.querySelector('span:last-child').textContent = message;
}

function setBusy(isBusy, message) {
  els.importButton.disabled = isBusy;
  els.loadLedgerButton.disabled = isBusy || !state.selectedAccount;
  els.createIssuesButton.disabled = isBusy || !state.ledger || state.selectedIssueIds.size === 0;
  els.dryRunButton.disabled = isBusy || !state.ledger || state.selectedIssueIds.size === 0;
  els.toolbarMessage.textContent = message;
}

function log(message) {
  const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  els.activityLog.innerHTML = `<strong>${time}</strong> ${message}<br>${els.activityLog.innerHTML}`;
}

function formatDate(value) {
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
