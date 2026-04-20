const SESSION_STORAGE_KEY = 'mesh-health-check-session-id';
const SESSION_HISTORY_STORAGE_KEY = 'mesh-health-check-session-history';
const OBSERVER_ALLOWLIST_STORAGE_KEY = 'mesh-health-check-observer-allowlist';
const UI_THEME_STORAGE_KEY = 'mesh-health-check-ui-theme';
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
  repeaterCount: document.querySelector('#repeater-count'),
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
  uiThemeToggle: document.querySelector('#ui-theme-toggle'),
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
  networkWindow: document.querySelector('#network-window'),
  networkState: document.querySelector('#network-state'),
  observerDensity: document.querySelector('#observer-density'),
  observerDensityLabel: document.querySelector('#observer-density-label'),
  observerDensityDetail: document.querySelector('#observer-density-detail'),
  observerSparkline: document.querySelector('#observer-sparkline'),
  observerLoadSparkline: document.querySelector('#observer-load-sparkline'),
  signalQuality: document.querySelector('#signal-quality'),
  signalQualityLabel: document.querySelector('#signal-quality-label'),
  signalSparkline: document.querySelector('#signal-sparkline'),
  latencyScore: document.querySelector('#latency-score'),
  latencyLabel: document.querySelector('#latency-label'),
  latencySparkline: document.querySelector('#latency-sparkline'),
  detailDrawer: document.querySelector('#detail-drawer'),
  drawerScrim: document.querySelector('#drawer-scrim'),
  drawerMeta: document.querySelector('#drawer-meta'),
  drawerTitle: document.querySelector('#drawer-title'),
  drawerBody: document.querySelector('#drawer-body'),
  drawerClose: document.querySelector('#drawer-close'),
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
  selectedRegionGroup: null,
  selectedRegion: null,
  uiTheme: loadUiTheme(),
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
  drawer: {
    kind: '',
    key: '',
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

function loadUiTheme() {
  const stored = localStorage.getItem(UI_THEME_STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

function saveUiTheme() {
  localStorage.setItem(UI_THEME_STORAGE_KEY, state.uiTheme);
}

function applyUiTheme() {
  const activeTheme = state.uiTheme === 'dark' ? 'dark' : 'light';
  document.body.dataset.uiTheme = activeTheme;
  document.documentElement.style.colorScheme = activeTheme;
  if (ui.uiThemeToggle) {
    ui.uiThemeToggle.textContent = activeTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
  }
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', activeTheme === 'dark' ? '#07111d' : '#e9f2ff');
  }
}

function dedupe(items) {
  return [...new Set(items.filter(Boolean))];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
    region: null,
    regionGroup: null,
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

function formatWindow(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value >= 3600) {
    const hours = value / 3600;
    return Number.isInteger(hours) ? `${hours}h window` : `${hours.toFixed(1)}h window`;
  }
  if (value >= 60) {
    const minutes = value / 60;
    return Number.isInteger(minutes) ? `${minutes}m window` : `${minutes.toFixed(1)}m window`;
  }
  return `${value}s window`;
}

function renderSparkline(element, points, tone = 'neutral') {
  if (!element) {
    return;
  }
  const source = Array.isArray(points) && points.length > 0
    ? points
    : [10, 12, 11, 14, 13, 12, 15, 12];
  const normalized = source.map((point) => clamp(point, 8, 100));
  const signature = `${tone}|${normalized.join(',')}`;
  if (element.dataset.sparklineSignature === signature) {
    return;
  }

  element.innerHTML = '';
  element.dataset.tone = tone;
  element.dataset.sparklineSignature = signature;
  for (const [index, point] of normalized.entries()) {
    const bar = document.createElement('span');
    bar.className = 'sparkline-bar';
    bar.style.height = `${point}%`;
    bar.style.animationDelay = `${index * 40}ms`;
    element.appendChild(bar);
  }
}

function scoreTone(score) {
  if (!Number.isFinite(score)) {
    return 'neutral';
  }
  if (score >= 72) {
    return 'good';
  }
  if (score >= 45) {
    return 'warning';
  }
  return 'critical';
}

function scoreLabel(score) {
  if (!Number.isFinite(score)) {
    return 'Awaiting telemetry';
  }
  if (score >= 72) {
    return 'Nominal signal window';
  }
  if (score >= 45) {
    return 'Degraded signal window';
  }
  return 'Critical signal window';
}

function receiptSignalScore(receipt) {
  const components = [];
  if (Number.isFinite(receipt?.rssi)) {
    components.push(clamp(((Number(receipt.rssi) + 120) / 75) * 100, 0, 100));
  }
  if (Number.isFinite(receipt?.snr)) {
    components.push(clamp(((Number(receipt.snr) + 20) / 40) * 100, 0, 100));
  }
  if (components.length === 0) {
    return null;
  }
  return Math.round(components.reduce((sum, value) => sum + value, 0) / components.length);
}

function transportSummary(snapshot) {
  const activeCount = Number(snapshot?.observerStats?.activeCount || 0);
  const windowSeconds = Number(snapshot?.observerStats?.windowSeconds || 0);
  const directory = Array.isArray(snapshot?.observerDirectory) ? snapshot.observerDirectory : [];
  const configuredCount = Math.max(directory.length, Number(snapshot?.observerStats?.configuredCount || 0));
  const maxPacketCount = Math.max(
    1,
    ...directory.map((observer) => Number(observer?.packetCount || 0)),
  );
  const activityBars = directory.slice(0, 8).map((observer) => {
    const packetCount = Number(observer?.packetCount || 0);
    return clamp((packetCount / maxPacketCount) * 100, 10, 100);
  });
  const stateLabel = snapshot?.mqtt?.connected ? 'Live' : (isSharePage() ? 'Shared' : 'Offline');
  return {
    stateLabel,
    tone: directory.length > 0
      ? (snapshot?.mqtt?.connected ? 'good' : (isSharePage() ? 'warning' : 'warning'))
      : 'neutral',
    activityBars,
    density: `${activeCount} / ${configuredCount || 0}`,
    summary: directory.length > 0
      ? `${activeCount} active nodes · ${formatWindow(windowSeconds)}`
      : 'Awaiting observer directory.',
    detail: directory.length > 0
      ? `${directory.length} known observer${directory.length === 1 ? '' : 's'} on file.`
      : 'No observer telemetry yet.',
  };
}

function signalSummary(session) {
  const receipts = Array.isArray(session?.receipts) ? [...session.receipts] : [];
  const points = receipts
    .map((receipt) => receiptSignalScore(receipt))
    .filter((value) => Number.isFinite(value));
  if (points.length === 0) {
    return {
      value: '--',
      label: 'Awaiting telemetry.',
      tone: 'neutral',
      points: [],
    };
  }
  const average = Math.round(points.reduce((sum, value) => sum + value, 0) / points.length);
  return {
    value: `${average}%`,
    label: scoreLabel(average),
    tone: scoreTone(average),
    points,
  };
}

function latencySummary(session) {
  const receipts = Array.isArray(session?.receipts)
    ? [...session.receipts]
        .filter((receipt) => receipt?.firstSeenAt)
        .sort((left, right) => left.firstSeenAt - right.firstSeenAt)
    : [];
  if (receipts.length === 0) {
    return {
      value: '--',
      label: 'Awaiting receipt spread.',
      tone: 'neutral',
      points: [],
    };
  }
  const firstSeenAt = receipts[0].firstSeenAt;
  const lastSeenAt = receipts[receipts.length - 1].firstSeenAt;
  const spread = Math.max(0, lastSeenAt - firstSeenAt);
  const points = receipts.map((receipt) => {
    if (spread <= 0) {
      return 100;
    }
    return clamp(((receipt.firstSeenAt - firstSeenAt) / spread) * 100, 10, 100);
  });
  return {
    value: spread > 0 ? `+${formatElapsed(spread)}` : '0 ms',
    label: spread > 0
      ? `${receipts.length} observers across ${formatElapsed(spread)}`
      : `${receipts.length} observer${receipts.length === 1 ? '' : 's'} at the same moment`,
    tone: spread > 45000 ? 'critical' : spread > 12000 ? 'warning' : 'good',
    points,
  };
}

function renderGlanceMetrics(session) {
  const snapshot = state.snapshot;
  if (!snapshot) {
    return;
  }

  const transport = transportSummary(snapshot);
  const signal = signalSummary(session);
  const latency = latencySummary(session);

  if (ui.networkWindow) {
    ui.networkWindow.textContent = transport.summary;
  }
  if (ui.networkState) {
    ui.networkState.textContent = transport.stateLabel;
  }
  if (ui.observerDensity) {
    ui.observerDensity.textContent = transport.density;
  }
  if (ui.observerDensityLabel) {
    ui.observerDensityLabel.textContent = transport.summary;
  }
  if (ui.observerDensityDetail) {
    ui.observerDensityDetail.textContent = transport.detail;
  }
  if (ui.signalQuality) {
    ui.signalQuality.textContent = signal.value;
  }
  if (ui.signalQualityLabel) {
    ui.signalQualityLabel.textContent = signal.label;
  }
  if (ui.latencyScore) {
    ui.latencyScore.textContent = latency.value;
  }
  if (ui.latencyLabel) {
    ui.latencyLabel.textContent = latency.label;
  }

  renderSparkline(ui.observerSparkline, transport.activityBars, transport.tone);
  renderSparkline(ui.observerLoadSparkline, transport.activityBars.slice().reverse(), transport.tone);
  renderSparkline(ui.signalSparkline, signal.points, signal.tone);
  renderSparkline(ui.latencySparkline, latency.points, latency.tone);
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
        <strong class="observer-label">${escapeHtml(observer.label)}</strong>
        <div class="small-note observer-hash">${escapeHtml(observer.hash || '')}</div>
      </div>
      <span class="status">${observer.seen ? 'Seen' : 'Standby'}</span>
    `;
    ui.expectedObservers.appendChild(item);
  }
}

function renderRegionFilter() {
  if (!ui.regionFilter) return;
  const { hasGroups, regions } = regionFilterOptions();

  if (regions.length === 0 || regions.every((entry) => entry.regions.length === 0)) {
    ui.regionFilter.classList.add('hidden');
    ui.regionFilter.innerHTML = '';
    return;
  }
  ui.regionFilter.classList.remove('hidden');
  ui.regionFilter.innerHTML = '';

  const groupRow = document.createElement('div');
  groupRow.className = 'region-filter__row';

  const locatedObserverCount = regions.reduce((sum, entry) => sum + (entry.count || 0), 0);
  groupRow.appendChild(createRegionButton({
    className: 'region-btn--all',
    active: state.selectedRegionGroup === null && state.selectedRegion === null,
    label: hasGroups ? 'All regions' : 'All',
    count: locatedObserverCount,
    onClick: () => {
      state.selectedRegionGroup = null;
      state.selectedRegion = null;
      applyRegionSelection();
    },
  }));

  if (hasGroups) {
    for (const entry of regions.filter((item) => item.group)) {
      groupRow.appendChild(createRegionButton({
        className: 'region-btn--group',
        active: state.selectedRegionGroup === entry.group && state.selectedRegion === null,
        label: entry.group,
        count: entry.count,
        onClick: () => {
          state.selectedRegionGroup = entry.group;
          state.selectedRegion = null;
          applyRegionSelection();
        },
      }));
    }
  }
  ui.regionFilter.appendChild(groupRow);

  const selectedGroup = state.selectedRegionGroup
    ? regions.find((entry) => entry.group === state.selectedRegionGroup)
    : null;
  const subregionSource = hasGroups
    ? selectedGroup?.regions || []
    : regions.flatMap((entry) => entry.regions);

  if (subregionSource.length > 0) {
    const subregionRow = document.createElement('div');
    subregionRow.className = 'region-filter__row region-filter__row--subregions';

    if (selectedGroup) {
      subregionRow.appendChild(createRegionButton({
        className: 'region-btn--child',
        active: state.selectedRegion === null,
        label: `All ${selectedGroup.group}`,
        count: selectedGroup.count,
        onClick: () => {
          state.selectedRegion = null;
          applyRegionSelection();
        },
      }));
    }

    for (const region of subregionSource) {
      subregionRow.appendChild(createRegionButton({
        className: 'region-btn--child',
        active: state.selectedRegion === region.name,
        label: region.name,
        count: region.count,
        onClick: () => {
          state.selectedRegion = region.name;
          if (!state.selectedRegionGroup && hasGroups) {
            const parent = regions.find((entry) => entry.regions.some((item) => item.name === region.name));
            state.selectedRegionGroup = parent?.group || null;
          }
          applyRegionSelection();
        },
      }));
    }
    ui.regionFilter.appendChild(subregionRow);
  }
}

function regionFilterOptions(snapshot = state.snapshot) {
  const hierarchy = Array.isArray(snapshot?.regionHierarchy)
    ? snapshot.regionHierarchy.filter((entry) => Array.isArray(entry.regions) && entry.regions.length > 0)
    : [];
  const flatRegions = Array.isArray(snapshot?.availableRegions)
    ? snapshot.availableRegions.map((name) => ({ name, count: 0 }))
    : [];
  const regions = hierarchy.length > 0
    ? hierarchy
    : [{ group: '', count: flatRegions.length, regions: flatRegions }];
  const namedGroupCount = regions.filter((entry) => entry.group).length;
  const hasUngroupedRegions = regions.some((entry) => !entry.group && entry.regions.length > 0);
  const hasGroups = namedGroupCount > 1 || (namedGroupCount > 0 && hasUngroupedRegions);
  return { hasGroups, regions };
}

function createRegionButton({ className, active, label, count, onClick }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `region-btn ${className}${active ? ' active' : ''}`;

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  btn.appendChild(labelEl);

  if (Number.isFinite(count) && count > 0) {
    const countEl = document.createElement('span');
    countEl.className = 'region-btn__count';
    countEl.textContent = String(count);
    btn.appendChild(countEl);
  }

  btn.addEventListener('click', onClick);
  return btn;
}

function reconcileRegionSelection(snapshot) {
  const { hasGroups, regions } = regionFilterOptions(snapshot);
  if (!hasGroups && state.selectedRegionGroup !== null) {
    state.selectedRegionGroup = null;
  }
  if (state.selectedRegionGroup !== null) {
    const group = regions.find((entry) => entry.group === state.selectedRegionGroup);
    if (!group) {
      state.selectedRegionGroup = null;
      state.selectedRegion = null;
      state.selectedObserverKeys = [];
      saveSelectedObserverKeys();
      return;
    }
    if (state.selectedRegion !== null && !group.regions.some((region) => region.name === state.selectedRegion)) {
      state.selectedRegion = null;
    }
    state.selectedObserverKeys = observerKeysForRegionSelection(snapshot);
    saveSelectedObserverKeys();
    return;
  }

  if (state.selectedRegion !== null) {
    const regionExists = regions.some((entry) => entry.regions.some((region) => region.name === state.selectedRegion));
    if (!regionExists) {
      state.selectedRegion = null;
      state.selectedObserverKeys = [];
      saveSelectedObserverKeys();
      return;
    }
    if (hasGroups) {
      const parent = regions.find((entry) => entry.regions.some((region) => region.name === state.selectedRegion));
      state.selectedRegionGroup = parent?.group || null;
    }
    state.selectedObserverKeys = observerKeysForRegionSelection(snapshot);
    saveSelectedObserverKeys();
  }
}

function applyRegionSelection() {
  if (state.selectedRegionGroup === null && state.selectedRegion === null) {
    state.selectedObserverKeys = [];
  } else {
    state.selectedObserverKeys = observerKeysForRegionSelection(state.snapshot);
  }
  saveSelectedObserverKeys();
  render();
  scheduleSessionRetarget();
}

function observerKeysForRegionSelection(snapshot = state.snapshot) {
  const directory = Array.isArray(snapshot?.observerDirectory) ? snapshot.observerDirectory : [];
  return directory
    .filter((observer) => {
      if (state.selectedRegion) {
        return observer.region === state.selectedRegion
          && (!state.selectedRegionGroup || observer.regionGroup === state.selectedRegionGroup);
      }
      return observer.regionGroup === state.selectedRegionGroup;
    })
    .map((observer) => observer.key);
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
    const locationLabel = observer.hasLocation ? 'mapped' : 'no map';
    item.innerHTML = `
      <input type="checkbox" value="${observer.key}" ${selected.has(observer.key) ? 'checked' : ''}>
      <span class="observer-option-copy">
        <strong>${escapeHtml(observer.label)}</strong>
        <span>${escapeHtml(observer.hash || '--')} · ${escapeHtml(observer.shortKey)} · ${escapeHtml(status)}</span>
        <span>${observer.packetCount || 0} packet${observer.packetCount === 1 ? '' : 's'} · ${locationLabel}</span>
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
      state.selectedRegionGroup = null;
      state.selectedRegion = null;
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
  const mergedDirectory = new Map();
  for (const observer of configuredDefaultObservers()) {
    mergedDirectory.set(observer.key, observer);
  }
  for (const observer of directory) {
    const existing = mergedDirectory.get(observer.key) || {};
    mergedDirectory.set(observer.key, {
      ...existing,
      ...observer,
    });
  }
  let source = [...mergedDirectory.values()];
  if (mapObserverScope === 'expected') {
    const directoryByKey = new Map(source.map((observer) => [observer.key, observer]));
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
  state.map.instance.setView([20, 0], 2);
  return state.map.instance;
}

function currentTileLayer() {
  if (!window.L) {
    return null;
  }
  if (state.uiTheme === 'light') {
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

  ui.mapObserverNote.textContent = locatedObservers.length > 0
    ? `${locatedObservers.filter((observer) => observer.seen).length}/${locatedObservers.length} mapped observers reached.`
    : 'No observer coordinates yet. The map stays live and will populate as coordinates arrive.';
  ui.mapEmpty.classList.toggle('hidden', locatedObservers.length > 0);

  if (!mapInstance || !window.L) {
    return;
  }

  if (!state.map.layer || state.map.layerTheme !== state.uiTheme) {
    const nextLayer = currentTileLayer();
    if (state.map.layer) {
      mapInstance.removeLayer(state.map.layer);
    }
    state.map.layer = nextLayer;
    state.map.layerTheme = state.uiTheme;
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
  } else if (bounds.length === 0 && state.map.boundsKey !== '__empty__') {
    mapInstance.setView([20, 0], 2);
    state.map.boundsKey = '__empty__';
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
    card.dataset.observerKey = receipt.observerKey;
    const signal = receiptSignalScore(receipt);
    const signalTone = scoreTone(signal);
    const pathMarkup = receipt.path.length > 0
      ? receipt.path.map((hop) => `<span>${escapeHtml(hop)}</span>`).join('')
      : '<span>No path data</span>';
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
          <h3 class="receipt-title">${escapeHtml(receipt.observerLabel)}</h3>
          <div class="receipt-hash">${escapeHtml(receipt.observerHash || '')} · ${escapeHtml(receipt.observerShortKey)}</div>
        </div>
        <div class="small-note">${formatTime(receipt.firstSeenAt)}</div>
      </div>
      <p class="receipt-meta">
        Seen ${receipt.count} time${receipt.count === 1 ? '' : 's'}${metrics ? ` · ${metrics}` : ''}
      </p>
      <div class="receipt-meter-grid">
        <div class="receipt-meter">
          <span>Signal</span>
          <div class="meter-track ${signalTone}">
            <span style="width: ${Number.isFinite(signal) ? signal : 12}%;"></span>
          </div>
          <strong>${Number.isFinite(signal) ? `${signal}%` : '--'}</strong>
        </div>
        <div class="receipt-meter">
          <span>Latency</span>
          <div class="meter-track ${receipt.duration != null && receipt.duration > 1500 ? 'warning' : 'good'}">
            <span style="width: ${receipt.duration != null ? clamp((Number(receipt.duration) / 3000) * 100, 12, 100) : 20}%;"></span>
          </div>
          <strong>${receipt.duration != null ? `${receipt.duration} ms` : 'n/a'}</strong>
        </div>
      </div>
      <div class="receipt-path">${pathMarkup}</div>
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
    item.dataset.sessionId = session.id;
    item.innerHTML = `
      <div>
        <div class="history-code">${escapeHtml(session.code)}</div>
        <p>${session.observedCount}/${session.expectedCount} observers · ${escapeHtml(session.healthLabel)}</p>
      </div>
      <div>
        <strong class="${healthClass(session.healthLabel)}">${session.healthPercent}%</strong>
        <p>${formatTime(session.createdAt)}</p>
      </div>
    `;
    ui.sessionHistory.appendChild(item);
  }
}

function drawerStat(label, value) {
  return `
    <div class="drawer-stat">
      <span class="meta-label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function drawerListItem(title, detail, meta = '') {
  return `
    <div class="drawer-list__item">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(detail)}</p>
      ${meta ? `<div class="small-note">${escapeHtml(meta)}</div>` : ''}
    </div>
  `;
}

function buildDrawerContent() {
  const snapshot = state.snapshot;
  const session = currentSession();
  const directory = selectableObservers();
  const mappedObservers = mapKnownObservers(session);
  const receipts = Array.isArray(session?.receipts) ? session.receipts : [];
  const historySessions = state.trackedSessionIds
    .map((id) => state.sessions.get(id))
    .filter(Boolean);
  const transport = snapshot ? transportSummary(snapshot) : null;
  const signal = signalSummary(session);
  const latency = latencySummary(session);

  switch (state.drawer.kind) {
    case 'session':
      return {
        meta: 'Command Sequence',
        title: session ? `Session ${session.code}` : 'Session Control',
        body: `
          <section class="drawer-card">
            <h3>Session Summary</h3>
            <div class="drawer-stat-grid">
              ${drawerStat('Status', session?.status?.toUpperCase() || 'IDLE')}
              ${drawerStat('Share Window', session ? formatDateTime(session.resultExpiresAt) : retentionNote())}
              ${drawerStat('Uses Remaining', session ? String(session.usesRemaining) : '--')}
              ${drawerStat('Hash', session?.messageHash || 'Pending')}
            </div>
          </section>
          <section class="drawer-card">
            <h3>Operator Instructions</h3>
            <pre class="drawer-codeblock">${escapeHtml(session?.instructions || 'Create a session to start listening.')}</pre>
          </section>
          <section class="drawer-card">
            <h3>Matched Message</h3>
            <pre class="drawer-codeblock">${escapeHtml(session?.messageBody || 'Waiting for an incoming message on the configured test channel.')}</pre>
          </section>
        `,
      };
    case 'transport':
      return {
        meta: 'Transport Matrix',
        title: 'Network Transport',
        body: `
          <section class="drawer-card">
            <h3>Live Transport</h3>
            <div class="drawer-stat-grid">
              ${drawerStat('State', transport?.stateLabel || 'Offline')}
              ${drawerStat('Broker', snapshot?.mqtt?.broker || 'Unknown')}
              ${drawerStat('Channel', snapshot?.testChannel?.name ? `#${snapshot.testChannel.name}` : 'Unknown')}
              ${drawerStat('Topics', Array.isArray(snapshot?.mqtt?.topics) ? String(snapshot.mqtt.topics.length) : '0')}
            </div>
          </section>
          <section class="drawer-card">
            <h3>Observer Window</h3>
            <div class="drawer-list">
              ${drawerListItem(
                'Retention Window',
                transport?.summary || 'Awaiting observer directory.',
                transport?.detail || '',
              )}
            </div>
          </section>
        `,
      };
    case 'observers':
      return {
        meta: 'Target Matrix',
        title: 'Observer Targeting',
        body: directory.length > 0
          ? `
            <section class="drawer-card">
              <h3>Target Summary</h3>
              <div class="drawer-stat-grid">
                ${drawerStat('Default Source', snapshot?.defaultObserverSource || 'Unknown')}
                ${drawerStat('Directory Size', String(directory.length))}
                ${drawerStat('Selected Mode', usingDefaultObserverSet() ? 'Default set' : 'Custom set')}
                ${drawerStat('Active Nodes', String(snapshot?.observerStats?.activeCount || 0))}
              </div>
            </section>
            <section class="drawer-card">
              <h3>Node Inventory</h3>
              <div class="drawer-list">
                ${directory.map((observer) => drawerListItem(
                  observer.label,
                  `${observer.hash || '--'} · ${observer.shortKey}`,
                  `${observer.packetCount || 0} packet${observer.packetCount === 1 ? '' : 's'} · ${observer.hasLocation ? 'mapped' : 'no coordinates'} · ${observer.isActive ? 'active' : 'idle'}`,
                )).join('')}
              </div>
            </section>
          `
          : `
            <section class="drawer-card">
              <h3>Observer Targeting</h3>
              <p>No observers available yet. Node inventory appears as metadata and packets arrive.</p>
            </section>
          `,
      };
    case 'map':
      return {
        meta: 'Geo View',
        title: 'Coverage Map',
        body: mappedObservers.length > 0
          ? `
            <section class="drawer-card">
              <h3>Mapped Observers</h3>
              <div class="drawer-stat-grid">
                ${drawerStat('Mapped', String(mappedObservers.length))}
                ${drawerStat('Reached', String(mappedObservers.filter((observer) => observer.seen).length))}
                ${drawerStat('Theme', state.uiTheme === 'dark' ? 'Dark mode' : 'Light mode')}
                ${drawerStat('Scope', mapObserverScope === 'expected' ? 'Expected' : 'Directory')}
              </div>
            </section>
            <section class="drawer-card">
              <h3>Coordinates</h3>
              <div class="drawer-list">
                ${mappedObservers.map((observer) => drawerListItem(
                  observer.label,
                  `${observer.lat}, ${observer.lon}`,
                  `${observer.seen ? 'Seen by this check' : 'Not seen by this check'} · ${observer.hash || '--'}`,
                )).join('')}
              </div>
            </section>
          `
          : `
            <section class="drawer-card">
              <h3>Coverage Map</h3>
              <p>Waiting for observer coordinates.</p>
            </section>
          `,
      };
    case 'reports':
      return {
        meta: 'Signal Trace',
        title: 'Technical Logs',
        body: receipts.length > 0
          ? `
            <section class="drawer-card">
              <h3>Receipt Summary</h3>
              <div class="drawer-stat-grid">
                ${drawerStat('Signal Quality', signal.value)}
                ${drawerStat('Spread', latency.value)}
                ${drawerStat('Observer Reports', String(receipts.length))}
                ${drawerStat('Sender', session?.sender || 'Pending')}
              </div>
            </section>
            <section class="drawer-card">
              <h3>Trace Lines</h3>
              <div class="console-lines">
                ${receipts.map((receipt) => `
                  <div class="console-line">
                    <strong>${escapeHtml(receipt.observerLabel)}</strong>
                    <span>${escapeHtml(formatTime(receipt.firstSeenAt))}</span>
                    <code>${escapeHtml(receipt.messageHash || 'no-hash')}</code>
                    <span>${escapeHtml((receipt.path || []).join(' -> ') || 'No path data')}</span>
                  </div>
                `).join('')}
              </div>
            </section>
          `
          : `
            <section class="drawer-card">
              <h3>Technical Logs</h3>
              <p>Timeline appears after the first observer report.</p>
            </section>
          `,
      };
    case 'history':
      return {
        meta: 'Session Archive',
        title: 'Recent Sessions',
        body: historySessions.length > 0
          ? `
            <section class="drawer-card">
              <h3>Browser Session History</h3>
              <div class="drawer-list">
                ${historySessions.map((entry) => drawerListItem(
                  entry.code,
                  `${entry.observedCount}/${entry.expectedCount} observers · ${entry.healthPercent}%`,
                  `${entry.healthLabel} · ${formatTime(entry.createdAt)}`,
                )).join('')}
              </div>
            </section>
          `
          : `
            <section class="drawer-card">
              <h3>Recent Sessions</h3>
              <p>No previous checks in this browser session.</p>
            </section>
          `,
      };
    case 'receipt': {
      const receipt = receipts.find((entry) => entry.observerKey === state.drawer.key);
      if (!receipt) {
        return null;
      }
      return {
        meta: 'Packet Detail',
        title: receipt.observerLabel,
        body: `
          <section class="drawer-card">
            <h3>Receipt Metrics</h3>
            <div class="drawer-stat-grid">
              ${drawerStat('First Seen', formatTime(receipt.firstSeenAt))}
              ${drawerStat('Message Hash', receipt.messageHash || 'Pending')}
              ${drawerStat('RSSI', receipt.rssi != null ? String(receipt.rssi) : 'n/a')}
              ${drawerStat('SNR', receipt.snr != null ? String(receipt.snr) : 'n/a')}
              ${drawerStat('Duration', receipt.duration != null ? `${receipt.duration} ms` : 'n/a')}
              ${drawerStat('Packets', String(receipt.count))}
            </div>
          </section>
          <section class="drawer-card">
            <h3>Path Trace</h3>
            <pre class="drawer-codeblock">${escapeHtml((receipt.path || []).join(' -> ') || 'No path data')}</pre>
          </section>
        `,
      };
    }
    default:
      return null;
  }
}

function renderDrawer() {
  if (!ui.detailDrawer || !ui.drawerBody || !ui.drawerMeta || !ui.drawerTitle) {
    return;
  }
  if (!state.drawer.kind) {
    ui.detailDrawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
    return;
  }
  const content = buildDrawerContent();
  if (!content) {
    state.drawer.kind = '';
    state.drawer.key = '';
    ui.detailDrawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
    return;
  }
  ui.drawerMeta.textContent = content.meta;
  ui.drawerTitle.textContent = content.title;
  ui.drawerBody.innerHTML = content.body;
  ui.detailDrawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('drawer-open');
}

function openDrawer(kind, key = '') {
  state.drawer.kind = kind;
  state.drawer.key = key;
  renderDrawer();
}

function closeDrawer() {
  state.drawer.kind = '';
  state.drawer.key = '';
  renderDrawer();
}

function render() {
  const snapshot = state.snapshot;
  if (!snapshot) {
    return;
  }
  applyUiTheme();

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
    ui.repeaterCount.textContent = '0';
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
    renderGlanceMetrics(null);
    updateRing(0, 'Waiting');
    renderDrawer();
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
  ui.repeaterCount.textContent = String(session.repeaterCount || 0);
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
  renderGlanceMetrics(session);
  renderDrawer();
}

function applySnapshot(snapshot) {
  const previousRegionGroup = state.selectedRegionGroup;
  const previousRegion = state.selectedRegion;
  const previousObserverKeys = state.selectedObserverKeys;
  reconcileRegionSelection(snapshot);
  state.snapshot = snapshot;
  render();
  if (
    previousRegionGroup !== state.selectedRegionGroup
    || previousRegion !== state.selectedRegion
    || !sameKeys(previousObserverKeys, state.selectedObserverKeys)
  ) {
    scheduleSessionRetarget();
  }
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
  state.selectedRegionGroup = null;
  state.selectedRegion = null;
  state.selectedObserverKeys = [];
  saveSelectedObserverKeys();
  render();
  scheduleSessionRetarget();
});

if (ui.uiThemeToggle) {
  ui.uiThemeToggle.addEventListener('click', () => {
    state.uiTheme = state.uiTheme === 'dark' ? 'light' : 'dark';
    saveUiTheme();
    render();
  });
}

if (ui.drawerClose) {
  ui.drawerClose.addEventListener('click', () => {
    closeDrawer();
  });
}

if (ui.drawerScrim) {
  ui.drawerScrim.addEventListener('click', () => {
    closeDrawer();
  });
}

function targetIsPanelInteractive(target) {
  return Boolean(target.closest(
    'button, a, input, label, .leaflet-container, .leaflet-control-container, .leaflet-popup, .leaflet-marker-pane, .detail-drawer',
  ));
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }
  const action = event.target.closest('[data-drawer-action]');
  if (action) {
    event.preventDefault();
    openDrawer(action.dataset.drawerAction || '');
    return;
  }

  const receiptCard = event.target.closest('.receipt-card[data-observer-key]');
  if (receiptCard && ui.receipts?.contains(receiptCard) && !targetIsPanelInteractive(event.target)) {
    openDrawer('receipt', receiptCard.dataset.observerKey || '');
    return;
  }

});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.drawer.kind) {
    closeDrawer();
  }
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
