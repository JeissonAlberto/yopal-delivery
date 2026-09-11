// LUPIN EXPRESS - APP MÓVIL REPARTIDOR JS (V2.5 ENTERPRISE)
// Interfaz móvil nativa para motorizados en Yopal

let currentDriverId = 'drv-01';
let socket;
let currentOrder = null;
let pendingOffer = null;
let allDrivers = [];
let driverMap;
let driverMarker;
let simInterval = null;
let otpInputValue = '';

function openExternalGps(target) {
  if (!currentOrder) return;
  let lat = currentOrder.delivery_lat;
  let lng = currentOrder.delivery_lng;

  if (target === 'merchant' || (target === 'auto' && currentOrder.status === 'driver_assigned')) {
    lat = currentOrder.merchant_lat;
    lng = currentOrder.merchant_lng;
  }

  if (lat && lng) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  }
}

// Ubicación actual del repartidor en Yopal
let driverLocation = {
  lat: 5.3385,
  lng: -72.3962,
  heading: 45
};

document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  loadDrivers();
  initDriverMap();
});

function initSocket() {
  socket = io();

  socket.on('connect', () => {
    if (currentDriverId) socket.emit('join:driver', currentDriverId);
  });

  socket.on('reconnect', () => {
    if (currentDriverId) {
      socket.emit('join:driver', currentDriverId);
      changeDriver();
    }
  });

  socket.on('order:assigned', (offer) => {
    playRadarAlert();
    pendingOffer = offer;
    showOfferModal(offer);
  });

  socket.on('order:status_update', (data) => {
    if (currentOrder && data.orderId === currentOrder.id) {
      currentOrder.status = data.status;
      renderActiveOrderFlow();
    }
  });
}

function joinDriverRoom(id) {
  if (socket) {
    socket.emit('join:driver', id);
  }
}

async function loadDrivers() {
  try {
    const res = await fetch('/api/drivers/active');
    const data = await res.json();
    allDrivers = data.drivers || [];

    const select = document.getElementById('driver-selector');
    if (select) {
      select.innerHTML = allDrivers.map(d => `
        <option value="${d.id}" ${d.id === currentDriverId ? 'selected' : ''}>${d.name}</option>
      `).join('');
    }

    changeDriver();
  } catch (err) {
    console.error('Error cargando repartidores:', err);
  }
}

async function changeDriver() {
  const select = document.getElementById('driver-selector');
  if (select) currentDriverId = select.value;
  joinDriverRoom(currentDriverId);

  try {
    const res = await fetch(`/api/drivers/${currentDriverId}`);
    const data = await res.json();
    const d = data.driver;

    driverLocation.lat = d.lat || 5.3385;
    driverLocation.lng = d.lng || -72.3962;

    const earnEl = document.getElementById('drv-earnings');
    const cashEl = document.getElementById('drv-cash');
    const countEl = document.getElementById('drv-count');

    if (earnEl) earnEl.textContent = formatCOP(d.balance_earnings);
    if (cashEl) cashEl.textContent = formatCOP(d.balance_cash_collected);
    if (countEl) countEl.textContent = d.total_deliveries;

    updateOnlineButton(d.is_online);

    if (data.currentOrder) {
      currentOrder = data.currentOrder;
      showActiveOrderView();
    } else {
      currentOrder = null;
      showIdleView();
    }
  } catch (e) {
    console.error(e);
  }
}

function formatCOP(num) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(num || 0);
}

function updateOnlineButton(isOnline) {
  const btn = document.getElementById('btn-toggle-online');
  if (!btn) return;
  if (isOnline) {
    btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black tracking-wider transition-all bg-emerald-500 text-white shadow-md shadow-emerald-500/25 cursor-pointer';
    btn.innerHTML = `<span class="w-2 h-2 rounded-full bg-white animate-ping"></span><span id="label-online-status">CONECTADO</span>`;
  } else {
    btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black tracking-wider transition-all bg-rose-600 text-white shadow-md shadow-rose-600/25 cursor-pointer';
    btn.innerHTML = `<span class="w-2 h-2 rounded-full bg-white"></span><span id="label-online-status">DESCONECTADO</span>`;
  }
}

async function toggleOnlineStatus() {
  try {
    const res = await fetch(`/api/drivers/${currentDriverId}/toggle-online`, { method: 'PATCH' });
    const data = await res.json();
    updateOnlineButton(data.is_online);
  } catch (e) {
    console.error(e);
  }
}

// --------------------------------------------------------------------------
// VISTAS IDLE Y PEDIDO ACTIVO
// --------------------------------------------------------------------------
function showIdleView() {
  const idle = document.getElementById('driver-idle-overlay');
  const pill = document.getElementById('driver-summary-pill');
  const activeCard = document.getElementById('driver-active-card');
  const navBanner = document.getElementById('driver-nav-banner');

  if (idle) idle.classList.remove('hidden');
  if (pill) pill.classList.remove('hidden');
  if (activeCard) activeCard.classList.add('hidden');
  if (navBanner) navBanner.classList.add('hidden');

  if (driverMap) {
    driverMap.setView([driverLocation.lat, driverLocation.lng], 15);
  }
}

function showActiveOrderView() {
  const idle = document.getElementById('driver-idle-overlay');
  const pill = document.getElementById('driver-summary-pill');
  const activeCard = document.getElementById('driver-active-card');
  const navBanner = document.getElementById('driver-nav-banner');

  if (idle) idle.classList.add('hidden');
  if (pill) pill.classList.add('hidden');
  if (activeCard) activeCard.classList.remove('hidden');
  if (navBanner) navBanner.classList.remove('hidden');

  document.getElementById('active-order-number').textContent = `#${currentOrder.order_number}`;
  const earning = Math.round(currentOrder.delivery_fee * 0.85);
  document.getElementById('active-order-fee').textContent = `+${formatCOP(earning)} COP`;

  document.getElementById('active-merchant-name').textContent = currentOrder.merchant_name;
  document.getElementById('active-merchant-address').textContent = currentOrder.merchant_address;

  document.getElementById('active-client-name').textContent = currentOrder.client_name;
  document.getElementById('active-client-address').textContent = currentOrder.delivery_address;
  document.getElementById('active-client-ref').textContent = currentOrder.delivery_reference ? `Ref: ${currentOrder.delivery_reference}` : '';

  const callBtn = document.getElementById('btn-call-client');
  if (callBtn) callBtn.href = `tel:${currentOrder.client_phone || '3123456781'}`;

  document.getElementById('active-total-charge').textContent = `${formatCOP(currentOrder.total_amount)} (${(currentOrder.payment_method || 'cash').toUpperCase()})`;
  if (currentOrder.payment_method === 'cash' && currentOrder.cash_change_due > 0) {
    document.getElementById('active-change-row').classList.remove('hidden');
    document.getElementById('active-change-due').textContent = formatCOP(currentOrder.cash_change_due);
  } else {
    document.getElementById('active-change-row').classList.add('hidden');
  }

  renderActiveOrderFlow();
  updateMapForOrder();
}

function renderActiveOrderFlow() {
  const container = document.getElementById('flow-buttons-container');
  const navLabel = document.getElementById('nav-step-label');
  const navAddress = document.getElementById('nav-step-address');
  const navIcon = document.getElementById('nav-step-icon');
  const status = currentOrder.status;

  if (status === 'driver_assigned' || status === 'ready_for_pickup') {
    if (navLabel) navLabel.textContent = '1. RUTA AL RESTAURANTE';
    if (navAddress) navAddress.textContent = currentOrder.merchant_name;
    if (navIcon) navIcon.innerHTML = '<i class="fa-solid fa-utensils"></i>';

    container.innerHTML = `
      <button onclick="advanceOrderStatus('driver_at_merchant')" class="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white font-black text-xs rounded-2xl shadow-xl shadow-orange-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95">
        <i class="fa-solid fa-location-dot"></i> ¡Llegué al Restaurante!
      </button>
    `;
  } else if (status === 'driver_at_merchant') {
    if (navLabel) navLabel.textContent = '2. RECOGIENDO PEDIDO';
    if (navAddress) navAddress.textContent = 'Verifica el número de pedido en cocina';
    if (navIcon) navIcon.innerHTML = '<i class="fa-solid fa-bag-shopping"></i>';

    container.innerHTML = `
      <button onclick="advanceOrderStatus('on_the_way')" class="w-full py-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-2xl shadow-xl shadow-amber-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95">
        <i class="fa-solid fa-motorcycle"></i> Pedido Recogido • ¡Voy hacia el Cliente!
      </button>
    `;
  } else if (status === 'on_the_way') {
    if (navLabel) navLabel.textContent = '3. RUTA AL DESTINO FINAL';
    if (navAddress) navAddress.textContent = currentOrder.delivery_address;
    if (navIcon) navIcon.innerHTML = '<i class="fa-solid fa-house-chimney"></i>';

    container.innerHTML = `
      <button onclick="openOtpModal()" class="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-2xl shadow-xl shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95">
        <i class="fa-solid fa-key"></i> Llegué donde el Cliente • Entregar con PIN OTP
      </button>
    `;
  } else if (status === 'delivered') {
    container.innerHTML = `
      <div class="p-3 bg-emerald-500/20 text-emerald-400 text-center font-black text-xs rounded-2xl border border-emerald-500/30">
        🎉 ¡Pedido entregado y ganancias abonadas a tu saldo!
      </div>
      <button onclick="finishOrderAndReturnIdle()" class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl mt-2 cursor-pointer">
        Volver a buscar pedidos
      </button>
    `;
  }
}

async function advanceOrderStatus(newStatus) {
  try {
    const res = await fetch(`/api/orders/${currentOrder.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, driver_id: currentDriverId })
    });
    const data = await res.json();
    currentOrder.status = data.order.status;
    renderActiveOrderFlow();

    if (newStatus === 'on_the_way') {
      startSimulatingTripToClient();
    }
  } catch (err) {
    console.error(err);
  }
}

function finishOrderAndReturnIdle() {
  if (simInterval) clearInterval(simInterval);
  currentOrder = null;
  changeDriver();
}

// --------------------------------------------------------------------------
// MAPA LEAFLET FULLSCREEN PARA NAVEGACIÓN
// --------------------------------------------------------------------------
let orderRouteLayer = null;

function initDriverMap() {
  if (driverMap) return;

  const mapEl = document.getElementById('driver-main-map');
  if (!mapEl) return;

  driverMap = L.map('driver-main-map', {
    zoomControl: false
  }).setView([driverLocation.lat, driverLocation.lng], 15);

  L.control.zoom({ position: 'topright' }).addTo(driverMap);

  let tileLayer = window.getLupinMapTileLayer ? window.getLupinMapTileLayer() : L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
  tileLayer.addTo(driverMap);

  window.addEventListener('lupin:themeChanged', () => {
    if (driverMap && tileLayer) {
      driverMap.removeLayer(tileLayer);
      tileLayer = window.getLupinMapTileLayer();
      tileLayer.addTo(driverMap);
    }
  });

  const mIcon = L.divIcon({
    html: `<div style="background:#ea580c; color:white; width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(234,88,12,0.6); border:3px solid white;"><i class="fa-solid fa-motorcycle text-base"></i></div>`,
    className: '',
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });

  driverMarker = L.marker([driverLocation.lat, driverLocation.lng], { icon: mIcon }).addTo(driverMap);
}

function updateMapForOrder() {
  if (!driverMap || !currentOrder) return;

  if (orderRouteLayer) {
    driverMap.removeLayer(orderRouteLayer);
  }

  const coords = [
    [driverLocation.lat, driverLocation.lng],
    [currentOrder.merchant_lat, currentOrder.merchant_lng],
    [currentOrder.delivery_lat, currentOrder.delivery_lng]
  ];

  orderRouteLayer = L.polyline(coords, {
    color: '#ea580c',
    weight: 4,
    dashArray: '8, 8',
    opacity: 0.9
  }).addTo(driverMap);

  driverMap.fitBounds(orderRouteLayer.getBounds(), { padding: [60, 60] });
}

function startSimulatingTripToClient() {
  if (simInterval) clearInterval(simInterval);
  let step = 0;
  const totalSteps = 20;
  const startLat = driverLocation.lat;
  const startLng = driverLocation.lng;
  const endLat = currentOrder.delivery_lat;
  const endLng = currentOrder.delivery_lng;

  simInterval = setInterval(() => {
    step++;
    const progress = step / totalSteps;
    driverLocation.lat = startLat + (endLat - startLat) * progress;
    driverLocation.lng = startLng + (endLng - startLng) * progress;

    if (driverMarker) {
      driverMarker.setLatLng([driverLocation.lat, driverLocation.lng]);
    }

    if (socket) {
      socket.emit('driver:update_location', {
        driverId: currentDriverId,
        orderId: currentOrder ? currentOrder.id : null,
        lat: driverLocation.lat,
        lng: driverLocation.lng,
        heading: 90,
        speed: 35
      });
    }

    if (step >= totalSteps) {
      clearInterval(simInterval);
    }
  }, 1000);
}

// --------------------------------------------------------------------------
// MODAL DE OFERTA ENTRANTE (RADAR SONORO)
// --------------------------------------------------------------------------
function showOfferModal(offer) {
  document.getElementById('offer-order-number').textContent = `#${offer.order_number}`;
  const earning = Math.round(offer.delivery_fee * 0.85);
  document.getElementById('offer-fee').textContent = `+${formatCOP(earning)} COP`;
  document.getElementById('offer-merchant-name').textContent = offer.merchant_name;
  document.getElementById('offer-client-address').textContent = offer.delivery_address;
  document.getElementById('offer-modal').classList.remove('hidden');
}

async function acceptPendingOffer() {
  if (!pendingOffer) return;
  try {
    const res = await fetch(`/api/orders/${pendingOffer.id}/accept-driver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver_id: currentDriverId })
    });
    const data = await res.json();
    document.getElementById('offer-modal').classList.add('hidden');
    currentOrder = data.order;
    showActiveOrderView();
  } catch (err) {
    console.error(err);
  }
}

function rejectPendingOffer() {
  document.getElementById('offer-modal').classList.add('hidden');
  pendingOffer = null;
}

function playRadarAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  } catch(e) {}
}

// --------------------------------------------------------------------------
// VERIFICACIÓN OTP CON TECLADO GIGANTE
// --------------------------------------------------------------------------
function openOtpModal() {
  otpInputValue = '';
  updateOtpDisplay();
  document.getElementById('otp-modal').classList.remove('hidden');
}

function closeOtpModal() {
  document.getElementById('otp-modal').classList.add('hidden');
}

function pressOtpDigit(digit) {
  if (otpInputValue.length < 4) {
    otpInputValue += digit;
    updateOtpDisplay();
  }
}

function clearOtpInput() {
  otpInputValue = otpInputValue.slice(0, -1);
  updateOtpDisplay();
}

function updateOtpDisplay() {
  const input = document.getElementById('otp-digit-input');
  if (input) input.value = otpInputValue;
}

async function confirmOtpDelivery() {
  if (otpInputValue.length !== 4) {
    alert('Por favor ingresa el código PIN completo de 4 dígitos');
    return;
  }

  try {
    const res = await fetch(`/api/orders/${currentOrder.id}/confirm-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp: otpInputValue, driver_id: currentDriverId })
    });
    const data = await res.json();

    if (res.ok) {
      closeOtpModal();
      currentOrder.status = 'delivered';
      renderActiveOrderFlow();
      changeDriver(); // refrescar balance
    } else {
      alert(data.error || 'Código OTP incorrecto');
    }
  } catch (err) {
    alert('Error al verificar OTP');
  }
}

// --------------------------------------------------------------------------
// RETIRO DE GANANCIAS A NEQUI / BRE-B
// --------------------------------------------------------------------------
function openWithdrawModal() {
  document.getElementById('withdraw-modal').classList.remove('hidden');
}

function closeWithdrawModal() {
  document.getElementById('withdraw-modal').classList.add('hidden');
}

function setWithdrawAmount(val) {
  const input = document.getElementById('withdraw-amount-input');
  if (!input) return;
  if (val === 'all') {
    const raw = document.getElementById('drv-earnings').textContent;
    const num = parseInt(raw.replace(/\D/g, '')) || 0;
    input.value = num;
  } else {
    input.value = val;
  }
}

async function submitWithdraw() {
  const amountInput = document.getElementById('withdraw-amount-input');
  const keyInput = document.getElementById('withdraw-key-input');
  const btn = document.getElementById('btn-submit-withdraw');

  const amount = parseInt(amountInput.value);
  const key = keyInput.value.trim();

  if (!amount || amount <= 0) {
    alert('Por favor ingresa un monto válido a retirar');
    return;
  }
  if (!key) {
    alert('Por favor ingresa tu número de Nequi o Llave Bre-B');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Procesando transferencia...`;

  try {
    const res = await fetch(`/api/drivers/${currentDriverId}/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_cop: amount, bre_b_key: key, account_type: 'nequi' })
    });
    const data = await res.json();

    if (res.ok) {
      alert(data.message || '¡Transferencia exitosa!');
      closeWithdrawModal();
      amountInput.value = '';
      changeDriver(); // recargar saldo
    } else {
      alert(data.error || 'Error procesando el retiro');
    }
  } catch (e) {
    alert('Error de conexión al solicitar retiro');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-bolt"></i> Transferir a mi Nequi / Bre-B`;
  }
}
