const SESSION_STORAGE_KEY = 'mesh-health-check-session-id';
const SESSION_HISTORY_STORAGE_KEY = 'mesh-health-check-session-history';
const OBSERVER_ALLOWLIST_STORAGE_KEY = 'mesh-health-check-observer-allowlist';
const MAP_THEME_STORAGE_KEY = 'mesh-health-check-map-theme';
const ANALYZER_BASE_URL = 'https://analyzer.letsmesh.net/packets?packet_hash=';
const SHARE_ROUTE_PREFIX = '/share/';
let deferredInstallPrompt = null;

const ui = {
  mqttPill: document.querySelector('#mqtt-pill'),
  installAppButton: document.querySelector('#install-app-button'),
  newSessionButton: document.querySelector('#new-session-button'),
  copySessionCodeButton: document.querySelector('#copy-session-code'),
  shareSessionButton: document.querySelector('#share-session'),
  sessionCode: document.querySelector('#session-code'),
  sessionInstructions: document.querySelector('#session-instructions'),
  sessionShareNote: document.querySelector('#session-share-note'),
  sessionStatus: document.querySelector('#session-status'),
  sessionHash: document.querySelector('#session-hash'),
  healthLabel: document.querySelector('#health-label'),
  healthPercent: document.querySelector('#health-percent'),
  observedCount: document.querySelector('#observed-count'),
  senderName: document.querySelector('#sender-name'),
  channelName: document.querySelector('#channel-name'),
  heroEyebrow: document.querySelector('#hero-eyebrow'),
  heroTitle: document.querySelector('#hero-title'),
  heroDescriptionPrefix: document.querySelector('#hero-description-prefix'),
  heroDescriptionSuffix: document.querySelector('#hero-description-suffix'),
  heroChannel: document.querySelector('#hero-channel'),
  brokerName: document.querySelector('#broker-name'),
  externalLink: document.querySelector('#external-link'),
  repoNoteLink: document.querySelector('#repo-note-link'),
  siteVersionNote: document.querySelector('#site-version-note'),
  messagePreview: document.querySelector('#message-preview'),
  expectedSource: document.querySelector('#expected-source'),
  expectedObservers: document.querySelector('#expected-observers'),
  observerAllowlistNote: document.querySelector('#observer-allowlist-note'),
  regionFilter: document.querySelector('#region-filter'),
  observerAllowlist: document.querySelector('#observer-allowlist'),
  observerAllowlistClear: document.querySelector('#observer-allowlist-clear'),
  mapThemeToggle: document.querySelector('#map-theme-toggle'),
  mapObserverNote: document.querySelector('#map-observer-note'),
  mapEmpty: document.querySelector('#map-empty'),
  observerMap: document.querySelector('#observer-map'),
  activeObserverNote: document.querySelector('#active-observer-note'),
  timelineSummary: document.querySelector('#timeline-summary'),
  timelineScale: document.querySelector('#timeline-scale'),
  timelineStartLabel: document.querySelector('#timeline-start-label'),
  timelineEndLabel: document.querySelector('#timeline-end-label'),
  receiptTimelineEmpty: document.querySelector('#receipt-timeline-empty'),
  receiptTimeline: document.querySelector('#receipt-timeline'),
  receiptsEmpty: document.querySelector('#receipts-empty'),
  receipts: document.querySelector('#receipts'),
  sessionHistory: document.querySelector('#session-history'),
};

const pageMode = document.body?.dataset?.pageMode || 'app';
const mapObserverScope = document.body?.dataset?.mapObserverScope === 'expected'
  ? 'expected'
  : 'directory';

localStorage.removeItem(SESSION_STORAGE_KEY);
localStorage.removeItem(SESSION_HISTORY_STORAGE_KEY);

const state = {
  snapshot: null,
  currentSessionId: sessionStorage.getItem(SESSION_STORAGE_KEY) || '',
  sharedSessionId: sharedSessionIdFromLocation(),
  sharedSessionMissing: false,
  trackedSessionIds: loadTrackedSessionIds(),
  selectedObserverKeys: loadSelectedObserverKeys(),
  selectedRegion: null,
  mapTheme: loadMapTheme(),
  sessions: new Map(),
  socket: null,
  socketRetryTimer: 0,
  sessionRetargetTimer: 0,
  refreshInFlight: false,
  map: {
    instance: null,
    layer: null,
    layerTheme: '',
    markers: new Map(),
    boundsKey: '',
  },
};

function loadTrackedSessionIds() {
  try {
    const raw = sessionStorage.getItem(SESSION_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveTrackedSessionIds() {
  sessionStorage.setItem(
    SESSION_HISTORY_STORAGE_KEY,
    JSON.stringify(state.trackedSessionIds),
  );
}

function loadSelectedObserverKeys() {
  try {
    const raw = sessionStorage.getItem(OBSERVER_ALLOWLIST_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveSelectedObserverKeys() {
  sessionStorage.setItem(
    OBSERVER_ALLOWLIST_STORAGE_KEY,
    JSON.stringify(state.selectedObserverKeys),
  );
}

function loadMapTheme() {
  const stored = localStorage.getItem(MAP_THEME_STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

function saveMapTheme() {
  localStorage.setItem(MAP_THEME_STORAGE_KEY, state.mapTheme);
}

function dedupe(items) {
  return [...new Set(items.filter(Boolean))];
}

function sharedSessionIdFromLocation() {
  const path = window.location.pathname || '';
  if (!path.startsWith(SHARE_ROUTE_PREFIX)) {
    return '';
  }
  const encodedId = path.slice(SHARE_ROUTE_PREFIX.length).split('/')[0] || '';
  try {
    return decodeURIComponent(encodedId).trim();
  } catch {
    return encodedId.trim();
  }
}

function isSharedRoute() {
  return Boolean(state.sharedSessionId);
}

function isSharePage() {
  return pageMode === 'share';
}

function updateInstallButton() {
  ui.installAppButton.classList.toggle('hidden', !deferredInstallPrompt);
}

function observerDirectory() {
  if (Array.isArray(state.snapshot?.observerDirectory) && state.snapshot.observerDirectory.length > 0) {
    return state.snapshot.observerDirectory;
  }
  return Array.isArray(state.snapshot?.activeObservers) ? state.snapshot.activeObservers : [];
}

function configuredDefaultObserverKeys() {
  const defaults = Array.isArray(state.snapshot?.defaultObserverKeys)
    ? state.snapshot.defaultObserverKeys
    : [];
  return dedupe(defaults);
}

function shortObserverKey(key) {
  const value = String(key || '').trim().toUpperCase();
  if (value.length <= 12) {
    return value || '--';
  }
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function fallbackObserverRecord(key) {
  return {
    key,
    hash: String(key || '').trim().toUpperCase().slice(0, 2) || '--',
    label: shortObserverKey(key),
    name: null,
    lat: null,
    lon: null,
    hasLocation: false,
    shortKey: shortObserverKey(key),
    packetCount: 0,
    firstSeenAt: 0,
    lastPacketAt: 0,
    isRetained: false,
    isActive: false,
  };
}

function configuredDefaultObservers() {
  const defaults = Array.isArray(state.snapshot?.defaultObservers)
    ? state.snapshot.defaultObservers.filter((observer) => observer?.key)
    : [];
  if (defaults.length > 0) {
    return defaults;
  }
  return configuredDefaultObserverKeys().map((key) => fallbackObserverRecord(key));
}

function selectableObservers() {
  const merged = new Map();
  for (const observer of configuredDefaultObservers()) {
    merged.set(observer.key, { ...observer, isDefaultTarget: true });
  }
  for (const observer of observerDirectory()) {
    const existing = merged.get(observer.key) || {};
    merged.set(observer.key, {
      ...existing,
      ...observer,
      isDefaultTarget: Boolean(existing.isDefaultTarget),
    });
  }
  return [...merged.values()];
}

function customSelectedObserverKeys() {
  const available = new Set(selectableObservers().map((observer) => observer.key));
  return state.selectedObserverKeys.filter((key) => available.has(key));
}

function defaultObserverKeys() {
  return configuredDefaultObserverKeys();
}

function usingDefaultObserverSet() {
  return customSelectedObserverKeys().length === 0;
}

function effectiveObserverKeysForCreate() {
  return usingDefaultObserverSet()
    ? defaultObserverKeys()
    : customSelectedObserverKeys();
}

function defaultObserverTargetSummary() {
  const source = String(state.snapshot?.defaultObserverSource || '');
  const count = defaultObserverKeys().length;
  if (source === 'configured') {
    return `Default: ${count} observer${count === 1 ? '' : 's'}.`;
  }
  return `Default: ${count} active observer${count === 1 ? '' : 's'}.`;
}

function targetPreviewLabel() {
  return usingDefaultObserverSet() ? 'Default set (next code)' : 'Custom set (next code)';
}

function sessionTargetKeys(session) {
  return dedupe(
    Array.isArray(session?.expectedObservers)
      ? session.expectedObservers.map((observer) => observer?.key)
      : [],
  );
}

function sameKeys(left, right) {
  const leftKeys = dedupe(left).sort();
  const rightKeys = dedupe(right).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key, index) => key === rightKeys[index]);
}

function selectionDiffersFromSession(session) {
  return !sameKeys(sessionTargetKeys(session), effectiveObserverKeysForCreate());
}

function sessionCanRetarget(session) {
  return Boolean(
    session
      && !isSharePage()
      && session.status === 'waiting'
      && Number(session.useCount || 0) === 0
      && !session.messageHash
      && !session.matchedAt,
  );
}

function targetPreviewSession() {
  const knownObservers = new Map(
    selectableObservers().map((observer) => [observer.key, observer]),
  );
  return {
    expectedObservers: effectiveObserverKeysForCreate().map((key) => {
      const observer = knownObservers.get(key) || fallbackObserverRecord(key);
      return {
        key,
        hash: observer.hash || '--',
        label: observer.label,
        seen: false,
      };
    }),
  };
}

function sessionObserverSourceLabel(session) {
  if (!session) {
    return defaultObserverTargetSummary();
  }
  if (session.allowlistEnabled) {
    return 'Custom set';
  }
  if (session.expectedObserverSource === 'configured') {
    return 'Default set';
  }
  if (session.expectedObserverSource === 'active-window') {
    return 'Active set';
  }
  if (session.expectedObserverSource === 'first-observer') {
    return 'Matched observer';
  }
  return 'Observer target';
}

function upsertTrackedSession(session) {
  if (!session?.id) {
    return;
  }
  state.sessions.set(session.id, session);
  state.trackedSessionIds = [
    session.id,
    ...state.trackedSessionIds.filter((id) => id !== session.id),
  ].slice(0, 8);
  saveTrackedSessionIds();
}

function removeTrackedSession(sessionId) {
  state.sessions.delete(sessionId);
  state.trackedSessionIds = state.trackedSessionIds.filter((id) => id !== sessionId);
  saveTrackedSessionIds();
  if (state.currentSessionId === sessionId) {
    state.currentSessionId = '';
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

async function apiFetch(url, options = {}) {
  return fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
}

function formatTime(timestamp) {
  if (!timestamp) {
    return 'Pending';
  }
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return 'Pending';
  }
  return new Date(timestamp).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatElapsed(ms) {
  const value = Math.max(0, Math.round(ms));
  if (value < 1000) {
    return `${value} ms`;
  }
  if (value < 60000) {
    const seconds = value / 1000;
    return `${seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(value / 60000);
  const seconds = Math.round((value % 60000) / 1000);
  if (seconds === 60) {
    return `${minutes + 1} min`;
  }
  return `${minutes} min ${seconds}s`;
}

function retentionNote() {
  const seconds = Number(state.snapshot?.results?.retentionSeconds || 0);
  if (!seconds) {
    return 'Shared links stay available for a limited time.';
  }
  const days = seconds / 86400;
  if (Number.isInteger(days) && days >= 1) {
    return `Shared links are kept for ${days} day${days === 1 ? '' : 's'}.`;
  }
  return `Shared links are kept for ${formatElapsed(seconds * 1000)}.`;
}

function setSessionHash(hash) {
  const value = String(hash || '').trim();
  if (!value) {
    ui.sessionHash.textContent = 'Pending';
    ui.sessionHash.href = '#';
    ui.sessionHash.classList.add('pending');
    ui.sessionHash.removeAttribute('target');
    ui.sessionHash.removeAttribute('rel');
    return;
  }

  ui.sessionHash.textContent = value;
  ui.sessionHash.href = `${ANALYZER_BASE_URL}${encodeURIComponent(value)}`;
  ui.sessionHash.classList.remove('pending');
  ui.sessionHash.setAttribute('target', '_blank');
  ui.sessionHash.setAttribute('rel', 'noopener noreferrer');
}

function healthClass(label) {
  if (label === 'VERY HEALTHY' || label === 'GOOD') {
    return 'status-good';
  }
  if (label === 'FAIR') {
    return 'status-fair';
  }
  return 'status-poor';
}

function ringColor(label) {
  if (label === 'VERY HEALTHY' || label === 'GOOD') return 'var(--good)';
  if (label === 'FAIR') return 'var(--fair)';
  if (!label || label === 'Waiting') return 'var(--accent-strong)';
  return 'var(--poor)';
}

function updateRing(percent, label) {
  const color = ringColor(label);
  const circumference = 314.16;
  const offset = circumference * (1 - Math.max(0, Math.min(100, percent)) / 100);
  document.documentElement.style.setProperty('--ring-color', color);
  const fill = document.querySelector('.score-ring__fill');
  if (fill) {
    fill.style.stroke = color;
    fill.style.strokeDashoffset = offset;
  }
}

function redirectToLanding() {
  window.location.href = '/';
}

async function registerPwa() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch {
      // ignore registration failures
    }
  }
}

async function installApp() {
  if (!deferredInstallPrompt) {
    return;
  }
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice.catch(() => null);
  if (choice?.outcome === 'accepted') {
    deferredInstallPrompt = null;
  }
  updateInstallButton();
}

async function copyCurrentCode() {
  const session = currentSession();
  const code = session?.code || '';
  if (!code) {
    return;
  }

  await copyText(code);
  flashButtonText(ui.copySessionCodeButton, 'Copied');
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const helper = document.createElement('textarea');
    helper.value = value;
    helper.setAttribute('readonly', '');
    helper.style.position = 'absolute';
    helper.style.left = '-9999px';
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
  }
}

function flashButtonText(button, text) {
  const originalText = button.textContent;
  button.textContent = text;
  window.setTimeout(() => {
    button.textContent = originalText;
  }, 1200);
}

async function copySessionShareLink() {
  const session = currentSession();
  const shareUrl = String(session?.shareUrl || '').trim();
  if (!shareUrl) {
    return;
  }

  const shareData = {
    title: document.title,
    text: `Observer coverage for ${session.code}`,
    url: shareUrl,
  };

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(shareData);
      flashButtonText(ui.shareSessionButton, 'Shared');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }
    }
  }

  await copyText(shareUrl);
  flashButtonText(ui.shareSessionButton, 'Link Copied');
}

async function createSession() {
  if (state.sessionRetargetTimer) {
    window.clearTimeout(state.sessionRetargetTimer);
    state.sessionRetargetTimer = 0;
  }
  ui.newSessionButton.disabled = true;
  try {
    const response = await apiFetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expectedObserverKeys: usingDefaultObserverSet() ? [] : customSelectedObserverKeys(),
      }),
    });
    const session = await response.json();
    if (response.status === 403 && session.error === 'turnstile_required') {
      redirectToLanding();
      return;
    }
    if (!response.ok) {
      throw new Error(session.error || 'Failed to create session');
    }
    state.sharedSessionId = '';
    state.sharedSessionMissing = false;
    state.currentSessionId = session.id;
    sessionStorage.setItem(SESSION_STORAGE_KEY, session.id);
    if (window.location.pathname !== '/app') {
      window.history.replaceState({}, '', '/app');
    }
    upsertTrackedSession(session);
    render();
  } catch (error) {
    ui.sessionInstructions.textContent = error.message;
  } finally {
    ui.newSessionButton.disabled = false;
  }
}

function scheduleSessionRetarget() {
  if (state.sessionRetargetTimer) {
    window.clearTimeout(state.sessionRetargetTimer);
  }
  state.sessionRetargetTimer = window.setTimeout(() => {
    state.sessionRetargetTimer = 0;
    const session = currentSession();
    if (!sessionCanRetarget(session) || !selectionDiffersFromSession(session)) {
      render();
      return;
    }
    createSession();
  }, 200);
}

function currentSession() {
  const sessionId = state.sharedSessionId || state.currentSessionId;
  if (!sessionId) {
    return null;
  }
  return state.sessions.get(sessionId) || null;
}

function renderExpectedObservers(session) {
  ui.expectedObservers.innerHTML = '';
  const expected = Array.isArray(session?.expectedObservers)
    ? session.expectedObservers
    : [];
  if (expected.length === 0) {
    ui.expectedObservers.innerHTML =
      '<div class="observer-pill waiting"><span>Waiting for first receipt</span><span class="status">--</span></div>';
    return;
  }
  for (const observer of expected) {
    const item = document.createElement('div');
    item.className = `observer-pill ${observer.seen ? 'seen' : 'waiting'}`;
    item.innerHTML = `
      <div class="observer-main">
        <strong class="observer-label">${observer.label}</strong>
        <div class="small-note observer-hash">${observer.hash || ''}</div>
      </div>
      <span class="status">${observer.seen ? 'Seen' : 'Waiting'}</span>
    `;
    ui.expectedObservers.appendChild(item);
  }
}

function renderRegionFilter() {
  if (!ui.regionFilter) return;
  const regions = state.snapshot?.availableRegions;
  if (!Array.isArray(regions) || regions.length === 0) {
    ui.regionFilter.classList.add('hidden');
    ui.regionFilter.innerHTML = '';
    return;
  }
  ui.regionFilter.classList.remove('hidden');
  ui.regionFilter.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = `region-btn${state.selectedRegion === null ? ' active' : ''}`;
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => {
    state.selectedRegion = null;
    applyRegionSelection();
  });
  ui.regionFilter.appendChild(allBtn);

  for (const name of regions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `region-btn${state.selectedRegion === name ? ' active' : ''}`;
    btn.textContent = name;
    btn.addEventListener('click', () => {
      state.selectedRegion = name;
      applyRegionSelection();
    });
    ui.regionFilter.appendChild(btn);
  }
}

function applyRegionSelection() {
  if (state.selectedRegion === null) {
    state.selectedObserverKeys = [];
  } else {
    const directory = state.snapshot?.observerDirectory ?? [];
    state.selectedObserverKeys = directory
      .filter((o) => o.region === state.selectedRegion)
      .map((o) => o.key);
  }
  saveSelectedObserverKeys();
  render();
  scheduleSessionRetarget();
}

function renderObserverAllowlist() {
  renderRegionFilter();
  const directory = selectableObservers();
  const selected = new Set(effectiveObserverKeysForCreate());
  ui.observerAllowlist.innerHTML = '';
  ui.observerAllowlistClear.disabled = usingDefaultObserverSet();

  if (directory.length === 0) {
    ui.observerAllowlistNote.textContent = 'No observers available to select yet.';
    ui.observerAllowlist.innerHTML =
      '<div class="empty-state compact">Observer choices appear as metadata and packets arrive.</div>';
    return;
  }

  const selectedCount = selected.size;
  ui.observerAllowlistNote.textContent = usingDefaultObserverSet()
    ? defaultObserverTargetSummary()
    : `Custom: ${selectedCount} observer${selectedCount === 1 ? '' : 's'}.`;

  for (const observer of directory) {
    const item = document.createElement('label');
    item.className = `observer-option ${observer.isActive ? 'active' : 'inactive'}`;
    const status = observer.isActive
      ? 'active'
      : observer.isRetained === false
        ? 'not recently heard'
        : 'idle';
    item.innerHTML = `
      <input type="checkbox" value="${observer.key}" ${selected.has(observer.key) ? 'checked' : ''}>
      <span class="observer-option-copy">
        <strong>${observer.label}</strong>
        <span>${observer.hash || '--'} · ${observer.shortKey} · ${status}</span>
      </span>
    `;
    const checkbox = item.querySelector('input');
    checkbox.addEventListener('change', () => {
      const next = new Set(effectiveObserverKeysForCreate());
      if (checkbox.checked) {
        next.add(observer.key);
      } else {
        next.delete(observer.key);
      }
      state.selectedObserverKeys = [...next];
      saveSelectedObserverKeys();
      render();
      scheduleSessionRetarget();
    });
    ui.observerAllowlist.appendChild(item);
  }
}

function applySiteBranding(snapshot) {
  const site = snapshot?.site || {};
  const title = site.title || 'Mesh Health Check';
  const version = String(site.version || '').trim() || '0.0.0';
  const eyebrow = site.eyebrow || 'MeshCore Observer Coverage';
  const headline = site.headline || 'Check your mesh reach.';
  const repoUrl = site.repoUrl || 'https://github.com/yellowcooln/meshcore-health-check';
  const changesUrl = site.changesUrl || `${repoUrl}/blob/main/CHANGES.md`;
  const externalUrl = String(site.externalLinkUrl || '').trim();
  const externalLabel = String(site.externalLinkLabel || '').trim() || 'External Link';
  const description = site.description
    || 'Generate a test code, send it to the configured channel, and watch observer coverage build in real time.';
  const [prefix, ...suffixParts] = description.split('configured channel');
  const suffix = suffixParts.join('configured channel');

  document.title = isSharePage() ? `${title} Shared Result` : title;
  ui.repoNoteLink.href = repoUrl;
  ui.siteVersionNote.href = changesUrl;
  ui.siteVersionNote.textContent = `Version: v${version}`;
  if (externalUrl) {
    ui.externalLink.href = externalUrl;
    ui.externalLink.textContent = externalLabel;
    ui.externalLink.classList.remove('hidden');
  } else {
    ui.externalLink.href = '#';
    ui.externalLink.textContent = 'External Link';
    ui.externalLink.classList.add('hidden');
  }
  if (isSharePage()) {
    ui.heroEyebrow.textContent = 'Shared Result';
    ui.heroTitle.textContent = 'Observer coverage someone shared with you.';
    ui.heroDescriptionPrefix.textContent = 'This page is read-only. Review the result from';
    ui.heroDescriptionSuffix.textContent = 'or open the full dashboard to run your own check.';
    return;
  }
  ui.heroEyebrow.textContent = eyebrow;
  ui.heroTitle.textContent = headline;
  ui.heroDescriptionPrefix.textContent = (prefix || '').trimEnd() || 'Generate a test code, send it to';
  ui.heroDescriptionSuffix.textContent = (suffix || '').trimStart()
    || 'and watch observer coverage build in real time.';
}

function mapKnownObservers(session) {
  const directory = observerDirectory();
  let source = directory;
  if (mapObserverScope === 'expected') {
    const directoryByKey = new Map(directory.map((observer) => [observer.key, observer]));
    const expected = Array.isArray(session?.expectedObservers)
      ? session.expectedObservers.filter((observer) => observer?.key)
      : [];
    if (expected.length > 0) {
      source = expected.map((observer) => {
        const known = directoryByKey.get(observer.key) || fallbackObserverRecord(observer.key);
        return {
          ...known,
          ...observer,
          lat: known.lat,
          lon: known.lon,
          hasLocation: known.hasLocation,
        };
      });
    }
  }
  const seenKeys = new Set(
    Array.isArray(session?.receipts) ? session.receipts.map((receipt) => receipt.observerKey) : [],
  );
  return source
    .filter((observer) => observer.lat != null && observer.lon != null)
    .map((observer) => ({
      ...observer,
      seen: Boolean(observer.seen) || seenKeys.has(observer.key),
    }));
}

function ensureObserverMap() {
  if (state.map.instance || !ui.observerMap || !window.L) {
    return state.map.instance;
  }
  state.map.instance = window.L.map(ui.observerMap, {
    zoomControl: true,
    attributionControl: true,
  });
  return state.map.instance;
}

function currentTileLayer() {
  if (!window.L) {
    return null;
  }
  if (state.mapTheme === 'light') {
    return window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    });
  }
  return window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  });
}

function markerIcon(observer) {
  return window.L.divIcon({
    className: 'observer-map-icon-shell',
    html: `<span class="observer-map-icon ${observer.seen ? 'seen' : 'missed'}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function renderObserverMap(session) {
  const locatedObservers = mapKnownObservers(session);
  const mapInstance = ensureObserverMap();

  ui.mapThemeToggle.textContent = state.mapTheme === 'dark' ? 'Light Map' : 'Dark Map';
  ui.mapObserverNote.textContent = locatedObservers.length > 0
    ? `${locatedObservers.filter((observer) => observer.seen).length}/${locatedObservers.length} mapped observers reached.`
    : 'Waiting for observer coordinates.';
  ui.mapEmpty.classList.toggle('hidden', locatedObservers.length > 0);
  ui.observerMap.classList.toggle('hidden', locatedObservers.length === 0);

  if (!mapInstance || !window.L) {
    return;
  }

  if (!state.map.layer || state.map.layerTheme !== state.mapTheme) {
    const nextLayer = currentTileLayer();
    if (state.map.layer) {
      mapInstance.removeLayer(state.map.layer);
    }
    state.map.layer = nextLayer;
    state.map.layerTheme = state.mapTheme;
    if (nextLayer) {
      nextLayer.addTo(mapInstance);
    }
  }

  const activeKeys = new Set(locatedObservers.map((observer) => observer.key));
  for (const [key, marker] of state.map.markers.entries()) {
    if (!activeKeys.has(key)) {
      marker.remove();
      state.map.markers.delete(key);
    }
  }

  const bounds = [];
  for (const observer of locatedObservers) {
    const latLng = [observer.lat, observer.lon];
    bounds.push(latLng);
    let marker = state.map.markers.get(observer.key);
    if (!marker) {
      marker = window.L.marker(latLng, { icon: markerIcon(observer) }).addTo(mapInstance);
      state.map.markers.set(observer.key, marker);
    } else {
      marker.setLatLng(latLng);
      marker.setIcon(markerIcon(observer));
    }
    marker.bindPopup(`
      <strong>${observer.label}</strong><br>
      ${observer.seen ? 'Seen by this check' : 'Not seen by this check'}<br>
      ${observer.hash || '--'} · ${observer.shortKey}
    `);
  }

  const boundsKey = locatedObservers.map((observer) => observer.key).join('|');
  if (bounds.length > 0 && boundsKey !== state.map.boundsKey) {
    mapInstance.fitBounds(bounds, { padding: [26, 26], maxZoom: 10 });
    state.map.boundsKey = boundsKey;
  }
  window.setTimeout(() => {
    mapInstance.invalidateSize();
  }, 0);
}

function renderReceipts(session) {
  const receipts = Array.isArray(session?.receipts) ? session.receipts : [];
  ui.receipts.innerHTML = '';
  ui.receiptsEmpty.classList.toggle('hidden', receipts.length > 0);

  for (const receipt of receipts) {
    const card = document.createElement('article');
    card.className = 'receipt-card';
    const metrics = [
      receipt.rssi != null ? `RSSI ${receipt.rssi}` : '',
      receipt.snr != null ? `SNR ${receipt.snr}` : '',
      receipt.duration != null ? `${receipt.duration} ms` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    card.innerHTML = `
      <div class="receipt-head">
        <div>
          <h3 class="receipt-title">${receipt.observerLabel}</h3>
          <div class="receipt-hash">${receipt.observerHash || ''} · ${receipt.observerShortKey}</div>
        </div>
        <div class="small-note">${formatTime(receipt.firstSeenAt)}</div>
      </div>
      <p class="receipt-meta">
        Seen ${receipt.count} time${receipt.count === 1 ? '' : 's'}${metrics ? ` · ${metrics}` : ''}
      </p>
      <div class="receipt-path">${receipt.path.length > 0 ? receipt.path.join(' → ') : 'No path data'}</div>
    `;
    ui.receipts.appendChild(card);
  }
}

function renderReceiptTimeline(session) {
  const receipts = Array.isArray(session?.receipts)
    ? [...session.receipts]
        .filter((receipt) => receipt?.firstSeenAt)
        .sort((left, right) => left.firstSeenAt - right.firstSeenAt)
    : [];

  ui.receiptTimeline.innerHTML = '';
  ui.receiptTimelineEmpty.classList.toggle('hidden', receipts.length > 0);
  ui.timelineScale.classList.toggle('hidden', receipts.length === 0);

  if (receipts.length === 0) {
    ui.timelineSummary.textContent = 'Waiting for observer reports';
    ui.timelineStartLabel.textContent = 'First receipt';
    ui.timelineEndLabel.textContent = 'Latest receipt';
    return;
  }

  const firstSeenAt = receipts[0].firstSeenAt;
  const lastSeenAt = receipts[receipts.length - 1].firstSeenAt;
  const spread = Math.max(0, lastSeenAt - firstSeenAt);

  ui.timelineSummary.textContent = spread > 0
    ? `${receipts.length} observers across ${formatElapsed(spread)}`
    : `${receipts.length} observer${receipts.length === 1 ? '' : 's'} at the same moment`;
  ui.timelineStartLabel.textContent = formatTime(firstSeenAt);
  ui.timelineEndLabel.textContent = spread > 0 ? `+${formatElapsed(spread)}` : 'same moment';

  for (const receipt of receipts) {
    const delta = Math.max(0, receipt.firstSeenAt - firstSeenAt);
    const position = spread > 0 ? (delta / spread) * 100 : 0;
    const row = document.createElement('article');
    row.className = 'timeline-row';
    row.innerHTML = `
      <div class="timeline-copy">
        <strong>${receipt.observerLabel}</strong>
        <span>${delta === 0 ? `First receipt · ${formatTime(receipt.firstSeenAt)}` : `+${formatElapsed(delta)} · ${formatTime(receipt.firstSeenAt)}`}</span>
      </div>
      <div class="timeline-track">
        <span class="timeline-fill" style="width: ${position}%;"></span>
        <span class="timeline-dot" style="left: ${position}%;"></span>
      </div>
    `;
    ui.receiptTimeline.appendChild(row);
  }
}

function renderHistory(sessions) {
  ui.sessionHistory.innerHTML = '';
  if (sessions.length === 0) {
    ui.sessionHistory.innerHTML =
      '<div class="empty-state compact">No previous checks in this browser session.</div>';
    return;
  }
  for (const session of sessions) {
    const item = document.createElement('article');
    item.className = 'history-item';
    item.innerHTML = `
      <div>
        <div class="history-code">${session.code}</div>
        <p>${session.observedCount}/${session.expectedCount} observers · ${session.healthLabel}</p>
      </div>
      <div>
        <strong class="${healthClass(session.healthLabel)}">${session.healthPercent}%</strong>
        <p>${formatTime(session.createdAt)}</p>
      </div>
    `;
    ui.sessionHistory.appendChild(item);
  }
}

function render() {
  const snapshot = state.snapshot;
  if (!snapshot) {
    return;
  }

  const channelLabel = `#${snapshot.testChannel.name}`;
  const historySessions = state.trackedSessionIds
    .map((id) => state.sessions.get(id))
    .filter(Boolean);

  const session = currentSession();
  ui.newSessionButton.disabled = false;
  ui.copySessionCodeButton.disabled = !session;
  ui.shareSessionButton.disabled = !session?.shareUrl;
  applySiteBranding(snapshot);
  if (isSharePage()) {
    ui.mqttPill.textContent = state.sharedSessionMissing ? 'Shared link expired' : 'Shared Result';
    ui.mqttPill.classList.remove('online');
  } else {
    ui.mqttPill.textContent = snapshot.mqtt.connected ? 'MQTT online' : 'MQTT offline';
    ui.mqttPill.classList.toggle('online', snapshot.mqtt.connected);
  }
  ui.heroChannel.textContent = channelLabel;
  ui.brokerName.textContent = snapshot.mqtt.broker;
  ui.activeObserverNote.textContent =
    `${snapshot.observerStats.activeCount} active observer${snapshot.observerStats.activeCount === 1 ? '' : 's'} in the last ${snapshot.observerStats.windowSeconds}s`;
  if (!session) {
    ui.sessionCode.textContent = 'No active code';
    ui.sessionInstructions.textContent = state.sharedSessionMissing
      ? 'That shared result is no longer available.'
      : 'Create a session to start listening.';
    ui.sessionShareNote.textContent = state.sharedSessionMissing
      ? 'Shared results are removed after their retention window.'
      : retentionNote();
    ui.sessionStatus.textContent = 'Idle';
    setSessionHash('');
    ui.healthLabel.textContent = 'Waiting';
    ui.healthLabel.className = '';
    ui.healthPercent.innerHTML = '<span class="score-num">0</span><span class="score-unit">%</span>';
    ui.observedCount.textContent = '0 / 0';
    ui.senderName.textContent = 'Pending';
    ui.channelName.textContent = channelLabel;
    ui.messagePreview.textContent = `Waiting for your ${channelLabel} message.`;
    ui.messagePreview.title = '';
    ui.expectedSource.textContent = defaultObserverTargetSummary();
    renderObserverAllowlist();
    renderExpectedObservers(null);
    renderObserverMap(null);
    renderReceiptTimeline(null);
    renderReceipts(null);
    renderHistory(historySessions);
    updateRing(0, 'Waiting');
    return;
  }

  if (!state.sharedSessionId) {
    state.currentSessionId = session.id;
    sessionStorage.setItem(SESSION_STORAGE_KEY, session.id);
  }

  ui.sessionCode.textContent = session.code;
  ui.sessionInstructions.textContent = session.instructions;
  ui.sessionShareNote.textContent = `Share link available until ${formatDateTime(session.resultExpiresAt)}.`;
  ui.sessionStatus.textContent = session.status.toUpperCase();
  setSessionHash(session.messageHash);
  ui.healthLabel.textContent = session.healthLabel;
  ui.healthLabel.className = healthClass(session.healthLabel);
  ui.healthPercent.innerHTML = `<span class="score-num">${session.healthPercent}</span><span class="score-unit">%</span>`;
  ui.observedCount.textContent = `${session.observedCount} / ${session.expectedCount}`;
  ui.senderName.textContent = session.sender || 'Pending';
  ui.channelName.textContent = session.channelName ? `#${session.channelName}` : channelLabel;
  ui.messagePreview.textContent = session.messageBody || `Waiting for your ${channelLabel} message.`;
  ui.messagePreview.title = session.messageBody || '';
  const showTargetPreview = selectionDiffersFromSession(session);
  ui.expectedSource.textContent = showTargetPreview
    ? targetPreviewLabel()
    : sessionObserverSourceLabel(session);

  updateRing(session.healthPercent, session.healthLabel);
  renderObserverAllowlist();
  renderExpectedObservers(showTargetPreview ? targetPreviewSession() : session);
  renderObserverMap(session);
  renderReceiptTimeline(session);
  renderReceipts(session);
  renderHistory(historySessions);
}

function applySnapshot(snapshot) {
  state.snapshot = snapshot;
  render();
}

async function refreshTrackedSessions() {
  const ids = dedupe([
    ...state.trackedSessionIds,
    state.sharedSessionId,
  ]);
  if (ids.length === 0) {
    return;
  }

  const results = await Promise.all(ids.map(async (sessionId) => {
    const response = await apiFetch(`/api/sessions/${sessionId}`);
    if (response.status === 404) {
      return { sessionId, missing: true };
    }
    if (response.status === 403) {
      return { sessionId, turnstileRequired: true };
    }
    if (!response.ok) {
      return { sessionId, failed: true };
    }
    return {
      sessionId,
      session: await response.json(),
    };
  }));

  for (const result of results) {
    if (result.turnstileRequired) {
      redirectToLanding();
      return;
    }
    if (result.missing) {
      if (result.sessionId === state.sharedSessionId) {
        state.sharedSessionMissing = true;
        state.sessions.delete(result.sessionId);
      }
      removeTrackedSession(result.sessionId);
      continue;
    }
    if (result.failed || !result.session) {
      continue;
    }
    if (result.sessionId === state.sharedSessionId) {
      state.sharedSessionMissing = false;
    }
    state.sessions.set(result.session.id, result.session);
  }
}

async function refreshFromServer() {
  if (state.refreshInFlight) {
    return;
  }
  state.refreshInFlight = true;
  try {
    const response = await apiFetch('/api/bootstrap');
    const snapshot = await response.json();
    if (snapshot.turnstile?.enabled && !snapshot.turnstile.verified && !isSharedRoute()) {
      redirectToLanding();
      return;
    }
    applySnapshot(snapshot);
    await refreshTrackedSessions();
    render();
  } finally {
    state.refreshInFlight = false;
  }
}

function scheduleSocketReconnect() {
  if (state.socket || state.socketRetryTimer) {
    return;
  }
  state.socketRetryTimer = window.setTimeout(() => {
    state.socketRetryTimer = 0;
    connectSocket();
  }, 2000);
}

function connectSocket() {
  if (state.socket) {
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}`);
  state.socket = socket;

  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'snapshot') {
        applySnapshot(message.data);
        refreshTrackedSessions().then(() => {
          render();
        });
      }
    } catch {
      // ignore malformed frames
    }
  });

  socket.addEventListener('close', () => {
    state.socket = null;
    scheduleSocketReconnect();
  });
}

async function bootstrap() {
  await registerPwa();
  await refreshFromServer();
  if (!state.snapshot) {
    return;
  }
  if (isSharedRoute()) {
    render();
  } else if (!currentSession()) {
    await createSession();
  } else {
    render();
  }
  connectSocket();
}

ui.newSessionButton.addEventListener('click', () => {
  createSession();
});

ui.installAppButton.addEventListener('click', () => {
  installApp();
});

ui.copySessionCodeButton.addEventListener('click', () => {
  copyCurrentCode();
});

ui.shareSessionButton.addEventListener('click', () => {
  copySessionShareLink();
});

ui.observerAllowlistClear.addEventListener('click', () => {
  if (usingDefaultObserverSet()) {
    return;
  }
  state.selectedRegion = null;
  state.selectedObserverKeys = [];
  saveSelectedObserverKeys();
  render();
  scheduleSessionRetarget();
});

ui.mapThemeToggle.addEventListener('click', () => {
  state.mapTheme = state.mapTheme === 'dark' ? 'light' : 'dark';
  saveMapTheme();
  render();
});

bootstrap();
window.setInterval(() => {
  refreshFromServer();
}, 5000);

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallButton();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updateInstallButton();
});
