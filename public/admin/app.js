// YOPAL EXPRESS - SUPER ADMIN & TORRE DE CONTROL JS

let map;
let driverMarkers = {};
let merchantMarkers = {};
let orderMarkers = {};
let socket;
let currentDrivers = [];

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initSocket();
  refreshData();
  setInterval(refreshData, 10000); // Polling de respaldo cada 10s
});

let activeTileLayer;

function initMap() {
  // Coordenadas Parque Santander, Yopal (5.3377, -72.3958)
  map = L.map('admin-map').setView([5.3377, -72.3958], 14);

  // Capa dinámica según Modo Día / Noche
  activeTileLayer = window.getLupinMapTileLayer ? window.getLupinMapTileLayer() : L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
  activeTileLayer.addTo(map);

  // Escuchar cambios de tema en vivo
  window.addEventListener('lupin:themeChanged', () => {
    if (map && activeTileLayer) {
      map.removeLayer(activeTileLayer);
      activeTileLayer = window.getLupinMapTileLayer();
      activeTileLayer.addTo(map);
    }
  });

  // Dibujar polígonos de zonas de Yopal con los 2 colores principales
  const centroZone = L.circle([5.3385, -72.3960], {
    color: '#ea580c',
    fillColor: '#ea580c',
    fillOpacity: 0.08,
    radius: 1200
  }).addTo(map).bindPopup('<b>Zona Centro</b><br>Tarifa Base: $4.000 COP');

  const norteZone = L.circle([5.3500, -72.4020], {
    color: '#ea580c',
    fillColor: '#ea580c',
    fillOpacity: 0.06,
    radius: 1000
  }).addTo(map).bindPopup('<b>Zona Norte / Campiña</b><br>Tarifa: $4.500 COP');

  const surZone = L.circle([5.3150, -72.3990], {
    color: '#10b981',
    fillColor: '#10b981',
    fillOpacity: 0.08,
    radius: 1200
  }).addTo(map).bindPopup('<b>Zona Sur / Llano Lindo</b><br>Tarifa: $5.000 COP');
}

function initSocket() {
  socket = io();
  socket.emit('join:admin');

  socket.on('admin:driver_moved', (data) => {
    updateDriverOnMap(data.driverId, data.lat, data.lng, data.heading);
  });

  socket.on('admin:order_created', (data) => {
    playChime();
    refreshData();
  });

  socket.on('admin:order_updated', (data) => {
    refreshData();
  });

  socket.on('admin:driver_status_changed', () => {
    refreshData();
  });
}

function formatCOP(num) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(num || 0);
}

async function refreshData() {
  await Promise.all([fetchMetrics(), fetchDrivers(), fetchOrders(), fetchMerchants()]);
}

async function fetchMetrics() {
  try {
    const res = await fetch('/api/admin/metrics');
    const data = await res.json();
    const m = data.metrics;

    document.getElementById('metric-gmv').textContent = formatCOP(m.todayGmv);
    document.getElementById('metric-profit').textContent = formatCOP(m.todayPlatformProfit);
    document.getElementById('metric-merchant-payout').textContent = formatCOP(m.todayMerchantPayout);
    document.getElementById('metric-active-orders').textContent = m.activeOrders;
    document.getElementById('metric-drivers').textContent = `${m.onlineDrivers} (${m.availableDrivers} libres)`;
    document.getElementById('metric-errands').textContent = m.todayErrands || 0;
  } catch (err) {
    console.error('Error fetching metrics:', err);
  }
}

async function fetchMerchants() {
  try {
    const res = await fetch('/api/merchants');
    const data = await res.json();

    data.merchants.forEach(m => {
      if (!merchantMarkers[m.id]) {
        const iconHtml = `
          <div style="background:#8b5cf6; color:white; width:30px; height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.3); border:2px solid white;">
            <i class="fa-solid fa-utensils" style="font-size:12px;"></i>
          </div>
        `;
        const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [30, 30], iconAnchor: [15, 15] });
        const marker = L.marker([m.lat, m.lng], { icon }).addTo(map);
        marker.bindPopup(`<b>${m.name}</b><br>${m.category}<br>${m.address}`);
        merchantMarkers[m.id] = marker;
      }
    });
  } catch (e) {
    console.error(e);
  }
}

async function fetchDrivers() {
  try {
    const res = await fetch('/api/drivers/active');
    const data = await res.json();
    currentDrivers = data.drivers;

    data.drivers.forEach(d => {
      updateDriverOnMap(d.id, d.lat, d.lng, d.heading, d);
    });
  } catch (err) {
    console.error('Error fetching drivers:', err);
  }
}

function updateDriverOnMap(driverId, lat, lng, heading = 0, driverObj = null) {
  if (lat == null || lng == null) return;

  const isBusy = driverObj ? driverObj.is_busy : false;
  const name = driverObj ? driverObj.name : 'Repartidor';
  const color = isBusy ? '#f97316' : '#10b981';

  const iconHtml = `
    <div style="background:${color}; color:white; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px ${color}; border:2px solid white; transform: rotate(${heading}deg);">
      <i class="fa-solid fa-motorcycle" style="font-size:14px;"></i>
    </div>
  `;

  const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [32, 32], iconAnchor: [16, 16] });

  if (driverMarkers[driverId]) {
    driverMarkers[driverId].setLatLng([lat, lng]);
    driverMarkers[driverId].setIcon(icon);
  } else {
    const marker = L.marker([lat, lng], { icon }).addTo(map);
    marker.bindPopup(`<b>🛵 ${name}</b><br>Estado: ${isBusy ? 'Ocupado en Entrega' : 'Libre para Pedidos'}`);
    driverMarkers[driverId] = marker;
  }
}

async function fetchOrders() {
  try {
    const res = await fetch('/api/orders');
    const data = await res.json();
    renderOrders(data.orders);
  } catch (err) {
    console.error('Error fetching orders:', err);
  }
}

function getStatusBadge(status) {
  const map = {
    created: { bg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30', label: 'Recibido' },
    confirmed: { bg: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30', label: 'Confirmado' },
    preparing: { bg: 'bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/40', label: 'En Cocina' },
    ready_for_pickup: { bg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', label: 'Listo p/ Recoger' },
    driver_assigned: { bg: 'bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/40', label: 'Repartidor Asignado' },
    on_the_way: { bg: 'bg-orange-600 text-white border-orange-600', label: 'En Camino 🛵' },
    delivered: { bg: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40', label: 'Entregado ✅' },
    cancelled: { bg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30', label: 'Cancelado' }
  };
  const s = map[status] || { bg: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700', label: status };
  return `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold border ${s.bg}">${s.label}</span>`;
}

function renderOrders(orders) {
  const container = document.getElementById('orders-container');
  const badge = document.getElementById('order-count-badge');
  
  const activeOrders = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
  badge.textContent = `${activeOrders.length} activos`;

  if (orders.length === 0) {
    container.innerHTML = `<div class="text-center py-10 text-slate-500 text-sm">No hay pedidos registrados hoy.</div>`;
    return;
  }

  container.innerHTML = orders.map(o => `
    <div class="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 transition-all hover:border-slate-600">
      <div class="flex items-center justify-between mb-2">
        <span class="font-black text-sm text-white tracking-wide">${o.order_number}</span>
        ${getStatusBadge(o.status)}
      </div>

      <div class="text-xs text-slate-300 space-y-1 mb-3">
        <div class="flex items-center gap-1.5">
          <i class="fa-solid fa-utensils text-purple-400 w-4"></i>
          <span class="font-semibold text-white">${o.merchant_name}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <i class="fa-solid fa-user text-slate-400 w-4"></i>
          <span>${o.client_name} • ${o.client_phone}</span>
        </div>
        <div class="flex items-center gap-1.5 text-slate-400">
          <i class="fa-solid fa-location-dot text-rose-400 w-4"></i>
          <span class="truncate">${o.delivery_address}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <i class="fa-solid fa-motorcycle text-amber-400 w-4"></i>
          <span>${o.driver_name ? `${o.driver_name} (${o.driver_phone})` : '<span class="text-orange-400 italic">Sin repartidor asignado</span>'}</span>
        </div>
      </div>

      <div class="flex items-center justify-between pt-2 border-t border-slate-700/60 text-xs">
        <div>
          <span class="text-slate-400">Total:</span>
          <span class="font-bold text-white ml-1">${formatCOP(o.total_amount)}</span>
          <span class="text-slate-400 ml-1">(${o.payment_method.toUpperCase()})</span>
        </div>
        
        <div class="flex gap-2">
          ${!o.driver_id && o.status !== 'delivered' && o.status !== 'cancelled' ? `
            <button onclick="openDispatchModal('${o.id}', '${o.order_number}')" class="px-2.5 py-1 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg transition-colors flex items-center gap-1">
              <i class="fa-solid fa-paper-plane"></i> Despachar
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function openDispatchModal(orderId, orderNumber) {
  document.getElementById('modal-order-id').value = orderId;
  document.getElementById('modal-order-number').textContent = orderNumber;

  const driversList = document.getElementById('modal-drivers-list');
  const available = currentDrivers.filter(d => d.is_online === 1);

  if (available.length === 0) {
    driversList.innerHTML = `<div class="p-3 text-center text-xs text-rose-400 bg-rose-500/10 rounded-xl">No hay repartidores conectados en este momento.</div>`;
  } else {
    driversList.innerHTML = available.map(d => `
      <div onclick="assignDriverManual('${orderId}', '${d.id}')" class="p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex items-center justify-between cursor-pointer transition-colors">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full ${d.is_busy ? 'bg-orange-500/20 text-orange-400' : 'bg-emerald-500/20 text-emerald-400'} flex items-center justify-center font-bold text-xs">
            <i class="fa-solid fa-motorcycle"></i>
          </div>
          <div>
            <p class="text-xs font-bold text-white">${d.name}</p>
            <p class="text-[10px] text-slate-400">${d.phone} • Placa: ${d.plate_number || 'N/A'}</p>
          </div>
        </div>
        <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${d.is_busy ? 'bg-orange-500/20 text-orange-400' : 'bg-emerald-500/20 text-emerald-400'}">
          ${d.is_busy ? 'Ocupado' : 'Disponible'}
        </span>
      </div>
    `).join('');
  }

  document.getElementById('dispatch-modal').classList.remove('hidden');
}

function closeDispatchModal() {
  document.getElementById('dispatch-modal').classList.add('hidden');
}

async function assignDriverManual(orderId, driverId) {
  try {
    const res = await fetch('/api/admin/dispatch-manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, driver_id: driverId })
    });
    const data = await res.json();
    if (res.ok) {
      closeDispatchModal();
      refreshData();
    } else {
      alert(data.error || 'Error al asignar');
    }
  } catch (err) {
    alert('Error en conexión');
  }
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch(e) {}
}
