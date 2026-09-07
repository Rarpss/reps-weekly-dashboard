(function () {
  'use strict';

  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbz0xjuLHvNjzGJod_XWIE_o5yG0Ygc8wXc4J1Ho9GEzRbD8UBkr4rprnOAfXYID6MRr/exec';
  var REFRESH_MS = 5 * 60 * 1000;
  // Independent from data refresh; offsets are CSS pixels, with no animation.
  var PIXEL_SHIFT_MS = 10 * 60 * 1000;
  var PIXEL_SHIFT_OFFSETS = [[0, 0], [3, 0], [3, 3], [0, 3], [-3, 3], [-3, 0], [-3, -3], [0, -3], [3, -3]];
  var shiftIndex = 0;
  var STALE_MS = 90 * 60 * 1000;
  var CRITICAL_MS = 3 * 60 * 60 * 1000;
  // The supplied timestamps have no timezone. Apps Script is assumed to use Brisbane.
  // Change this if the Apps Script project's timezone differs. The clock stays local.
  var SOURCE_UTC_OFFSET = '+10:00';
  var CACHE_KEY = 'reps-weekly-dashboard-v1';
  var data = null, lastFetch = null, fetchError = '', loading = false;
  var storageUnavailable = false;
  var definitions = [
    ['helpdesk_unread', 'Helpdesk Unread', 'actions'],
    ['deletion_requests', 'Deletion Requests', 'actions'],
    ['bug_reports', 'Bug Reports', 'actions'],
    ['player_reports', 'Player Reports', 'actions'],
    ['active_users_today', 'Active Users Today', 'usage'],
    ['workouts_today', 'Workouts Today', 'usage'],
    ['active_users_30d', 'Active Users 30d', 'usage'],
    ['top_app_version', 'Top App Version', 'usage'],
    ['admob_today', 'AdMob Today', 'revenue'],
    ['admob_yesterday', 'AdMob Yesterday', 'revenue'],
    ['admob_week', 'AdMob Week', 'revenue'],
    ['admob_all_time', 'AdMob All Time', 'revenue']
  ];
  var activityDefinitions = [
    ['sessions_today', 'Sessions Today', 'activity-general'],
    ['first_opens_today', 'First Opens Today', 'activity-general'],
    ['first_opens_7d', 'First Opens 7d', 'activity-general'],
    ['active_users_7d', 'Active Users 7d', 'activity-general'],
    ['workouts_7d', 'Workouts 7d', 'activity-general'],
    ['workouts_30d', 'Workouts 30d', 'activity-general'],
    ['interval_timer_started_today', 'Started Today', 'activity-timer'],
    ['interval_timer_completed_today', 'Completed Today', 'activity-timer'],
    ['interval_timer_started_7d', 'Started 7d', 'activity-timer'],
    ['interval_timer_completed_7d', 'Completed 7d', 'activity-timer'],
    ['team_joins_today', 'Joined Today', 'activity-teams'],
    ['team_joins_7d', 'Joined 7d', 'activity-teams'],
    ['app_exceptions_7d', 'App Exceptions 7d', 'activity-health'],
    ['android_users_today', 'Android Users Today', 'activity-platform'],
    ['ios_users_today', 'iOS Users Today', 'activity-platform'],
    ['android_users_30d', 'Android Users 30d', 'activity-platform'],
    ['ios_users_30d', 'iOS Users 30d', 'activity-platform']
  ];
  var allDefinitions = definitions.concat(activityDefinitions);
  var cards = {};
  function el(id) { return document.getElementById(id); }
  function text(node, value) { if (node.textContent !== value) { node.textContent = value; } }
  function parseTime(value) {
    if (typeof value !== 'string' || !value.trim()) { return NaN; }
    var normalized = value.trim().replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) { normalized += SOURCE_UTC_OFFSET; }
    return Date.parse(normalized);
  }
  function ageOf(value) { var timestamp = parseTime(value); return isNaN(timestamp) ? Infinity : Math.max(0, Date.now() - timestamp); }
  function validValue(metric, key) {
    if (!metric || metric.value === null || metric.value === undefined || metric.value === '') { return false; }
    if (key === 'top_app_version') { return typeof metric.value === 'string' || typeof metric.value === 'number'; }
    if (key === 'dashboard_last_run') { return !isNaN(parseTime(metric.value)); }
    return typeof metric.value === 'number' && isFinite(metric.value) && metric.value >= 0;
  }
  function getMetricState(metric, key) {
    if (metric && metric.status === 'ERROR') { return { type: 'error', label: 'Data Error' }; }
    if (!validValue(metric, key)) { return { type: 'warning', label: 'No Data' }; }
    if (metric.status !== 'OK') { return { type: 'warning', label: 'Status Unknown' }; }
    var age = ageOf(metric.last_success);
    if (age === Infinity) { return { type: 'warning', label: 'Update Time Unknown' }; }
    if (age > CRITICAL_MS) { return { type: 'critical', label: 'Data Stale · over 3 hr' }; }
    if (age > STALE_MS) { return { type: 'warning', label: 'Data Stale' }; }
    if (key === 'helpdesk_unread' || key === 'deletion_requests' || key === 'bug_reports' || key === 'player_reports') {
      return metric.value > 0 ? { type: 'action', label: 'Action Required' } : { type: 'healthy', label: 'Clear' };
    }
    return { type: 'healthy', label: 'Up to date' };
  }
  function formatCurrency(value) { return '$' + value.toFixed(2); }
  function formatRelativeTime(value) {
    var age = ageOf(value);
    if (age === Infinity) { return 'Update time unknown'; }
    if (age < 60000) { return 'Updated just now'; }
    if (age < 3600000) { return 'Updated ' + Math.floor(age / 60000) + ' min ago'; }
    if (age < 86400000) { return 'Updated ' + Math.floor(age / 3600000) + ' hr ago'; }
    if (age < 172800000) { return 'Updated yesterday'; }
    return 'Updated ' + Math.floor(age / 86400000) + ' days ago';
  }
  function localDate(value) {
    var timestamp = typeof value === 'number' ? value : parseTime(value);
    return isNaN(timestamp) ? 'Unknown' : new Date(timestamp).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function createCards() {
    allDefinitions.forEach(function (definition) {
      var card = document.createElement('article');
      card.className = 'card';
      var title = document.createElement('h3'); title.textContent = definition[1]; card.appendChild(title);
      var summary = document.createElement('div'); summary.className = 'action-summary';
      var value = document.createElement('div'); value.className = 'value'; value.textContent = '—';
      var status = document.createElement('div'); status.className = 'status'; status.textContent = 'Waiting for data';
      if (definition[2] === 'actions') { summary.appendChild(value); summary.appendChild(status); card.appendChild(summary); }
      else { card.appendChild(value); card.appendChild(status); }
      var meta = document.createElement('div'); meta.className = 'meta'; card.appendChild(meta);
      if (definition[2] === 'usage' || definition[2] === 'revenue') {
        // A compact landscape arrangement keeps large values and freshness together.
        var compact = document.createElement('div'); compact.className = 'metric-summary';
        var details = document.createElement('div'); details.className = 'metric-details';
        compact.appendChild(value); details.appendChild(status); details.appendChild(meta);
        compact.appendChild(details); card.appendChild(compact);
      }
      if (definition[3]) { var help = document.createElement('div'); help.className = 'metric-help'; help.textContent = definition[3]; card.appendChild(help); }
      el(definition[2]).appendChild(card);
      cards[definition[2] + ':' + definition[0]] = { card: card, value: value, status: status, meta: meta };
    });
  }
  function renderMetric(definition, metrics) {
    var key = definition[0], metric = metrics[key], nodes = cards[definition[2] + ':' + key];
    var state = getMetricState(metric, key);
    nodes.card.className = 'card is-' + state.type;
    var value = '—';
    if (validValue(metric, key)) { value = definition[2] === 'revenue' ? formatCurrency(metric.value) : String(metric.value); }
    text(nodes.value, value); text(nodes.status, state.label);
    text(nodes.meta, metric ? formatRelativeTime(metric.last_success) : 'No metric received');
    nodes.meta.title = metric ? 'Last success: ' + localDate(metric.last_success) : '';
    if (definition[2] === 'actions' && metric) { text(nodes.meta, formatRelativeTime(metric.last_success) + ' · ' + localDate(metric.last_success)); }
    nodes.card.title = metric && typeof metric.error === 'string' ? metric.error : '';
  }
  function backendTime(metrics) {
    var run = metrics.dashboard_last_run;
    if (run && !isNaN(parseTime(run.value))) { return run.value; }
    var newest = null;
    Object.keys(metrics).forEach(function (key) {
      var metric = metrics[key];
      if (metric && !isNaN(parseTime(metric.last_success)) && (!newest || parseTime(metric.last_success) > parseTime(newest))) { newest = metric.last_success; }
    });
    return newest;
  }
  function updateSystemHealth(metrics, backendAge) {
    var hasError = !!fetchError, hasWarning = backendAge > STALE_MS, action = false;
    var keys = Object.keys(metrics);
    allDefinitions.forEach(function (definition) { if (keys.indexOf(definition[0]) < 0) { keys.push(definition[0]); } });
    if (keys.indexOf('dashboard_last_run') < 0) { keys.push('dashboard_last_run'); }
    keys.forEach(function (key) {
      var state = getMetricState(metrics[key], key);
      if (state.type === 'error') { hasError = true; }
      if (state.type === 'warning' || state.type === 'critical') { hasWarning = true; }
    });
    ['helpdesk_unread', 'deletion_requests', 'bug_reports', 'player_reports'].forEach(function (key) { if (validValue(metrics[key], key) && metrics[key].value > 0) { action = true; } });
    var label = hasError ? 'ERROR' : action ? 'ACTION REQUIRED' : hasWarning ? 'WARNING' : 'HEALTHY';
    text(el('health'), label); el('health').className = 'badge ' + (hasError ? 'error' : action ? 'action' : hasWarning ? 'warning' : 'healthy');
  }
  function renderDashboard(nextData) {
    var metrics = nextData ? nextData.metrics : {};
    if (nextData) { allDefinitions.forEach(function (definition) { renderMetric(definition, metrics); }); }
    var run = backendTime(metrics), backendAge = ageOf(run);
    text(el('backend'), run ? localDate(run) : 'Unknown');
    text(el('generated'), nextData ? localDate(nextData.generated_at) : '—');
    text(el('freshness'), !nextData ? 'Waiting for data' : backendAge === Infinity ? 'Update time unknown' : backendAge > CRITICAL_MS ? 'Critically stale · over 3 hr' : backendAge > STALE_MS ? 'Data stale · over 90 min' : 'Fresh · ' + formatRelativeTime(run).toLowerCase());
    text(el('last-fetch'), lastFetch ? localDate(lastFetch) : 'No successful fetch yet');
    text(el('connection'), fetchError ? 'Connection error · retrying automatically' : loading ? 'Fetching latest data…' : nextData ? 'Connected · JSON endpoint' : 'Waiting for connection');
    text(el('auto-refresh'), 'Auto-refresh · every ' + (REFRESH_MS / 60000) + ' minutes' + (storageUnavailable ? ' · cache unavailable' : ''));
    if (nextData || fetchError) { updateSystemHealth(metrics, backendAge); }
    var messages = [];
    if (fetchError) { messages.push(fetchError + (nextData ? ' Last successfully loaded values remain visible.' : ' No saved data is available.')); }
    if (nextData && backendAge > STALE_MS) { messages.push(backendAge === Infinity ? 'DATA FRESHNESS UNKNOWN — backend update time is unavailable.' : 'DATA STALE — backend has not updated for ' + (backendAge > CRITICAL_MS ? 'over 3 hours.' : 'over 90 minutes.')); }
    if (!nextData && !fetchError) { messages.push('Connecting to dashboard data…'); }
    el('banner').hidden = messages.length === 0;
    el('banner').className = 'banner' + (fetchError || (nextData && backendAge > CRITICAL_MS) ? ' critical' : '');
    text(el('banner'), messages.join(' '));
  }
  function validateData(candidate) {
    if (!candidate || candidate.ok !== true || !candidate.metrics || typeof candidate.metrics !== 'object' || Array.isArray(candidate.metrics)) { throw new Error('Invalid dashboard response'); }
    return candidate;
  }
  function loadCachedData() {
    try {
      var saved = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (saved) { data = validateData(saved.data); lastFetch = typeof saved.fetchedAt === 'number' && isFinite(saved.fetchedAt) ? saved.fetchedAt : null; }
    } catch (ignore) { data = null; }
  }
  function saveCachedData() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: data, fetchedAt: lastFetch })); storageUnavailable = false; }
    catch (ignore) { storageUnavailable = true; }
  }
  function fetchDashboardData() {
    if (loading) { return; }
    if (typeof window.fetch !== 'function') { fetchError = 'This browser needs a newer Android System WebView with fetch support.'; renderDashboard(data); return; }
    loading = true; el('refresh').disabled = true; text(el('refresh'), 'Refreshing…'); renderDashboard(data);
    // Timeout works even on WebViews without AbortController; late responses are ignored.
    var finished = false;
    var controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
    var timer = setTimeout(function () {
      finish(null, 'The data request timed out.');
      if (controller) { controller.abort(); }
    }, 25000);
    function finish(result, error) {
      if (finished) { return; } finished = true; clearTimeout(timer);
      loading = false; el('refresh').disabled = false; text(el('refresh'), 'Refresh now');
      if (result) { data = result; lastFetch = Date.now(); fetchError = ''; saveCachedData(); }
      else { fetchError = error; }
      renderDashboard(data);
    }
    var options = { cache: 'no-store', credentials: 'omit' };
    if (controller) { options.signal = controller.signal; }
    window.fetch(ENDPOINT, options).then(function (response) {
      if (!response.ok) { throw new Error('HTTP failure'); }
      return response.json();
    }).then(function (result) { finish(validateData(result), ''); }).catch(function () { finish(null, 'Could not refresh dashboard data.'); });
  }
  function updateClock() {
    var now = new Date();
    text(el('clock'), now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    text(el('date'), now.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }));
  }
  function openActivity() {
    // Cards already reflect the most recent JSON, including cached/error states.
    el('activity-overlay').hidden = false;
    el('more-activity').setAttribute('aria-expanded', 'true');
    document.body.classList.add('activity-open');
    el('close-activity').focus();
    el('dashboard').setAttribute('aria-hidden', 'true');
  }
  function closeActivity() {
    el('activity-overlay').hidden = true;
    el('dashboard').removeAttribute('aria-hidden');
    document.body.classList.remove('activity-open');
    el('more-activity').setAttribute('aria-expanded', 'false');
    el('more-activity').focus();
  }
  function shiftDashboard() {
    shiftIndex = (shiftIndex + 1) % PIXEL_SHIFT_OFFSETS.length;
    var offset = PIXEL_SHIFT_OFFSETS[shiftIndex];
    el('dashboard-content').style.transform = 'translate(' + offset[0] + 'px, ' + offset[1] + 'px)';
  }
  el('more-activity').addEventListener('click', openActivity);
  el('close-activity').addEventListener('click', closeActivity);
  el('activity-overlay').addEventListener('click', function (event) {
    if (event.target === el('activity-overlay')) { closeActivity(); }
  });
  document.addEventListener('keydown', function (event) {
    if (el('activity-overlay').hidden) { return; }
    if (event.key === 'Escape' || event.keyCode === 27) { event.preventDefault(); closeActivity(); }
    // The close button is the dialog's only interactive control. Keep focus inside.
    if (event.key === 'Tab' || event.keyCode === 9) { event.preventDefault(); el('close-activity').focus(); }
  });
  setInterval(shiftDashboard, PIXEL_SHIFT_MS);
  createCards(); loadCachedData(); renderDashboard(data); updateClock(); fetchDashboardData();
  el('refresh').addEventListener('click', fetchDashboardData);
  setInterval(fetchDashboardData, REFRESH_MS);
  setInterval(updateClock, 1000);
  setInterval(function () { renderDashboard(data); }, 30000);
  window.addEventListener('online', fetchDashboardData);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { updateClock(); renderDashboard(data); fetchDashboardData(); } });
}());
