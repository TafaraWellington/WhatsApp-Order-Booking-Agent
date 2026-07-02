/* ============================================================
   WhatsApp Order Dashboard — JavaScript
   Vanilla fetch-based SPA, SSE for live updates, Chart.js CDN
   ============================================================ */

// ── Load Chart.js from CDN ─────────────────────────────────────
(function () {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
  script.onload = () => { console.log('Chart.js loaded'); initCharts(); };
  document.head.appendChild(script);
})();

// ── State ──────────────────────────────────────────────────────
let currentTab = 'orders';
let editingItemId = null;
let hourlyChart = null;
let weeklyChart = null;

const STATUS_CHIPS = {
  pending:   '<span class="chip chip-pending">⏳ Pending</span>',
  confirmed: '<span class="chip chip-confirmed">✅ Confirmed</span>',
  done:      '<span class="chip chip-done">🎉 Done</span>',
  cancelled: '<span class="chip chip-cancelled">❌ Cancelled</span>',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Helpers ────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const fmt = (n) => `R${Number(n || 0).toFixed(2)}`;
const fmtDate = (iso) => new Date(iso).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Toast ──────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'success') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast toast-${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
}

// ── Tab navigation ─────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    switchTab(tab);
  });
});

function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  $(`tab-${tab}`).classList.add('active');
  currentTab = tab;

  if (tab === 'orders') loadOrders();
  if (tab === 'menu') loadMenu();
  if (tab === 'stats') loadStats();
  if (tab === 'settings') loadSettings();
}

// ── Orders ─────────────────────────────────────────────────────
async function loadOrders() {
  const status = $('filter-status').value;
  const type = $('filter-type').value;
  const date = $('filter-date').value;

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (type) params.set('type', type);
  if (date) params.set('date', date);

  try {
    const { orders } = await api(`/orders?${params}`);
    renderOrders(orders);
    updatePendingBadge(orders);
  } catch (err) {
    showToast('Failed to load orders: ' + err.message, 'error');
  }
}

function renderOrders(orders) {
  const list = $('orders-list');
  const empty = $('orders-empty');

  if (!orders.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = orders.map((o) => {
    const icon = o.type === 'booking' ? '📅' : '🛒';
    const ref = o.type === 'booking'
      ? `BKG-${String(o.id).padStart(4, '0')}`
      : `ORD-${String(o.id).padStart(4, '0')}`;

    return `
      <div class="order-card" id="order-card-${o.id}" data-id="${o.id}" onclick="openOrderModal(${o.id})">
        <span class="order-type-icon">${icon}</span>
        <div class="order-meta">
          <div class="order-ref">${ref}</div>
          <div class="order-name">${escHtml(o.wa_name || o.wa_sender)}</div>
          <div class="order-detail">${fmtDate(o.created_at)} · ${o.wa_sender}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <div class="order-amount">${fmt(o.total_amount)}</div>
          ${STATUS_CHIPS[o.status] || o.status}
        </div>
        <div class="order-actions" onclick="event.stopPropagation()">
          ${statusActionButtons(o)}
        </div>
      </div>`;
  }).join('');
}

function statusActionButtons(o) {
  const actions = [];
  if (o.status === 'pending') {
    actions.push(`<button class="btn btn-sm btn-primary" onclick="setStatus(${o.id},'confirmed')">Confirm</button>`);
    actions.push(`<button class="btn btn-sm btn-danger" onclick="setStatus(${o.id},'cancelled')">Cancel</button>`);
  }
  if (o.status === 'confirmed') {
    actions.push(`<button class="btn btn-sm btn-primary" onclick="setStatus(${o.id},'done')">✓ Done</button>`);
  }
  return actions.join('');
}

async function setStatus(id, status) {
  try {
    await api(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    showToast(`Order updated → ${status}`);
    loadOrders();
    if ($('modal-overlay').style.display !== 'none') {
      openOrderModal(id);
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function updatePendingBadge(orders) {
  const pending = orders.filter((o) => o.status === 'pending').length;
  const badge = $('pending-badge');
  badge.textContent = pending;
  badge.style.display = pending > 0 ? 'flex' : 'none';
}

// ── Order modal ────────────────────────────────────────────────
async function openOrderModal(id) {
  try {
    const o = await api(`/orders/${id}`);
    const ref = o.type === 'booking'
      ? `BKG-${String(o.id).padStart(4, '0')}`
      : `ORD-${String(o.id).padStart(4, '0')}`;
    const icon = o.type === 'booking' ? '📅' : '🛒';

    let itemsHtml = '';
    if (o.type === 'order' && o.items?.length) {
      itemsHtml = `
        <div style="margin:16px 0 8px;font-size:12px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em">Items</div>
        ${o.items.map((i) => `
          <div class="modal-item-row">
            <span>${i.qty}× ${escHtml(i.name)}</span>
            <span>${fmt(i.qty * i.unit_price)}</span>
          </div>`).join('')}
        <div class="modal-total"><span>Total</span><span>${fmt(o.total_amount)}</span></div>`;
    }

    if (o.type === 'booking' && o.booking) {
      const b = o.booking;
      itemsHtml = `
        <div style="margin:16px 0 8px;font-size:12px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em">Booking Details</div>
        <div class="modal-detail-row"><span class="modal-detail-label">Service</span><span class="modal-detail-value">${escHtml(b.service_name || '—')}</span></div>
        <div class="modal-detail-row"><span class="modal-detail-label">Date</span><span class="modal-detail-value">${b.slot_date}</span></div>
        <div class="modal-detail-row"><span class="modal-detail-label">Time</span><span class="modal-detail-value">${b.slot_time}</span></div>
        <div class="modal-detail-row"><span class="modal-detail-label">Duration</span><span class="modal-detail-value">${b.duration_mins ? b.duration_mins + ' min' : '—'}</span></div>
        <div class="modal-total"><span>Price</span><span>${fmt(o.total_amount)}</span></div>`;
    }

    $('modal-content').innerHTML = `
      <div style="margin-bottom:16px">
        <div style="font-size:22px;margin-bottom:4px">${icon} ${ref}</div>
        <div style="font-size:16px;font-weight:700">${escHtml(o.wa_name || o.wa_sender)}</div>
        <div style="font-size:12px;color:var(--text-2);margin-top:2px">${o.wa_sender} · ${fmtDate(o.created_at)}</div>
      </div>
      <div class="modal-detail-row">
        <span class="modal-detail-label">Status</span>
        <span>${STATUS_CHIPS[o.status]}</span>
      </div>
      ${itemsHtml}
      <div class="modal-status-row">
        ${o.status === 'pending' ? `
          <button class="btn btn-primary btn-sm" onclick="setStatus(${o.id},'confirmed')">✅ Confirm</button>
          <button class="btn btn-danger btn-sm" onclick="setStatus(${o.id},'cancelled')">❌ Cancel</button>` : ''}
        ${o.status === 'confirmed' ? `
          <button class="btn btn-primary btn-sm" onclick="setStatus(${o.id},'done')">🎉 Mark Done</button>` : ''}
      </div>`;

    $('modal-overlay').style.display = 'flex';
  } catch (err) {
    showToast('Failed to load order: ' + err.message, 'error');
  }
}

$('modal-close').addEventListener('click', () => { $('modal-overlay').style.display = 'none'; });
$('modal-overlay').addEventListener('click', (e) => {
  if (e.target === $('modal-overlay')) $('modal-overlay').style.display = 'none';
});

// ── Filters ────────────────────────────────────────────────────
['filter-status', 'filter-type', 'filter-date'].forEach((id) => {
  $(id).addEventListener('change', loadOrders);
});
$('btn-refresh').addEventListener('click', loadOrders);

// ── Menu ───────────────────────────────────────────────────────
async function loadMenu() {
  try {
    const { items } = await api('/menu');
    renderMenu(items);
  } catch (err) {
    showToast('Failed to load menu: ' + err.message, 'error');
  }
}

function renderMenu(items) {
  const tbody = $('menu-tbody');
  const empty = $('menu-empty');

  if (!items.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = items.map((item) => `
    <tr id="menu-row-${item.id}">
      <td>${escHtml(item.category)}</td>
      <td><strong>${escHtml(item.name)}</strong></td>
      <td style="color:var(--text-2)">${escHtml(item.description || '')}</td>
      <td><strong>${fmt(item.price)}</strong></td>
      <td>${item.duration_mins ? item.duration_mins + ' min' : '—'}</td>
      <td>
        <label class="toggle-label" onclick="toggleAvailable(event, ${item.id}, ${!item.available})">
          <input type="checkbox" ${item.available ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="editItem(${item.id})">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteItem(${item.id})">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
}

async function toggleAvailable(event, id, newVal) {
  event.stopPropagation();
  try {
    await api(`/menu/${id}`, { method: 'PATCH', body: JSON.stringify({ available: newVal }) });
    showToast(newVal ? 'Item marked unavailable' : 'Item now available');
    loadMenu();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

$('btn-add-item').addEventListener('click', () => {
  editingItemId = null;
  $('form-title').textContent = 'New Item';
  $('f-category').value = '';
  $('f-name').value = '';
  $('f-price').value = '';
  $('f-duration').value = '';
  $('f-description').value = '';
  $('f-available').checked = true;
  $('item-form-card').style.display = 'block';
  $('f-name').focus();
});

function editItem(id) {
  const row = $(`menu-row-${id}`);
  if (!row) return;
  const cells = row.querySelectorAll('td');
  editingItemId = id;
  $('form-title').textContent = 'Edit Item';
  $('f-category').value = cells[0].textContent.trim();
  $('f-name').value = cells[1].textContent.trim();
  $('f-description').value = cells[2].textContent.trim();
  $('f-price').value = cells[3].textContent.replace('R', '');
  $('f-duration').value = cells[4].textContent === '—' ? '' : parseInt(cells[4].textContent);
  $('f-available').checked = row.querySelector('input[type=checkbox]').checked;
  $('item-form-card').style.display = 'block';
  $('f-name').focus();
}

$('btn-save-item').addEventListener('click', async () => {
  const name = $('f-name').value.trim();
  const price = $('f-price').value.trim();
  if (!name || !price) { showToast('Name and price are required', 'error'); return; }

  const payload = {
    category: $('f-category').value.trim() || 'General',
    name,
    description: $('f-description').value.trim(),
    price: parseFloat(price),
    duration_mins: $('f-duration').value ? parseInt($('f-duration').value) : null,
    available: $('f-available').checked,
  };

  try {
    if (editingItemId) {
      await api(`/menu/${editingItemId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      showToast('Item updated!');
    } else {
      await api('/menu', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Item added!');
    }
    $('item-form-card').style.display = 'none';
    loadMenu();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
});

$('btn-cancel-item').addEventListener('click', () => { $('item-form-card').style.display = 'none'; });

async function deleteItem(id) {
  if (!confirm('Delete this item? This cannot be undone.')) return;
  try {
    await api(`/menu/${id}`, { method: 'DELETE' });
    showToast('Item deleted');
    loadMenu();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ── Stats ──────────────────────────────────────────────────────
async function loadStats() {
  try {
    const data = await api('/stats');
    renderStats(data);
  } catch (err) {
    showToast('Failed to load stats: ' + err.message, 'error');
  }
}

function renderStats(data) {
  const { today, hourly, weekly } = data;
  $('stat-orders').textContent = today.orders;
  $('stat-bookings').textContent = today.bookings;
  $('stat-revenue').textContent = `R${today.revenue.toFixed(0)}`;
  $('stat-pending').textContent = today.pending;

  renderHourlyChart(hourly);
  renderWeeklyChart(weekly);
}

function initCharts() {
  // Charts are rendered lazily when stats tab opens
}

function renderHourlyChart(hourly) {
  const ctx = $('chart-hourly').getContext('2d');
  const labels = Array.from({ length: 18 }, (_, i) => {
    const h = i + 6; // 06:00 – 23:00
    return h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
  });
  const hours = Array.from({ length: 18 }, (_, i) => String(i + 6).padStart(2, '0'));
  const counts = hours.map((h) => {
    const found = hourly.find((r) => r.hour === h);
    return found ? Number(found.count) : 0;
  });

  if (hourlyChart) hourlyChart.destroy();
  hourlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Orders',
        data: counts,
        backgroundColor: 'rgba(0,200,83,0.3)',
        borderColor: '#00C853',
        borderWidth: 2,
        borderRadius: 4,
      }],
    },
    options: chartOptions('Orders'),
  });
}

function renderWeeklyChart(weekly) {
  const ctx = $('chart-weekly').getContext('2d');
  const labels = weekly.map((r) => r.day.slice(5)); // MM-DD
  const revenues = weekly.map((r) => Number(r.revenue || 0));

  if (weeklyChart) weeklyChart.destroy();
  weeklyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Revenue (R)',
        data: revenues,
        borderColor: '#FFD600',
        backgroundColor: 'rgba(255,214,0,0.1)',
        borderWidth: 2,
        pointBackgroundColor: '#FFD600',
        fill: true,
        tension: 0.3,
      }],
    },
    options: chartOptions('Revenue (R)'),
  });
}

function chartOptions(label) {
  return {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#111118',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        titleColor: '#9090a8',
        bodyColor: '#f0f0f5',
      },
    },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#5a5a72', font: { size: 11 } } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#5a5a72', font: { size: 11 } }, beginAtZero: true },
    },
  };
}

$('btn-refresh-stats').addEventListener('click', loadStats);

// ── Settings ───────────────────────────────────────────────────
async function loadSettings() {
  try {
    const { business, hours } = await api('/settings');

    $('s-name').value = business.name || '';
    $('s-welcome').value = business.welcome_message || '';
    $('s-slot').value = business.slot_duration_mins || 30;

    renderHoursForm(hours);
  } catch (err) {
    showToast('Failed to load settings: ' + err.message, 'error');
  }
}

function renderHoursForm(hours) {
  const container = $('hours-form');
  container.innerHTML = hours.map((h) => `
    <div class="hours-row" data-day="${h.day_of_week}">
      <span class="hours-day">${DAYS[h.day_of_week]}</span>
      <input type="time" class="h-open" value="${h.open_time}" ${h.is_closed ? 'disabled' : ''} />
      <input type="time" class="h-close" value="${h.close_time}" ${h.is_closed ? 'disabled' : ''} />
      <label class="toggle-label" style="font-size:12px">
        <input type="checkbox" class="h-closed" ${h.is_closed ? 'checked' : ''}
               onchange="toggleDayClosed(this, ${h.day_of_week})" />
        <span class="toggle-slider"></span>
        Closed
      </label>
    </div>`).join('');
}

function toggleDayClosed(checkbox, dayIdx) {
  const row = document.querySelector(`.hours-row[data-day="${dayIdx}"]`);
  row.querySelectorAll('input[type=time]').forEach((i) => { i.disabled = checkbox.checked; });
}

$('btn-save-settings').addEventListener('click', async () => {
  const payload = {
    name: $('s-name').value.trim(),
    welcome_message: $('s-welcome').value.trim(),
    slot_duration_mins: parseInt($('s-slot').value),
  };
  try {
    await api('/settings', { method: 'PATCH', body: JSON.stringify(payload) });
    $('biz-name').textContent = payload.name;
    showToast('Settings saved!');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
});

$('btn-save-hours').addEventListener('click', async () => {
  const rows = document.querySelectorAll('.hours-row');
  const hours = Array.from(rows).map((row) => ({
    day_of_week: parseInt(row.dataset.day),
    open_time:  row.querySelector('.h-open').value,
    close_time: row.querySelector('.h-close').value,
    is_closed:  row.querySelector('.h-closed').checked,
  }));
  try {
    await api('/hours', { method: 'PATCH', body: JSON.stringify({ hours }) });
    showToast('Business hours saved!');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
});

// ── SSE — live order alerts ─────────────────────────────────────
function connectSSE() {
  const sse = new EventSource('/api/sse');
  const dot = $('sse-dot');
  const label = $('sse-label');

  sse.onopen = () => {
    dot.classList.add('connected');
    label.textContent = 'Live';
  };

  sse.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      const type = data.type === 'booking' ? '📅 New Booking' : '🛒 New Order';
      showToast(`${type} received!`, 'info');
      if (currentTab === 'orders') loadOrders();
      if (currentTab === 'stats') loadStats();
    } catch (_) {}
  };

  sse.onerror = () => {
    dot.classList.remove('connected');
    label.textContent = 'Reconnecting…';
    sse.close();
    setTimeout(connectSSE, 5000);
  };
}

// ── XSS prevention ─────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Initialise ─────────────────────────────────────────────────
async function init() {
  // Load business name into sidebar
  try {
    const { business } = await api('/settings');
    $('biz-name').textContent = business.name;
  } catch (_) {}

  connectSSE();
  loadOrders();
}

init();
