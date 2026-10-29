(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { app: null, auth: null, db: null, user: null, mode: 'signin', readings: [], flowChart: null, unsub: [], toastTimer: null, latest: null, status: null, command: null };
  const config = window.FIREBASE_CONFIG || {};
  const missing = !config.apiKey || config.apiKey.includes('PASTE_') || !config.appId || config.appId.includes('PASTE_') || !config.messagingSenderId || config.messagingSenderId.includes('PASTE_');
  if (missing) {
    $('configWarning').classList.remove('hidden');
    $('configWarning').textContent = 'Setup needed: open firebase-config.js and paste your Firebase Web App apiKey, appId and messagingSenderId from Firebase Console → Project settings → Your apps.';
  }

  function toast(message, error = false) {
    const el = $('toast'); el.textContent = message; el.style.background = error ? '#8f2c35' : '#14283d'; el.classList.add('show');
    clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }
  function authError(message) { $('authError').textContent = message || ''; }
  function friendlyError(error) {
    const code = error && error.code || '';
    const map = {
      'auth/invalid-email': 'Enter a valid email address.', 'auth/user-not-found': 'No account exists for this email.',
      'auth/wrong-password': 'Incorrect email or password.', 'auth/invalid-credential': 'Email or password is incorrect.',
      'auth/email-already-in-use': 'An account already exists for this email.', 'auth/weak-password': 'Use a password with at least 6 characters.',
      'auth/operation-not-allowed': 'Email/password sign-in is disabled. Enable it in Firebase Authentication settings.',
      'auth/network-request-failed': 'Network error. Check your internet connection.', 'auth/too-many-requests': 'Too many attempts. Wait a while and try again.',
      'PERMISSION_DENIED': 'Firebase denied access. Check Realtime Database rules and ensure you are signed in.'
    };
    return map[code] || error.message || 'Something went wrong. Check Firebase configuration and rules.';
  }
  function initFirebase() {
    if (missing) return false;
    try {
      state.app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
      state.auth = firebase.auth(); state.db = firebase.database();
      state.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
      state.auth.onAuthStateChanged(user => {
        state.user = user || null;
        if (user) enterApp(user); else enterAuth();
      });
      return true;
    } catch (e) { console.error(e); $('configWarning').classList.remove('hidden'); $('configWarning').textContent = 'Firebase initialization failed: ' + e.message; return false; }
  }
  function enterAuth() {
    $('authView').classList.remove('hidden'); $('appView').classList.add('hidden'); stopListeners();
  }
  function enterApp(user) {
    $('authView').classList.add('hidden'); $('appView').classList.remove('hidden');
    $('userEmail').textContent = user.email || 'Project operator'; $('avatar').textContent = (user.email || 'A').slice(0,1).toUpperCase();
    $('currentDate').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
    startListeners();
  }
  function setAuthMode(mode) {
    state.mode = mode; const signup = mode === 'signup';
    $('authTitle').textContent = signup ? 'Create your account' : 'Welcome back';
    $('authSubtitle').textContent = signup ? 'Create an account to access your water system.' : 'Sign in to monitor your water system.';
    $('authSubmit').textContent = signup ? 'Create account' : 'Sign in';
    $('switchText').textContent = signup ? 'Already registered?' : 'New to AquaGuard?';
    $('switchAuth').textContent = signup ? 'Sign in' : 'Create account';
    $('forgotBtn').classList.toggle('hidden', signup); $('password').autocomplete = signup ? 'new-password' : 'current-password'; authError('');
  }
  $('switchAuth').addEventListener('click', () => setAuthMode(state.mode === 'signin' ? 'signup' : 'signin'));
  $('authForm').addEventListener('submit', async e => {
    e.preventDefault(); authError(''); if (!state.auth) { authError('Configure firebase-config.js first.'); return; }
    const email = $('email').value.trim(), password = $('password').value;
    $('authSubmit').disabled = true;
    try {
      if (state.mode === 'signup') await state.auth.createUserWithEmailAndPassword(email, password);
      else await state.auth.signInWithEmailAndPassword(email, password);
    } catch (err) { authError(friendlyError(err)); } finally { $('authSubmit').disabled = false; }
  });
  $('forgotBtn').addEventListener('click', async () => {
    if (!state.auth) return authError('Configure firebase-config.js first.');
    const email = $('email').value.trim(); if (!email) return authError('Enter your email address first.');
    try { await state.auth.sendPasswordResetEmail(email); authError('Password reset email sent if this address is registered.'); } catch (e) { authError(friendlyError(e)); }
  });
  $('logoutBtn').addEventListener('click', () => state.auth && state.auth.signOut());

  function stopListeners() { state.unsub.forEach(fn => { try { fn(); } catch (_) {} }); state.unsub = []; if (state.flowChart) { state.flowChart.destroy(); state.flowChart = null; } }
  function startListeners() {
    stopListeners(); if (!state.db || !state.user) return;
    const connectedRef = state.db.ref('.info/connected');
    const connectedCb = snap => { const yes = snap.val() === true; $('connectionDot').classList.toggle('connected', yes); $('connectionText').textContent = yes ? 'Firebase connected' : 'Reconnecting…'; };
    connectedRef.on('value', connectedCb); state.unsub.push(() => connectedRef.off('value', connectedCb));
    const readingsRef = state.db.ref('readings').orderByChild('ts').limitToLast(100);
    const readingsCb = snap => {
      const obj = snap.val() || {};
      state.readings = Object.entries(obj).map(([key, value]) => ({ ...value, _key: key })).filter(r => Number.isFinite(Number(r.ts))).sort((a,b) => Number(a.ts)-Number(b.ts));
      renderReadings();
    };
    readingsRef.on('value', readingsCb, err => toast(friendlyError(err), true)); state.unsub.push(() => readingsRef.off('value', readingsCb));
    const latestRef = state.db.ref('latest'); const latestCb = snap => { state.latest = snap.val(); renderLatest(); };
    latestRef.on('value', latestCb, err => toast(friendlyError(err), true)); state.unsub.push(() => latestRef.off('value', latestCb));
    const statusRef = state.db.ref('status'); const statusCb = snap => { state.status = snap.val(); renderStatus(); };
    statusRef.on('value', statusCb, err => toast(friendlyError(err), true)); state.unsub.push(() => statusRef.off('value', statusCb));
    const commandRef = state.db.ref('command'); const commandCb = snap => { state.command = snap.val(); renderCommand(); };
    commandRef.on('value', commandCb, err => toast(friendlyError(err), true)); state.unsub.push(() => commandRef.off('value', commandCb));
  }
  function fmt(value, digits = 2) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(digits) : '—'; }
  function dateTime(ts) { const n = Number(ts); if (!Number.isFinite(n)) return '—'; return new Date(n < 100000000000 ? n * 1000 : n).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  function renderLatest() {
    const r = state.latest; if (!r) { $('lastUpdated').textContent = 'Waiting for data…'; return; }
    const diff = Number(r.inlet_flow) - Number(r.outlet_flow);
    $('inletValue').textContent = fmt(r.inlet_flow, 1); $('outletValue').textContent = fmt(r.outlet_flow, 1); $('pressureValue').textContent = fmt(r.pressure, 1); $('diffValue').textContent = fmt(diff, 2);
    $('lastUpdated').textContent = dateTime(r.ts); $('historyDiff').textContent = fmt(diff, 2) + ' L/min';
    ['inletSpark','outletSpark','pressureSpark','diffSpark'].forEach((id, i) => { const values = [r.inlet_flow, r.outlet_flow, r.pressure, diff]; $(id).style.width = Math.max(10, Math.min(100, Math.abs(Number(values[i]) || 0) * (i === 2 ? 20 : 6))) + '%'; });
    renderStatus();
  }
  function renderStatus() {
    const status = state.status || {}; const statusText = String(status.state || '').toLowerCase();
    const isLeak = statusText === 'leak'; const isNormal = statusText === 'normal'; const hasStatus = isLeak || isNormal;
    const banner = $('statusBanner'); banner.classList.toggle('leak', isLeak); banner.classList.toggle('normal', isNormal); banner.classList.toggle('standby', !hasStatus);
    $('statusIcon').textContent = isLeak ? '!' : isNormal ? '✓' : '…'; $('statusHeading').textContent = isLeak ? 'Potential water leak detected' : isNormal ? 'System operating normally' : 'System is waiting for readings';
    $('statusDescription').textContent = isLeak ? 'The AI detector reported a leak. Check the pipe and valve immediately.' : isNormal ? 'The latest AI prediction indicates normal flow conditions.' : 'Send readings and start the Python detector to receive AI status.';
    $('statusState').textContent = isLeak ? 'LEAK ALERT' : isNormal ? 'NORMAL' : 'STANDBY';
    $('aiState').textContent = isLeak ? 'Leak detected' : isNormal ? 'Normal flow' : 'Awaiting model'; $('aiTime').textContent = status.ts ? 'Prediction at ' + dateTime(status.ts) : 'No prediction received';
    $('aiResult').style.background = isLeak ? '#fff5f5' : isNormal ? '#f1fbf6' : '#f6f8fb';
  }
  function renderCommand() {
    const v = String(state.command && state.command.valve || '').toLowerCase(); const closed = v === 'close' || v === 'closed'; const open = v === 'open';
    const label = closed ? 'Closed command' : open ? 'Open command' : 'Unknown';
    $('valveState').textContent = label; $('valveStateSmall').textContent = label; $('commandValue').textContent = label;
    $('commandLight').classList.toggle('closed', closed); $('commandLight').classList.toggle('open', open); $('valveVisual').classList.toggle('closed', closed); $('valveVisual').textContent = closed ? '×' : '↔';
  }
  function renderReadings() {
    const rows = [...state.readings].reverse(); const recent = rows.slice(0, 6);
    $('historyCount').textContent = state.readings.length; $('historyLeaks').textContent = state.readings.filter(r => Number(r.label) === 1).length; $('historyNormals').textContent = state.readings.filter(r => Number(r.label) === 0).length;
    $('recentTable').innerHTML = recent.length ? recent.map(r => `<tr><td>${escapeHtml(dateTime(r.ts))}</td><td>${fmt(r.inlet_flow,1)}</td><td>${fmt(r.outlet_flow,1)}</td><td>${fmt(r.pressure,1)}</td><td>${labelPill(r.label)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">No readings yet.</td></tr>';
    renderHistoryTable(); renderChart();
  }
  function labelPill(label) { return Number(label) === 1 ? '<span class="label-pill leak">Leak</span>' : Number(label) === 0 ? '<span class="label-pill normal">Normal</span>' : '<span class="label-pill">Unknown</span>'; }
  function escapeHtml(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function renderHistoryTable() {
    const q = ($('historySearch').value || '').trim().toLowerCase(); const rows = [...state.readings].reverse().filter(r => !q || [r.label, r.inlet_flow, r.outlet_flow, r.pressure, dateTime(r.ts)].some(v => String(v ?? '').toLowerCase().includes(q)));
    $('historyTable').innerHTML = rows.length ? rows.map(r => `<tr><td>${escapeHtml(dateTime(r.ts))}</td><td>${fmt(r.inlet_flow,2)}</td><td>${fmt(r.outlet_flow,2)}</td><td>${fmt(r.pressure,2)}</td><td>${fmt(Number(r.inlet_flow)-Number(r.outlet_flow),2)}</td><td>${labelPill(r.label)}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-cell">No matching readings.</td></tr>';
  }
  function renderChart() {
    const canvas = $('flowChart'); if (!canvas || !window.Chart) return; const rows = state.readings.slice(-30);
    $('chartEmpty').classList.toggle('hidden', rows.length > 0);
    if (state.flowChart) state.flowChart.destroy();
    state.flowChart = new Chart(canvas, { type: 'line', data: { labels: rows.map(r => new Date(Number(r.ts) < 1e11 ? Number(r.ts)*1000 : Number(r.ts)).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})), datasets: [
      { label: 'Inlet flow', data: rows.map(r => Number(r.inlet_flow)), borderColor: '#2878f0', backgroundColor: '#2878f012', borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, tension: .35, fill: true },
      { label: 'Outlet flow', data: rows.map(r => Number(r.outlet_flow)), borderColor: '#11a99a', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, tension: .35 }
    ]}, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#12263b', padding: 10 } }, scales: { x: { grid: { display: false }, ticks: { color: '#9aa7b4', maxTicksLimit: 6, font: { size: 9 } }, border: { display: false } }, y: { beginAtZero: true, grid: { color: '#edf1f5' }, ticks: { color: '#9aa7b4', font: { size: 9 } }, border: { display: false } } } } });
  }
  function goTo(page) {
    const map = { overview: 'Overview', history: 'Sensor history', controls: 'Valve & simulator' };
    document.querySelectorAll('.page-section').forEach(el => el.classList.add('hidden')); $(page + 'Page').classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page)); $('pageTitle').textContent = map[page] || 'Overview'; $('sidebar').classList.remove('open');
    if (page === 'overview') renderChart(); if (page === 'history') renderHistoryTable();
  }
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => goTo(btn.dataset.page)));
  document.querySelectorAll('[data-goto]').forEach(btn => btn.addEventListener('click', () => goTo(btn.dataset.goto)));
  $('menuBtn').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('historySearch').addEventListener('input', renderHistoryTable);
  $('exportBtn').addEventListener('click', () => {
    if (!state.readings.length) return toast('No sensor readings to export yet.', true);
    const fields = ['ts','inlet_flow','outlet_flow','pressure','flow_diff','flow_ratio','valve','label'];
    const csv = [fields.join(','), ...[...state.readings].reverse().map(r => fields.map(f => { let v = r[f]; if (f === 'flow_diff') v = Number(r.inlet_flow)-Number(r.outlet_flow); if (f === 'flow_ratio') v = (Number(r.inlet_flow)-Number(r.outlet_flow))/Math.max(Number(r.inlet_flow),.5); return '"' + String(v == null ? '' : v).replace(/"/g,'""') + '"'; }).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'})); const a = document.createElement('a'); a.href = url; a.download = 'water_sensor_history.csv'; a.click(); URL.revokeObjectURL(url); toast('CSV export started.');
  });
  document.querySelectorAll('[data-scenario]').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.scenario === 'normal') { $('simInlet').value = '8'; $('simOutlet').value = '7.9'; $('simPressure').value = '3.0'; $('simValve').value = 'open'; $('simLabel').value = '0'; }
    else { $('simInlet').value = '8'; $('simOutlet').value = '4.5'; $('simPressure').value = '2.1'; $('simValve').value = 'open'; $('simLabel').value = '1'; }
  }));
  async function sendReading(e) {
    e.preventDefault(); if (!state.db || !state.user) return toast('Sign in before sending a reading.', true);
    const inlet = Number($('simInlet').value), outlet = Number($('simOutlet').value), pressure = Number($('simPressure').value);
    if (![inlet,outlet,pressure].every(Number.isFinite) || inlet < 0 || inlet > 20 || outlet < 0 || outlet > 20 || pressure < 0 || pressure > 5) return toast('Enter valid flow (0–20) and pressure (0–5) values.', true);
    const r = { ts: Math.floor(Date.now()/1000), inlet_flow: inlet, outlet_flow: outlet, pressure, valve: $('simValve').value, label: Number($('simLabel').value) };
    $('sendReadingBtn').disabled = true; $('simMessage').classList.remove('error'); $('simMessage').textContent = 'Sending reading…';
    try { await state.db.ref('readings').push(r); await state.db.ref('latest').set(r); $('simMessage').textContent = 'Reading sent successfully to /readings and /latest.'; toast('Sensor reading sent to Firebase.'); }
    catch (err) { $('simMessage').classList.add('error'); $('simMessage').textContent = friendlyError(err); toast(friendlyError(err), true); }
    finally { $('sendReadingBtn').disabled = false; }
  }
  $('simForm').addEventListener('submit', sendReading);
  async function setValve(value) {
    if (!state.db || !state.user) return toast('Sign in before changing the command.', true);
    try { await state.db.ref('command').set({ valve: value, updated_at: Math.floor(Date.now()/1000), updated_by: state.user.uid }); toast('Valve ' + value + ' command saved to Firebase.'); }
    catch (err) { toast(friendlyError(err), true); }
  }
  $('closeValveBtn').addEventListener('click', () => setValve('close')); $('openValveBtn').addEventListener('click', () => setValve('open'));
  setAuthMode('signin'); initFirebase();
})();
