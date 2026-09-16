// YOPAL EXPRESS - PORTAL COMERCIO / RESTAURANTE JS

let currentMerchantId = 'mch-01';
let socket;
let currentOrders = [];
let allMerchants = [];

document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  loadMerchants();
  setInterval(() => {
    loadMerchantOrders();
  }, 10000);
});

function initSocket() {
  socket = io();

  socket.on('connect', () => {
    if (currentMerchantId) socket.emit('join:merchant', currentMerchantId);
  });

  socket.on('reconnect', () => {
    if (currentMerchantId) {
      socket.emit('join:merchant', currentMerchantId);
      loadMerchantOrders();
    }
  });

  socket.on('order:new', (data) => {
    playOrderBell();
    loadMerchantOrders();
  });

  socket.on('order:status_update', () => {
    loadMerchantOrders();
  });
}

function joinMerchantSocket(merchantId) {
  if (socket) {
    socket.emit('join:merchant', merchantId);
  }
}

async function loadMerchants() {
  try {
    const res = await fetch('/api/merchants');
    const data = await res.json();
    allMerchants = data.merchants;

    const select = document.getElementById('merchant-selector');
    select.innerHTML = allMerchants.map(m => `
      <option value="${m.id}" ${m.id === currentMerchantId ? 'selected' : ''}>${m.name}</option>
    `).join('');

    changeMerchant();
  } catch (err) {
    console.error('Error loading merchants:', err);
  }
}

function changeMerchant() {
  const select = document.getElementById('merchant-selector');
  currentMerchantId = select.value;
  joinMerchantSocket(currentMerchantId);

  const m = allMerchants.find(x => x.id === currentMerchantId);
  if (m) {
    document.getElementById('merchant-category').textContent = `${m.category} • ${m.address}`;
    updateStoreStatusUI(m.is_open);
  }

  loadMerchantOrders();
  loadCatalog();
}

function updateStoreStatusUI(isOpen) {
  const btn = document.getElementById('store-status-btn');
  if (isOpen) {
    btn.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
    btn.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span><span>TIENDA ABIERTA</span>`;
  } else {
    btn.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all bg-rose-500/10 text-rose-400 border border-rose-500/30';
    btn.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-rose-400"></span><span>TIENDA CERRADA</span>`;
  }
}

async function toggleStoreStatus() {
  try {
    const res = await fetch(`/api/merchants/${currentMerchantId}/toggle-open`, { method: 'PATCH' });
    const data = await res.json();
    if (res.ok) {
      updateStoreStatusUI(data.is_open);
      const m = allMerchants.find(x => x.id === currentMerchantId);
      if (m) m.is_open = data.is_open;
    }
  } catch (e) {
    console.error(e);
  }
}

function formatCOP(num) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(num || 0);
}

async function loadMerchantOrders() {
  try {
    const res = await fetch(`/api/orders?merchant_id=${currentMerchantId}`);
    const data = await res.json();
    currentOrders = data.orders;
    renderKanban();
  } catch (err) {
    console.error('Error loading orders:', err);
  }
}

function renderKanban() {
  const colNew = document.getElementById('col-new');
  const colPrep = document.getElementById('col-prep');
  const colReady = document.getElementById('col-ready');
  const colDone = document.getElementById('col-done');

  const newOrders = currentOrders.filter(o => o.status === 'created');
  const prepOrders = currentOrders.filter(o => o.status === 'confirmed' || o.status === 'preparing');
  const readyOrders = currentOrders.filter(o => o.status === 'ready_for_pickup' || o.status === 'driver_assigned');
  const doneOrders = currentOrders.filter(o => o.status === 'on_the_way' || o.status === 'delivered');

  document.getElementById('count-col-new').textContent = newOrders.length;
  document.getElementById('count-col-prep').textContent = prepOrders.length;
  document.getElementById('count-col-ready').textContent = readyOrders.length;
  document.getElementById('count-col-done').textContent = doneOrders.length;

  document.getElementById('metric-prep').textContent = prepOrders.length;
  document.getElementById('metric-ready').textContent = readyOrders.length;

  const totalSales = currentOrders.filter(o => o.status !== 'cancelled').reduce((acc, o) => acc + o.subtotal, 0);
  document.getElementById('metric-sales').textContent = formatCOP(totalSales);

  colNew.innerHTML = newOrders.map(renderOrderCard).join('') || `<div class="text-xs text-slate-500 text-center py-8">Sin pedidos nuevos</div>`;
  colPrep.innerHTML = prepOrders.map(renderOrderCard).join('') || `<div class="text-xs text-slate-500 text-center py-8">Cocina libre</div>`;
  colReady.innerHTML = readyOrders.map(renderOrderCard).join('') || `<div class="text-xs text-slate-500 text-center py-8">Sin pedidos esperando</div>`;
  colDone.innerHTML = doneOrders.map(renderOrderCard).join('') || `<div class="text-xs text-slate-500 text-center py-8">Sin historial reciente</div>`;
}

function getElapsedMinutes(createdAt) {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  return Math.max(1, Math.floor(diffMs / 60000));
}

function printKitchenTicket(orderId) {
  const o = currentOrders.find(x => x.id === orderId);
  if (!o) return;
  alert(`🖨️ [COMANDA IMPRESA - LUPIN EXPRESS]\n\nORDEN: ${o.order_number}\nCLIENTE: ${o.client_name}\nHORA: ${new Date(o.created_at).toLocaleTimeString()}\n\nPLATOS:\n${o.items.map(i => `- ${i.quantity}x ${i.product_name}`).join('\n')}\n\nREF: ${o.delivery_reference || 'Sin notas'}`);
}

function renderOrderCard(o) {
  const itemsHtml = o.items.map(i => `
    <li class="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 text-xs">
      <span class="text-slate-800 dark:text-slate-200"><strong class="text-orange-600 font-bold">${i.quantity}x</strong> ${i.product_name}</span>
      <span class="text-slate-500 dark:text-slate-400 font-medium">${formatCOP(i.total_price)}</span>
    </li>
  `).join('');

  let actionButtons = '';
  const elapsed = getElapsedMinutes(o.created_at);

  let urgencyClass = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
  if (elapsed >= 25) {
    urgencyClass = 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800 animate-pulse font-black';
  } else if (elapsed >= 15) {
    urgencyClass = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 font-bold';
  }

  if (o.status === 'created') {
    actionButtons = `
      <div class="flex gap-2">
        <button onclick="updateOrderStatus('${o.id}', 'preparing')" class="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer">
          <i class="fa-solid fa-check"></i> Aceptar en Cocina
        </button>
        <button onclick="printKitchenTicket('${o.id}')" class="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer" title="Imprimir Comanda">
          <i class="fa-solid fa-print"></i>
        </button>
      </div>
    `;
  } else if (o.status === 'confirmed' || o.status === 'preparing') {
    actionButtons = `
      <div class="flex gap-2">
        <button onclick="updateOrderStatus('${o.id}', 'ready_for_pickup')" class="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer">
          <i class="fa-solid fa-bell"></i> ¡Plato Listo! Llamar Domicilio
        </button>
        <button onclick="printKitchenTicket('${o.id}')" class="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer" title="Imprimir Comanda">
          <i class="fa-solid fa-print"></i>
        </button>
      </div>
    `;
  } else if (o.status === 'ready_for_pickup' || o.status === 'driver_assigned') {
    actionButtons = `
      <div class="text-[11px] text-center p-2 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 font-bold">
        <i class="fa-solid fa-motorcycle animate-pulse"></i> ${o.driver_name ? `Repartidor: ${o.driver_name}` : 'Buscando repartidor cercano...'}
      </div>
    `;
  } else {
    actionButtons = `
      <div class="text-[11px] text-center p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold">
        ${o.status === 'on_the_way' ? '🛵 En camino al cliente' : '✅ Entregado exitosamente'}
      </div>
    `;
  }

  return `
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
      <div class="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
        <div>
          <span class="font-black text-sm text-slate-900 dark:text-white">${o.order_number}</span>
          <span class="block text-[10px] text-slate-400">Hace ${elapsed} min • ${new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <span class="text-xs font-black text-emerald-600 dark:text-emerald-400">${formatCOP(o.subtotal)}</span>
      </div>

      <div class="text-xs space-y-1">
        <p class="text-slate-800 dark:text-slate-200 font-bold flex items-center gap-1.5">
          <i class="fa-solid fa-user text-slate-400"></i> ${o.client_name}
        </p>
        <p class="text-slate-500 dark:text-slate-400 text-[11px] truncate">
          <i class="fa-solid fa-location-dot text-orange-600"></i> ${o.delivery_address}
        </p>
        <ul class="space-y-0.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2.5 border border-slate-200 dark:border-slate-700/60">
          ${itemsHtml}
        </ul>
      </div>

      ${o.delivery_reference ? `
        <div class="text-[11px] bg-orange-500/10 text-orange-700 dark:text-orange-300 p-2 rounded-xl border border-orange-500/20">
          <strong>Ref:</strong> ${o.delivery_reference}
        </div>
      ` : ''}

      <div class="pt-1">
        ${actionButtons}
      </div>
    </div>
  `;
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      loadMerchantOrders();
    }
  } catch (err) {
    console.error('Error updating order status:', err);
  }
}

let loadedProducts = [];

async function loadCatalog() {
  try {
    const res = await fetch(`/api/merchants/${currentMerchantId}`);
    const data = await res.json();
    loadedProducts = data.products || [];
    const grid = document.getElementById('catalog-grid');

    if (loadedProducts.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-500">
          <i class="fa-solid fa-box-open text-4xl mb-3 text-slate-600"></i>
          <p class="font-bold">No tienes productos en tu catálogo aún.</p>
          <button onclick="openCreateProductModal()" class="mt-3 px-4 py-2 bg-orange-600 text-white text-xs font-black rounded-xl">
            ＋ Crear Primer Producto
          </button>
        </div>
      `;
      return;
    }

    grid.innerHTML = loadedProducts.map(p => `
      <div class="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between group hover:border-orange-500/50 transition-all">
        <div class="relative h-44 overflow-hidden bg-slate-900">
          <img src="${p.image_url || 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600'}" alt="${p.name}" class="w-full h-full object-cover">
          <div class="absolute top-3 right-3 flex gap-2">
            <span class="px-3 py-1 rounded-full text-xs font-black shadow-md ${p.is_available ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}">
              ${p.is_available ? '🟢 Disponible' : '🔴 Agotado / Pausado'}
            </span>
          </div>
        </div>
        <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
          <div>
            <h3 class="font-black text-white text-base">${p.name}</h3>
            <p class="text-xs text-slate-400 mt-1 line-clamp-2">${p.description || 'Sin descripción adicional.'}</p>
          </div>
          <div class="flex items-center justify-between pt-3 border-t border-slate-700/80">
            <span class="text-base font-black text-orange-400">${formatCOP(p.price)}</span>
            <div class="flex items-center gap-1.5">
              <button onclick="toggleProductAvailability('${p.id}')" title="Pausar o reactivar en el menú de clientes" class="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-xs font-bold rounded-lg text-slate-200 transition-colors cursor-pointer">
                ${p.is_available ? 'Pausar' : 'Activar'}
              </button>
              <button onclick="openCreateProductModal('${p.id}')" title="Editar producto" class="w-8 h-8 bg-slate-700 hover:bg-orange-600 text-xs font-bold rounded-lg text-slate-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button onclick="deleteProductItem('${p.id}')" title="Eliminar producto" class="w-8 h-8 bg-rose-500/20 hover:bg-rose-600 text-xs font-bold rounded-lg text-rose-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading catalog:', err);
  }
}

async function toggleProductAvailability(productId) {
  try {
    await fetch(`/api/products/${productId}/toggle`, { method: 'PATCH' });
    loadCatalog();
  } catch (err) {
    console.error(err);
  }
}

function openCreateProductModal(productId = null) {
  const modal = document.getElementById('modal-create-product');
  const title = document.getElementById('modal-product-title');
  const form = document.getElementById('form-create-product');
  form.reset();

  if (productId) {
    const prod = loadedProducts.find(p => p.id === productId);
    if (prod) {
      title.textContent = 'Editar Producto / Plato';
      document.getElementById('prod-id').value = prod.id;
      document.getElementById('prod-name').value = prod.name;
      document.getElementById('prod-price').value = prod.price;
      document.getElementById('prod-desc').value = prod.description || '';
      document.getElementById('prod-img').value = prod.image_url || '';
    }
  } else {
    title.textContent = 'Nuevo Producto / Plato';
    document.getElementById('prod-id').value = '';
    setPresetProductImage();
  }

  modal.classList.remove('hidden');
}

function closeCreateProductModal() {
  document.getElementById('modal-create-product').classList.add('hidden');
}

function setPresetProductImage() {
  const presets = [
    'https://images.unsplash.com/photo-1544025162-d76694265947?w=600', // Carne Asada
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600', // Burger
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600', // Parrilla
    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600', // Pizza
    'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600', // Farmacia
    'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?w=600'  // Ferretería
  ];
  const randomPreset = presets[Math.floor(Math.random() * presets.length)];
  document.getElementById('prod-img').value = randomPreset;
}

async function saveProductForm(e) {
  e.preventDefault();
  const id = document.getElementById('prod-id').value;
  const name = document.getElementById('prod-name').value.trim();
  const price = parseInt(document.getElementById('prod-price').value, 10);
  const description = document.getElementById('prod-desc').value.trim();
  const image_url = document.getElementById('prod-img').value.trim();

  try {
    if (id) {
      // Actualizar producto existente
      await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price, description, image_url })
      });
    } else {
      // Crear nuevo producto
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: currentMerchantId,
          name,
          price,
          description,
          image_url,
          options: []
        })
      });
    }

    closeCreateProductModal();
    loadCatalog();
    alert('✅ Producto guardado y sincronizado con éxito en tu menú de Yopal.');
  } catch (err) {
    console.error('Error guardando producto:', err);
    alert('❌ Error al guardar producto.');
  }
}

async function deleteProductItem(productId) {
  if (!confirm('¿Estás seguro de eliminar este producto del menú?')) return;
  try {
    await fetch(`/api/products/${productId}`, { method: 'DELETE' });
    loadCatalog();
  } catch (err) {
    console.error(err);
  }
}

function switchTab(tab) {
  const btnKanban = document.getElementById('tab-btn-kanban');
  const btnCatalog = document.getElementById('tab-btn-catalog');
  const btnWallet = document.getElementById('tab-btn-wallet');
  const btnReputation = document.getElementById('tab-btn-reputation');

  const tabKanban = document.getElementById('tab-kanban');
  const tabCatalog = document.getElementById('tab-catalog');
  const tabWallet = document.getElementById('tab-wallet');
  const tabReputation = document.getElementById('tab-reputation');

  [tabKanban, tabCatalog, tabWallet, tabReputation].forEach(el => el && el.classList.add('hidden'));
  [btnKanban, btnCatalog, btnWallet, btnReputation].forEach(b => b && (b.className = 'py-3 border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-2 cursor-pointer whitespace-nowrap'));

  if (tab === 'kanban') {
    tabKanban.classList.remove('hidden');
    btnKanban.className = 'py-3 border-b-2 border-emerald-500 text-emerald-400 flex items-center gap-2 cursor-pointer whitespace-nowrap font-bold';
    loadMerchantOrders();
  } else if (tab === 'catalog') {
    tabCatalog.classList.remove('hidden');
    btnCatalog.className = 'py-3 border-b-2 border-emerald-500 text-emerald-400 flex items-center gap-2 cursor-pointer whitespace-nowrap font-bold';
    loadCatalog();
  } else if (tab === 'wallet') {
    if (tabWallet) tabWallet.classList.remove('hidden');
    if (btnWallet) btnWallet.className = 'py-3 border-b-2 border-emerald-500 text-emerald-400 flex items-center gap-2 cursor-pointer whitespace-nowrap font-bold';
    loadMerchantWallet();
  } else if (tab === 'reputation') {
    tabReputation.classList.remove('hidden');
    btnReputation.className = 'py-3 border-b-2 border-amber-500 text-amber-400 flex items-center gap-2 cursor-pointer whitespace-nowrap font-bold';
    loadMerchantReputation();
  }
}

function loadMerchantWallet() {
  const validOrders = currentOrders.filter(o => o.status === 'delivered' || o.status === 'on_the_way' || o.status === 'ready_for_pickup');
  const gross = validOrders.reduce((acc, o) => acc + (o.subtotal || 0), 0);
  const fee = Math.round(gross * 0.12);
  const net = gross - fee;

  const elGross = document.getElementById('mch-gross-sales');
  const elFee = document.getElementById('mch-platform-fee');
  const elNet = document.getElementById('mch-net-payout');
  const inputAmount = document.getElementById('mch-payout-amount');

  if (elGross) elGross.textContent = formatCOP(gross);
  if (elFee) elFee.textContent = formatCOP(fee);
  if (elNet) elNet.textContent = formatCOP(net);
  if (inputAmount && net > 0) inputAmount.value = net;
}

function requestMerchantPayout() {
  const account = document.getElementById('mch-payout-account').value.trim();
  const amount = parseInt(document.getElementById('mch-payout-amount').value) || 0;

  if (!account) {
    alert('Por favor ingresa tu número de cuenta o Nequi de destino');
    return;
  }
  if (amount <= 0) {
    alert('No hay saldo suficiente para liquidar en este momento');
    return;
  }

  alert(`¡Solicitud de liquidación por ${formatCOP(amount)} enviada exitosamente a ${account}! La transferencia llegará en menos de 15 minutos vía Bre-B / Nequi.`);
}

function printKitchenReceipt(orderId) {
  const o = currentOrders.find(x => x.id === orderId);
  if (!o) return;

  const printWindow = window.open('', '_blank', 'width=380,height=600');
  printWindow.document.write(`
    <html>
      <head>
        <title>Comanda #${o.order_number}</title>
        <style>
          body { font-family: 'Courier New', monospace; width: 280px; padding: 10px; margin: 0 auto; color: #000; font-size: 12px; }
          h2 { text-align: center; margin: 0 0 4px; font-size: 16px; }
          p { margin: 2px 0; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .item { display: flex; justify-content: space-between; margin: 4px 0; }
          .total { font-weight: bold; font-size: 14px; display: flex; justify-content: space-between; }
          .notes { font-style: italic; background: #eee; padding: 4px; margin: 4px 0; font-size: 11px; }
        </style>
      </head>
      <body>
        <h2>${o.merchant_name || 'LUPIN EXPRESS'}</h2>
        <p style="text-align:center;">Yopal, Casanare • Comanda Cocina</p>
        <div class="divider"></div>
        <p><b>Pedido:</b> #${o.order_number}</p>
        <p><b>Fecha:</b> ${new Date(o.created_at).toLocaleTimeString('es-CO')}</p>
        <p><b>Cliente:</b> ${o.client_name} (${o.client_phone})</p>
        <p><b>Entrega:</b> ${o.delivery_address}</p>
        <div class="divider"></div>
        <h3>PRODUCTOS:</h3>
        ${(o.items || []).map(i => `
          <div class="item">
            <span><b>${i.quantity}x</b> ${i.name || i.product_name}</span>
            <span>${formatCOP((i.price || i.unit_price) * i.quantity)}</span>
          </div>
          ${i.specialNotes ? `<div class="notes">Nota: ${i.specialNotes}</div>` : ''}
        `).join('')}
        <div class="divider"></div>
        <div class="total">
          <span>SUBTOTAL:</span>
          <span>${formatCOP(o.subtotal)}</span>
        </div>
        <p><b>Pago:</b> ${o.payment_method.toUpperCase()} ${o.payment_method === 'cash' ? `(Cambio p/ $${o.cash_amount_to_pay_with?.toLocaleString('es-CO')})` : ''}</p>
        <div class="divider"></div>
        <p style="text-align:center; font-weight:bold;">PIN OTP DE ENTREGA: ${o.delivery_otp || '****'}</p>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); }, 250);
}

async function loadMerchantReputation() {
  try {
    const res = await fetch(`/api/reviews/merchant/${currentMerchantId}`);
    const data = await res.json();

    const kpiBox = document.getElementById('merchant-rep-kpi');
    const container = document.getElementById('merchant-reviews-container');

    if (kpiBox) {
      kpiBox.innerHTML = `
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <span class="text-xs text-slate-500 dark:text-slate-400 font-bold block">Puntaje Bayesiano</span>
          <p class="text-3xl font-black text-amber-500 mt-1">${data.bayesian_score || 5.0} ★</p>
          <span class="text-[10px] text-slate-400">Ponderado con confianza estadística</span>
        </div>
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <span class="text-xs text-slate-500 dark:text-slate-400 font-bold block">Promedio Aritmético</span>
          <p class="text-3xl font-black text-slate-900 dark:text-white mt-1">${data.arithmetic_average || 5.0}</p>
          <span class="text-[10px] text-slate-400">Total: ${data.total_reviews} opiniones</span>
        </div>
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <span class="text-xs text-slate-500 dark:text-slate-400 font-bold block">Tasa de Respuesta</span>
          <p class="text-3xl font-black text-emerald-500 mt-1">100%</p>
          <span class="text-[10px] text-emerald-600 font-bold">Comercio Activo y Comprometido</span>
        </div>
      `;
    }

    if (container) {
      if (data.reviews.length === 0) {
        container.innerHTML = `<div class="text-center py-12 text-slate-400 italic">No hay críticas recibidas aún.</div>`;
        return;
      }

      container.innerHTML = data.reviews.map(r => `
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-900 dark:text-white text-sm">${r.user_name}</span>
              ${r.is_verified_purchase ? `
                <span class="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 text-[10px] font-black border border-emerald-200 dark:border-emerald-800">
                  <i class="fa-solid fa-circle-check"></i> Compra Verificada
                </span>
              ` : ''}
            </div>
            <span class="text-amber-400 font-black text-sm">${r.rating} ★</span>
          </div>

          <div class="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
            ${r.positive_aspects ? `<p><strong class="text-emerald-600">Lo Positivo:</strong> ${r.positive_aspects}</p>` : ''}
            ${r.improvement_aspects ? `<p><strong class="text-amber-600">A Mejorar:</strong> ${r.improvement_aspects}</p>` : ''}
            ${r.recommendation ? `<p><strong class="text-orange-600">Recomendación:</strong> ${r.recommendation}</p>` : ''}
          </div>

          <!-- Official Reply Area -->
          <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
            ${r.official_reply ? `
              <div class="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border-l-4 border-emerald-500 text-xs space-y-1">
                <span class="text-[10px] text-emerald-600 font-bold uppercase block">Tu Respuesta Oficial (${r.responder_name}):</span>
                <p class="text-slate-700 dark:text-slate-300 italic">${r.official_reply}</p>
              </div>
            ` : `
              <div class="flex gap-2">
                <input type="text" id="reply-input-${r.id}" placeholder="Escribe una respuesta oficial respetuosa y constructiva..." class="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <button onclick="submitOfficialReply('${r.id}')" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all">
                  Responder
                </button>
              </div>
            `}
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error cargando reputación del comercio:', err);
  }
}

async function submitOfficialReply(reviewId) {
  const input = document.getElementById(`reply-input-${reviewId}`);
  const replyText = input ? input.value.trim() : '';
  if (!replyText) {
    alert('Por favor escribe tu respuesta antes de enviar');
    return;
  }

  try {
    const res = await fetch(`/api/reviews/${reviewId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        official_reply: replyText,
        responder_name: 'Gerencia y Atención al Cliente',
        merchant_id: currentMerchantId
      })
    });

    if (res.ok) {
      alert('Respuesta oficial publicada exitosamente');
      loadMerchantReputation();
    } else {
      const err = await res.json();
      alert(err.error || 'Error al enviar respuesta');
    }
  } catch (err) {
    alert('Error al conectar con el servidor');
  }
}

function playOrderBell() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Triple kitchen bell chime [G5 -> B5 -> E6]
    const notes = [783.99, 987.77, 1318.51];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      }, idx * 180);
    });
  } catch(e) {}
}
