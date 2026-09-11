// ==============================================================================
// LUPIN EXPRESS - APP CLIENTE JS (UI/UX PRO MAX EDITION)
// Experiencia fluida de delivery con personalizador de platos y rastreo GPS
// ==============================================================================

// Estado del cliente en Yopal (Ubicación por defecto: Barrio La Campiña)
let userLocation = {
  lat: 5.3480,
  lng: -72.4010,
  address: 'Calle 24 # 25-18, Barrio La Campiña'
};

let currentCategory = 'Todos';
let searchQuery = '';
let allMerchants = [];
let currentMerchant = null;
let currentProducts = [];
let cart = []; // { product_id, name, price, quantity, options, notes }
let activeOrderId = null;
let socket;
let trackingMap;
let trackingDriverMarker;
let pickerMap;
let pickerMarker;

// Personalizador de Platos Activo
let customizerItem = null;
let customizerQty = 1;

// Neuromarketing & Loyalty State
let selectedTipAmount = 2000;
let appliedCoupon = null;

document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  loadMerchants();
  checkActiveOrder();
  startSocialProofTicker();
});

function initSocket() {
  socket = io();

  socket.on('connect', () => {
    if (activeOrderId) socket.emit('join:order', activeOrderId);
  });

  socket.on('reconnect', () => {
    if (activeOrderId) {
      socket.emit('join:order', activeOrderId);
      loadOrderTrackingData();
    }
  });

  socket.on('order:status_update', (data) => {
    if (activeOrderId && data.orderId === activeOrderId) {
      updateTrackingUI(data.status, data.driver);
    }
  });

  socket.on('driver:location_changed', (data) => {
    if (trackingDriverMarker && data.lat && data.lng) {
      trackingDriverMarker.setLatLng([data.lat, data.lng]);
      if (trackingMap) {
        trackingMap.panTo([data.lat, data.lng]);
      }
    }
  });

  socket.on('chat:new_message', (data) => {
    if (activeOrderId && data.orderId === activeOrderId) {
      appendChatMessage(data);
    }
  });
}

function formatCOP(num) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(num || 0);
}

// --------------------------------------------------------------------------
// SONIDOS SINTETIZADOS WEB AUDIO (MICRO-INTERACCIONES)
// --------------------------------------------------------------------------
function playPopSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch(e) {}
}

function playSuccessChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) {}
}

// --------------------------------------------------------------------------
// CARGA Y FILTRADO DE RESTAURANTES Y COMERCIOS
// --------------------------------------------------------------------------
async function loadMerchants() {
  try {
    const url = `/api/merchants?lat=${userLocation.lat}&lng=${userLocation.lng}${currentCategory !== 'Todos' ? `&category=${encodeURIComponent(currentCategory)}` : ''}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    allMerchants = data.merchants;
    renderMerchants();
  } catch (err) {
    console.error('Error cargando comercios:', err);
  }
}

function renderMerchants() {
  const grid = document.getElementById('merchants-grid');
  const countSpan = document.getElementById('merchants-count');
  countSpan.textContent = `${allMerchants.length} disponibles`;

  if (allMerchants.length === 0) {
    grid.innerHTML = `<div class="col-span-2 text-center py-12 text-slate-400 text-sm">No se encontraron comercios en esta categoría en Yopal.</div>`;
    return;
  }

  grid.innerHTML = allMerchants.map(m => `
    <div onclick="openMerchantDetail('${m.id}')" class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md hover:border-orange-600 dark:hover:border-orange-600 transition-all cursor-pointer group flex flex-col justify-between">
      <div>
        <div class="h-40 relative overflow-hidden bg-slate-100 dark:bg-slate-800">
          <img src="${m.banner_url || m.logo_url}" alt="${m.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
          
          <!-- Top Left: Rating Bayesiano & Destacado -->
          <div class="absolute top-3 left-3 flex items-center gap-1.5">
            <div class="bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-2.5 py-1 rounded-full text-[11px] font-black text-slate-800 dark:text-white flex items-center gap-1 shadow">
              <i class="fa-solid fa-star text-amber-500"></i> ${m.rating} <span class="text-[9px] text-slate-400 font-bold">Bayesiano</span>
            </div>
            ${m.is_featured ? `
              <span class="bg-orange-600 text-white px-2 py-1 rounded-full text-[9px] font-black uppercase shadow">
                ⭐ DESTACADO
              </span>
            ` : ''}
          </div>

          <!-- Top Right: Tiempo Estimado -->
          <div class="absolute top-3 right-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-2.5 py-1 rounded-full text-[11px] font-bold text-slate-800 dark:text-white shadow">
            ${m.estimatedTime} min
          </div>
        </div>

        <div class="p-4 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-black uppercase tracking-wider text-orange-600">${m.category}</span>
            <span class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              ⚡ Gratis con VIP
            </span>
          </div>
          <h3 class="font-bold text-slate-900 dark:text-white text-base group-hover:text-orange-600 transition-colors">${m.name}</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">${m.description}</p>
        </div>
      </div>

      <div class="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold">
        <span class="flex items-center gap-1 text-slate-600 dark:text-slate-300">
          <i class="fa-solid fa-motorcycle text-orange-600"></i> Envío: <strong class="text-slate-900 dark:text-white">${formatCOP(m.deliveryFee)}</strong>
        </span>
        <span class="text-slate-400">${m.distanceKm} km</span>
      </div>
    </div>
  `).join('');
}

function filterCategory(cat) {
  currentCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(btn => {
    if (btn.textContent.includes(cat) || (cat === 'Todos' && btn.textContent.trim() === 'Todos')) {
      btn.className = 'cat-pill active px-4 py-2 rounded-full bg-orange-600 text-white shadow-md shadow-orange-600/20 whitespace-nowrap transition-all cursor-pointer';
    } else {
      btn.className = 'cat-pill px-4 py-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-orange-600 whitespace-nowrap transition-all cursor-pointer';
    }
  });
  loadMerchants();
}

let searchDebounceTimeout = null;

function handleSearch() {
  clearTimeout(searchDebounceTimeout);
  searchDebounceTimeout = setTimeout(() => {
    const input = document.getElementById('search-input');
    searchQuery = input ? input.value.trim() : '';
    loadMerchants();
  }, 200);
}

// --------------------------------------------------------------------------
// DETALLE DEL COMERCIO Y MENÚ
// --------------------------------------------------------------------------
async function openMerchantDetail(merchantId) {
  try {
    const res = await fetch(`/api/merchants/${merchantId}?lat=${userLocation.lat}&lng=${userLocation.lng}`);
    const data = await res.json();
    currentMerchant = data.merchant;
    currentProducts = data.products;

    document.getElementById('m-detail-banner').src = currentMerchant.banner_url || currentMerchant.logo_url;
    document.getElementById('m-detail-name').textContent = currentMerchant.name;
    document.getElementById('m-detail-category').textContent = currentMerchant.category;
    document.getElementById('m-detail-address').querySelector('span').textContent = currentMerchant.address;
    document.getElementById('m-detail-time').textContent = `${currentMerchant.estimatedTime} min`;
    document.getElementById('m-detail-fare').textContent = formatCOP(currentMerchant.deliveryFee);
    document.getElementById('m-detail-desc').textContent = currentMerchant.description;

    const productsGrid = document.getElementById('m-products-grid');
    productsGrid.innerHTML = data.products.map(p => `
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex justify-between gap-3 card-hover-lift">
        <div class="flex-1 flex flex-col justify-between">
          <div>
            <h4 class="font-bold text-slate-900 dark:text-white text-sm">${p.name}</h4>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">${p.description}</p>
          </div>
          <div class="mt-3 flex items-center justify-between">
            <span class="font-black text-slate-900 dark:text-white text-sm">${formatCOP(p.price)}</span>
            <button onclick="openCustomizer('${p.id}')" class="btn-spring px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-md shadow-orange-600/20 flex items-center gap-1 cursor-pointer">
              <i class="fa-solid fa-plus"></i> Personalizar
            </button>
          </div>
        </div>
        <div class="w-24 h-24 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0">
          <img src="${p.image_url}" alt="${p.name}" class="w-full h-full object-cover">
        </div>
      </div>
    `).join('');

    loadMerchantReviews(merchantId);

    const vMerchant = document.getElementById('view-merchant');
    document.getElementById('view-home').classList.add('hidden');
    document.getElementById('view-tracking').classList.add('hidden');
    vMerchant.classList.remove('hidden');
    vMerchant.classList.remove('view-transition-enter');
    void vMerchant.offsetWidth; // trigger reflow
    vMerchant.classList.add('view-transition-enter');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    console.error('Error cargando detalle de comercio:', err);
  }
}

// --------------------------------------------------------------------------
// MÓDULO DE REPUTACIÓN BAYESIANA Y CRÍTICAS CONSTRUCTIVAS
// --------------------------------------------------------------------------
let selectedReviewRating = 5;

async function loadMerchantReviews(merchantId) {
  try {
    const res = await fetch(`/api/reviews/merchant/${merchantId}`);
    const data = await res.json();

    const summaryBox = document.getElementById('m-reviews-summary');
    const listContainer = document.getElementById('m-reviews-list');

    if (!summaryBox || !listContainer) return;

    const total = data.total_reviews || 0;
    const dist = data.distribution || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    summaryBox.innerHTML = `
      <div class="text-center sm:border-r sm:border-slate-200 sm:dark:border-slate-700/60 pr-4">
        <span class="text-4xl font-black text-slate-900 dark:text-white tracking-tight">${data.bayesian_score || 5.0}</span>
        <div class="flex items-center justify-center gap-1 text-amber-400 text-sm mt-1">
          <i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i>
        </div>
        <span class="text-[11px] text-slate-500 dark:text-slate-400 font-bold block mt-1">${total} críticas verificadas</span>
      </div>

      <div class="col-span-2 space-y-1.5 text-xs">
        ${[5, 4, 3, 2, 1].map(stars => {
          const count = dist[stars] || 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return `
            <div class="flex items-center gap-2">
              <span class="w-7 font-bold text-slate-700 dark:text-slate-300 text-[11px]">${stars} ★</span>
              <div class="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div class="h-full bg-amber-400 rounded-full" style="width: ${pct}%"></div>
              </div>
              <span class="w-8 text-right font-medium text-slate-400 text-[10px]">${count}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    if (data.reviews.length === 0) {
      listContainer.innerHTML = `<p class="text-center py-6 text-slate-400 italic text-xs">Sé el primero en aportar una crítica constructiva para este comercio.</p>`;
      return;
    }

    listContainer.innerHTML = data.reviews.map(r => `
      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 shadow-sm">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="font-extrabold text-slate-900 dark:text-white text-xs">${r.user_name}</span>
            ${r.is_verified_purchase ? `
              <span class="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 text-[9px] font-black border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                <i class="fa-solid fa-circle-check"></i> Compra Verificada
              </span>
            ` : ''}
          </div>
          <div class="flex items-center gap-1 text-amber-400 text-xs">
            ${Array(r.rating).fill('<i class="fa-solid fa-star"></i>').join('')}
          </div>
        </div>

        <div class="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          ${r.positive_aspects ? `
            <div class="flex items-start gap-1.5 text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 p-2 rounded-xl">
              <i class="fa-solid fa-thumbs-up mt-0.5 text-emerald-600"></i>
              <span><strong>Lo positivo:</strong> ${r.positive_aspects}</span>
            </div>
          ` : ''}
          ${r.improvement_aspects ? `
            <div class="flex items-start gap-1.5 text-amber-800 dark:text-amber-300 bg-amber-500/10 p-2 rounded-xl">
              <i class="fa-solid fa-wrench mt-0.5 text-amber-600"></i>
              <span><strong>A mejorar:</strong> ${r.improvement_aspects}</span>
            </div>
          ` : ''}
          ${r.recommendation ? `
            <div class="flex items-start gap-1.5 text-orange-800 dark:text-orange-300 bg-orange-500/10 p-2 rounded-xl">
              <i class="fa-solid fa-lightbulb mt-0.5 text-orange-600"></i>
              <span><strong>Recomendación:</strong> ${r.recommendation}</span>
            </div>
          ` : ''}
        </div>

        ${r.official_reply ? `
          <div class="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border-l-4 border-orange-600 text-xs space-y-1 mt-2">
            <div class="flex items-center justify-between text-[10px] text-orange-600 font-black uppercase">
              <span><i class="fa-solid fa-reply"></i> Respuesta Oficial del Comercio</span>
              <span>${r.responder_name}</span>
            </div>
            <p class="text-slate-700 dark:text-slate-300 italic">${r.official_reply}</p>
          </div>
        ` : ''}

        <div class="flex items-center justify-between pt-1 text-[11px] text-slate-400">
          <span>${new Date(r.created_at).toLocaleDateString('es-CO')}</span>
          <button onclick="voteReviewHelpful('${r.id}')" class="flex items-center gap-1 hover:text-orange-600 cursor-pointer">
            <i class="fa-regular fa-thumbs-up"></i> Útil (${r.helpful_votes || 0})
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error cargando reseñas del comercio:', err);
  }
}

function openReviewModal() {
  if (!currentMerchant) return;
  selectReviewStars(5);
  document.getElementById('rev-positive').value = '';
  document.getElementById('rev-improve').value = '';
  document.getElementById('rev-recommendation').value = '';

  const modal = document.getElementById('review-modal');
  modal.classList.remove('hidden');
  modal.classList.add('modal-anim-backdrop');
  const card = modal.querySelector('> div');
  if (card) {
    card.classList.remove('modal-anim-content');
    void card.offsetWidth;
    card.classList.add('modal-anim-content');
  }
}

function closeReviewModal() {
  document.getElementById('review-modal').classList.add('hidden');
}

function selectReviewStars(num) {
  selectedReviewRating = num;
  const stars = document.querySelectorAll('#review-star-picker .star-pick');
  stars.forEach((s, idx) => {
    if (idx < num) {
      s.className = 'fa-solid fa-star cursor-pointer star-pick text-amber-400 hover:scale-125 transition-transform';
    } else {
      s.className = 'fa-regular fa-star cursor-pointer star-pick text-slate-400 hover:scale-125 transition-transform';
    }
  });

  const labels = {
    1: '1 Estrella (Muy Deficiente)',
    2: '2 Estrellas (Deficiente)',
    3: '3 Estrellas (Aceptable)',
    4: '4 Estrellas (Bueno)',
    5: '5 Estrellas (Excelente)'
  };
  document.getElementById('review-stars-label').textContent = labels[num] || `${num} Estrellas`;
}

async function submitReview() {
  if (!currentMerchant) return;

  const positive = document.getElementById('rev-positive').value.trim();
  const improve = document.getElementById('rev-improve').value.trim();
  const rec = document.getElementById('rev-recommendation').value.trim();

  if (!positive && !improve && !rec) {
    alert('Por favor escribe al menos un comentario en tu crítica constructiva');
    return;
  }

  const user = JSON.parse(localStorage.getItem('lupin_user') || '{}');
  const userId = user.id || 'usr-client-01';
  const userName = user.name || 'Cliente de Yopal';

  try {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: currentMerchant.id,
        user_id: userId,
        user_name: userName,
        rating: selectedReviewRating,
        positive_aspects: positive,
        improvement_aspects: improve,
        recommendation: rec
      })
    });

    const data = await res.json();
    if (res.ok) {
      playSuccessChime();
      alert('¡Gracias! Tu crítica constructiva fue publicada y ganaste +50 Puntos de Fidelización.');
      closeReviewModal();
      loadMerchantReviews(currentMerchant.id);
    } else {
      alert(data.error || 'Error al enviar reseña');
    }
  } catch (err) {
    alert('Error al conectar con el servidor');
  }
}

async function voteReviewHelpful(reviewId) {
  try {
    const res = await fetch(`/api/reviews/${reviewId}/vote`, { method: 'POST' });
    if (res.ok && currentMerchant) {
      loadMerchantReviews(currentMerchant.id);
    }
  } catch(e) {}
}

function showHomeView() {
  const vHome = document.getElementById('view-home');
  document.getElementById('view-merchant').classList.add('hidden');
  document.getElementById('view-tracking').classList.add('hidden');
  vHome.classList.remove('hidden');
  vHome.classList.remove('view-transition-enter');
  void vHome.offsetWidth; // trigger reflow
  vHome.classList.add('view-transition-enter');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --------------------------------------------------------------------------
// MODAL BOTTOM-SHEET DE PERSONALIZACIÓN DE PLATOS (DOORDASH LEVEL)
// --------------------------------------------------------------------------
function openCustomizer(productId) {
  const prod = currentProducts.find(p => p.id === productId);
  if (!prod) return;

  customizerItem = prod;
  customizerQty = 1;

  document.getElementById('cust-img').src = prod.image_url;
  document.getElementById('cust-name').textContent = prod.name;
  document.getElementById('cust-desc').textContent = prod.description;
  document.getElementById('cust-price').textContent = formatCOP(prod.price);
  document.getElementById('cust-qty').textContent = customizerQty;
  document.getElementById('cust-notes').value = '';

  const container = document.getElementById('cust-options-container');
  const options = prod.options || [];

  if (options.length === 0) {
    container.innerHTML = `<p class="text-slate-400 italic">Este plato no requiere personalización adicional.</p>`;
  } else {
    container.innerHTML = options.map((opt, oIdx) => `
      <div class="space-y-1.5">
        <span class="font-bold text-slate-800 dark:text-slate-200 block">${opt.name}</span>
        <div class="space-y-1">
          ${opt.choices.map((choice, cIdx) => `
            <label class="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input type="radio" name="opt_group_${oIdx}" value="${choice}" ${cIdx === 0 ? 'checked' : ''} class="text-orange-600 focus:ring-orange-600">
              <span class="text-xs text-slate-700 dark:text-slate-300 font-medium">${choice}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  updateCustomizerTotal();
  const modal = document.getElementById('customizer-modal');
  modal.classList.remove('hidden');
  modal.classList.add('modal-anim-backdrop');
  const card = modal.querySelector('> div');
  if (card) {
    card.classList.remove('bottom-sheet-anim');
    void card.offsetWidth;
    card.classList.add('bottom-sheet-anim');
  }
}

function closeCustomizerModal() {
  document.getElementById('customizer-modal').classList.add('hidden');
}

function changeCustomizerQty(delta) {
  customizerQty = Math.max(1, customizerQty + delta);
  document.getElementById('cust-qty').textContent = customizerQty;
  updateCustomizerTotal();
}

function updateCustomizerTotal() {
  if (!customizerItem) return;
  const total = customizerItem.price * customizerQty;
  document.getElementById('cust-total-btn').textContent = formatCOP(total);
}

function confirmCustomizerAdd() {
  if (!customizerItem) return;

  const optionsSelected = [];
  const optGroups = (customizerItem.options || []);
  optGroups.forEach((opt, idx) => {
    const selected = document.querySelector(`input[name="opt_group_${idx}"]:checked`);
    if (selected) {
      optionsSelected.push({ name: opt.name, value: selected.value });
    }
  });

  const notes = document.getElementById('cust-notes').value.trim();

  // Agregar al carrito
  const existing = cart.find(i => i.product_id === customizerItem.id && JSON.stringify(i.selected_options) === JSON.stringify(optionsSelected));
  if (existing) {
    existing.quantity += customizerQty;
  } else {
    cart.push({
      product_id: customizerItem.id,
      name: customizerItem.name,
      price: customizerItem.price,
      quantity: customizerQty,
      selected_options: optionsSelected,
      notes: notes
    });
  }

  playPopSound();
  updateCartBadge();
  closeCustomizerModal();
  openCartDrawer();
}

// --------------------------------------------------------------------------
// CARRITO DE COMPRAS Y TOTALES EN COP
// --------------------------------------------------------------------------
function setQuickNeighborhood(address, lat, lng) {
  userLocation.lat = lat;
  userLocation.lng = lng;
  userLocation.address = address;

  const label = document.getElementById('current-address-label');
  if (label) label.textContent = address;

  // Actualizar estilo visual activo de chips
  const chips = document.querySelectorAll('#neighborhood-chips .neigh-btn');
  chips.forEach(btn => {
    if (btn.textContent.includes(address.split(',')[0]) || btn.textContent.includes(address.split('Barrio')[1] || '')) {
      btn.className = 'neigh-btn active px-3.5 py-1.5 rounded-full bg-orange-600 text-white font-bold whitespace-nowrap cursor-pointer shadow-sm transition-all';
    } else {
      btn.className = 'neigh-btn px-3.5 py-1.5 rounded-full bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-800 whitespace-nowrap cursor-pointer hover:border-orange-600 transition-all';
    }
  });

  playPopSound();
  loadMerchants();
}

function updateCartBadge() {
  const count = cart.reduce((acc, i) => acc + i.quantity, 0);
  const subtotal = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0);

  // Badge en el Header
  const badge = document.getElementById('cart-badge-count');
  if (badge) {
    badge.textContent = count;
    badge.classList.remove('badge-bounce-active');
    void badge.offsetWidth;
    badge.classList.add('badge-bounce-active');
  }

  // Barra Flotante Inferior Inteligente
  const floatBar = document.getElementById('floating-cart-bar');
  const floatCount = document.getElementById('floating-cart-count');
  const floatTotal = document.getElementById('floating-cart-total');

  if (floatBar && floatCount && floatTotal) {
    if (count > 0) {
      floatCount.textContent = count;
      floatTotal.textContent = formatCOP(subtotal);
      floatBar.classList.remove('hidden');
    } else {
      floatBar.classList.add('hidden');
    }
  }
}

function openCartDrawer() {
  renderCartItems();
  const drawer = document.getElementById('cart-drawer');
  drawer.classList.remove('hidden');
  drawer.classList.add('modal-anim-backdrop');
  const card = drawer.querySelector('> div');
  if (card) {
    card.classList.remove('drawer-right-anim');
    void card.offsetWidth;
    card.classList.add('drawer-right-anim');
  }
}

function closeCartDrawer() {
  document.getElementById('cart-drawer').classList.add('hidden');
}

function changeItemQty(productId, delta) {
  const item = cart.find(i => i.product_id === productId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter(i => i.product_id !== productId);
  }
  updateCartBadge();
  renderCartItems();
}

function renderCartItems() {
  const container = document.getElementById('cart-items-list');
  if (cart.length === 0) {
    container.innerHTML = `<div class="text-center py-12 text-slate-400 text-xs">Tu canasta está vacía. ¡Agrega deliciosos platos de Yopal!</div>`;
    updateCartTotals(0, 0);
    return;
  }

  container.innerHTML = cart.map(i => `
    <div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1">
      <div class="flex items-center justify-between">
        <div>
          <h5 class="font-bold text-xs text-slate-900 dark:text-white">${i.name}</h5>
          <span class="text-[11px] font-black text-orange-600">${formatCOP(i.price)}</span>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="changeItemQty('${i.product_id}', -1)" class="w-6 h-6 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-bold text-xs flex items-center justify-center cursor-pointer">-</button>
          <span class="text-xs font-black w-4 text-center text-slate-900 dark:text-white">${i.quantity}</span>
          <button onclick="changeItemQty('${i.product_id}', 1)" class="w-6 h-6 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-bold text-xs flex items-center justify-center cursor-pointer">+</button>
        </div>
      </div>
      ${i.selected_options && i.selected_options.length > 0 ? `
        <p class="text-[10px] text-slate-500 dark:text-slate-400">${i.selected_options.map(o => `${o.value}`).join(' • ')}</p>
      ` : ''}
    </div>
  `).join('');

  const subtotal = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0);
  const deliveryFee = currentMerchant ? currentMerchant.deliveryFee : 4000;
  updateCartTotals(subtotal, deliveryFee);
}

function updateCartTotals(subtotal, deliveryFee) {
  const serviceFee = 1000;
  let discount = appliedCoupon ? appliedCoupon.discount_amount : 0;
  
  const discountRow = document.getElementById('row-discount');
  if (discount > 0) {
    discountRow.classList.remove('hidden');
    document.getElementById('cart-discount').textContent = `-${formatCOP(discount)}`;
  } else {
    discountRow.classList.add('hidden');
  }

  const tip = selectedTipAmount;
  const total = subtotal > 0 ? Math.max(0, (subtotal - discount) + deliveryFee + serviceFee + tip) : 0;

  document.getElementById('cart-subtotal').textContent = formatCOP(subtotal);
  document.getElementById('cart-fare').textContent = formatCOP(deliveryFee);
  document.getElementById('cart-tip').textContent = formatCOP(tip);
  document.getElementById('cart-total').textContent = formatCOP(total);
}

function selectTip(amount, label) {
  selectedTipAmount = amount;
  document.getElementById('tip-badge-label').textContent = `${formatCOP(amount)} (${label})`;
  
  document.querySelectorAll('.tip-btn').forEach(btn => {
    if (btn.textContent.includes(amount.toString()) || (amount === 0 && btn.textContent.trim() === '$0')) {
      btn.className = 'tip-btn active py-1.5 rounded-xl border-2 border-orange-600 bg-orange-50 dark:bg-orange-950/40 text-orange-600 font-bold transition-all cursor-pointer';
    } else {
      btn.className = 'tip-btn py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 transition-all text-slate-600 dark:text-slate-300 cursor-pointer';
    }
  });

  const subtotal = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0);
  const deliveryFee = currentMerchant ? currentMerchant.deliveryFee : 4000;
  updateCartTotals(subtotal, deliveryFee);
}

async function applyCoupon() {
  const codeInput = document.getElementById('coupon-input');
  const msg = document.getElementById('coupon-message');
  const code = codeInput.value.trim();
  if (!code) return;

  const subtotal = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0);
  try {
    const res = await fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, subtotal })
    });
    const data = await res.json();
    if (res.ok && data.valid) {
      appliedCoupon = data;
      playSuccessChime();
      msg.className = 'text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-1';
      msg.textContent = `¡Cupón aplicado! Descuento de ${formatCOP(data.discount_amount)}`;
      msg.classList.remove('hidden');
      const deliveryFee = currentMerchant ? currentMerchant.deliveryFee : 4000;
      updateCartTotals(subtotal, deliveryFee);
    } else {
      appliedCoupon = null;
      msg.className = 'text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1';
      msg.textContent = data.error || 'Cupón inválido';
      msg.classList.remove('hidden');
      const deliveryFee = currentMerchant ? currentMerchant.deliveryFee : 4000;
      updateCartTotals(subtotal, deliveryFee);
    }
  } catch (err) {
    console.error(err);
  }
}

function startSocialProofTicker() {
  const messages = [
    '🔥 28 pedidos entregados hoy en Yopal • Mamona & Tradición es el más pedido',
    '⚡ Domiciliarios en moto activos en Centro, La Campiña y Llano Lindo',
    '🥩 Asaderos llaneros con carne fresca a la leña listos para despachar',
    '⭐ Calificación promedio de entrega: 4.9 estrellas en Casanare'
  ];
  let idx = 0;
  setInterval(() => {
    idx = (idx + 1) % messages.length;
    const el = document.getElementById('social-proof-text');
    if (el) el.textContent = messages[idx];
  }, 6000);
}

// --------------------------------------------------------------------------
// LUPIN MANDADOS / FAVORES EXPRESS
// --------------------------------------------------------------------------
function openErrandsModal() {
  const modal = document.getElementById('errands-modal');
  modal.classList.remove('hidden');
  modal.classList.add('modal-anim-backdrop');
  const card = modal.querySelector('> div');
  if (card) {
    card.classList.remove('modal-anim-content');
    void card.offsetWidth;
    card.classList.add('modal-anim-content');
  }
}

function closeErrandsModal() {
  document.getElementById('errands-modal').classList.add('hidden');
}

async function submitErrand() {
  const title = document.getElementById('erd-title').value.trim();
  const desc = document.getElementById('erd-desc').value.trim();
  const pickup = document.getElementById('erd-pickup').value.trim();
  const dropoff = document.getElementById('erd-dropoff').value.trim();

  if (!title || !desc) {
    alert('Por favor describe qué mandado o trámite necesitas');
    return;
  }

  const btn = document.getElementById('btn-submit-errand');
  btn.disabled = true;
  btn.textContent = 'Asignando repartidor en Yopal...';

  try {
    const res = await fetch('/api/errands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: desc,
        pickup_address: pickup,
        pickup_lat: 5.3470,
        pickup_lng: -72.4045,
        dropoff_address: dropoff,
        dropoff_lat: 5.3140,
        dropoff_lng: -72.3995
      })
    });
    const data = await res.json();
    if (res.ok) {
      playSuccessChime();
      closeErrandsModal();
      alert(`¡Mandado #${data.errand.errand_number} solicitado con éxito! Un repartidor fue notificado.`);
    } else {
      alert(data.error || 'Error al solicitar mandado');
    }
  } catch (e) {
    alert('Error de conexión');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Solicitar Domiciliario para Mandado`;
  }
}

// --------------------------------------------------------------------------
// CHECKOUT Y PAGO (EFECTIVO, NEQUI, TARJETA)
// --------------------------------------------------------------------------
function openCheckoutModal() {
  if (cart.length === 0) {
    alert('Por favor agrega productos a tu canasta');
    return;
  }
  closeCartDrawer();
  const modal = document.getElementById('checkout-modal');
  modal.classList.remove('hidden');
  modal.classList.add('modal-anim-backdrop');
  const card = modal.querySelector('> div');
  if (card) {
    card.classList.remove('modal-anim-content');
    void card.offsetWidth;
    card.classList.add('modal-anim-content');
  }
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.add('hidden');
}

function handlePaymentMethodChange() {
  const selected = document.querySelector('input[name="pay-method"]:checked');
  if (!selected) return;
  const method = selected.value;

  const brebBox = document.getElementById('bre-b-info-box');
  const cashBox = document.getElementById('cash-change-box');

  if (brebBox) {
    if (method === 'bre_b') brebBox.classList.remove('hidden');
    else brebBox.classList.add('hidden');
  }

  if (cashBox) {
    if (method === 'cash') cashBox.classList.remove('hidden');
    else cashBox.classList.add('hidden');
  }

  // Actualizar estilos visuales de las tarjetas de métodos de pago
  document.querySelectorAll('.pay-method-pill').forEach(pill => {
    const radio = pill.querySelector('input[type="radio"]');
    if (radio && radio.checked) {
      pill.className = 'pay-method-pill p-3 border-2 border-orange-600 bg-orange-50 dark:bg-orange-950/40 text-orange-600 rounded-2xl flex items-center gap-2.5 cursor-pointer shadow-sm';
      const iconBox = pill.querySelector('div:first-of-type');
      if (iconBox) iconBox.className = 'w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center text-sm shadow-sm flex-shrink-0';
    } else if (pill) {
      pill.className = 'pay-method-pill p-3 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl flex items-center gap-2.5 cursor-pointer';
      const iconBox = pill.querySelector('div:first-of-type');
      if (iconBox) iconBox.className = 'w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center text-sm shadow-sm flex-shrink-0';
    }
  });
}

async function submitOrder() {
  const btn = document.getElementById('btn-submit-order');
  btn.disabled = true;
  btn.textContent = 'Procesando en Yopal...';

  const name = document.getElementById('chk-name').value.trim();
  const phone = document.getElementById('chk-phone').value.trim();
  const reference = document.getElementById('chk-reference').value.trim();
  const paymentMethod = document.querySelector('input[name="pay-method"]:checked').value;
  const cashAmount = parseFloat(document.getElementById('chk-cash-amount').value) || 0;

  const user = JSON.parse(localStorage.getItem('lupin_user') || '{}');
  const orderPayload = {
    client_id: user.id || 'usr-client-01',
    client_name: name || user.name || 'Ana María Gómez',
    client_phone: phone || user.phone || '3157890123',
    merchant_id: currentMerchant ? currentMerchant.id : 'mch-01',
    items: cart.map(i => ({
      product_id: i.product_id,
      quantity: i.quantity,
      selected_options: i.selected_options || []
    })),
    payment_method: paymentMethod,
    cash_amount_to_pay_with: paymentMethod === 'cash' ? cashAmount : null,
    delivery_address: userLocation.address,
    delivery_reference: reference,
    delivery_lat: userLocation.lat,
    delivery_lng: userLocation.lng,
    tip_amount: selectedTipAmount || 0,
    discount_amount: appliedCoupon ? appliedCoupon.discount_amount : 0
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });
    const data = await res.json();

    if (res.ok) {
      activeOrderId = data.order.id;
      playSuccessChime();
      cart = [];
      updateCartBadge();
      closeCheckoutModal();
      showTrackingView();
      listenToOrderSocket(activeOrderId);
    } else {
      alert(data.error || 'Error al procesar pedido');
    }
  } catch (err) {
    console.error(err);
    alert('Error de conexión');
  } finally {
    btn.disabled = false;
    btn.textContent = '¡Confirmar y Enviar Pedido!';
  }
}

// --------------------------------------------------------------------------
// RASTREO DE PEDIDO EN VIVO & MAPA LEAFLET EN YOPAL
// --------------------------------------------------------------------------
function listenToOrderSocket(orderId) {
  if (socket) {
    socket.emit('join:order', orderId);
  }
}

async function checkActiveOrder() {
  if (!activeOrderId) return;
  listenToOrderSocket(activeOrderId);
  try {
    const res = await fetch(`/api/orders/${activeOrderId}`);
    const data = await res.json();
    if (data.order && data.order.status !== 'delivered' && data.order.status !== 'cancelled') {
      document.getElementById('active-order-banner').classList.remove('hidden');
    }
  } catch(e) {}
}

function showTrackingView() {
  document.getElementById('view-home').classList.add('hidden');
  document.getElementById('view-merchant').classList.add('hidden');
  document.getElementById('view-tracking').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  loadOrderTrackingData();
}

async function loadOrderTrackingData() {
  try {
    const res = await fetch(`/api/orders/${activeOrderId}`);
    const data = await res.json();
    const o = data.order;

    document.getElementById('track-order-number').textContent = `#${o.order_number}`;
    document.getElementById('track-otp-code').textContent = o.otp_code || '4892';
    
    if (o.driver_name) {
      document.getElementById('track-driver-name').textContent = o.driver_name;
      document.getElementById('track-driver-vehicle').textContent = `${o.driver_vehicle || 'Moto'} • Placa: ${o.driver_plate || 'WXY-12E'}`;
      document.getElementById('track-driver-call').href = `tel:${o.driver_phone}`;
    }

    renderChatMessages(o.chat || []);
    updateTrackingUI(o.status, { lat: o.driver_lat, lng: o.driver_lng });
    initTrackingMap(o);
  } catch (err) {
    console.error('Error cargando tracking:', err);
  }
}

function initTrackingMap(order) {
  if (trackingMap) {
    trackingMap.remove();
  }

  const centerLat = (order.merchant_lat + order.delivery_lat) / 2;
  const centerLng = (order.merchant_lng + order.delivery_lng) / 2;

  trackingMap = L.map('tracking-map').setView([centerLat, centerLng], 14);

  let tileLayer = window.getLupinMapTileLayer ? window.getLupinMapTileLayer() : L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
  tileLayer.addTo(trackingMap);

  window.addEventListener('lupin:themeChanged', () => {
    if (trackingMap && tileLayer) {
      trackingMap.removeLayer(tileLayer);
      tileLayer = window.getLupinMapTileLayer();
      tileLayer.addTo(trackingMap);
    }
  });

  // Marcador Comercio (Naranja LUPIN)
  const mIcon = L.divIcon({
    html: `<div style="background:#ea580c; color:white; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.3); border:2px solid white;"><i class="fa-solid fa-utensils"></i></div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
  L.marker([order.merchant_lat, order.merchant_lng], { icon: mIcon }).addTo(trackingMap).bindPopup(`<b>${order.merchant_name}</b>`);

  // Marcador Cliente Destino (Verde Esmeralda)
  const cIcon = L.divIcon({
    html: `<div style="background:#10b981; color:white; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.3); border:2px solid white;"><i class="fa-solid fa-house-chimney"></i></div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
  L.marker([order.delivery_lat, order.delivery_lng], { icon: cIcon }).addTo(trackingMap).bindPopup(`<b>Tu Ubicación</b><br>${order.delivery_address}`);

  // Marcador Repartidor Móvil (Naranja con pulso)
  const driverLat = order.driver_lat || order.merchant_lat;
  const driverLng = order.driver_lng || order.merchant_lng;

  const dIcon = L.divIcon({
    html: `<div style="background:#ea580c; color:white; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px #ea580c; border:2px solid white;"><i class="fa-solid fa-motorcycle text-sm"></i></div>`,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
  trackingDriverMarker = L.marker([driverLat, driverLng], { icon: dIcon }).addTo(trackingMap).bindPopup(`<b>Repartidor en Camino</b>`);

  // Línea de ruta (Naranja)
  L.polyline([[order.merchant_lat, order.merchant_lng], [order.delivery_lat, order.delivery_lng]], {
    color: '#ea580c',
    weight: 3,
    dashArray: '6, 8',
    opacity: 0.8
  }).addTo(trackingMap);

  setTimeout(() => { if (trackingMap) trackingMap.invalidateSize(); }, 200);
}

function updateTrackingUI(status, driver) {
  const title = document.getElementById('track-status-title');
  const bannerStatus = document.getElementById('banner-order-status');
  const humanTitle = document.getElementById('track-human-title');
  const humanDesc = document.getElementById('track-human-desc');

  const s1 = document.getElementById('step-1');
  const s2 = document.getElementById('step-2');
  const s3 = document.getElementById('step-3');
  const s4 = document.getElementById('step-4');

  const resetSteps = () => {
    [s1, s2, s3, s4].forEach(s => {
      s.className = 'step-item text-slate-300 dark:text-slate-700';
      s.querySelector('div').className = 'h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 mb-1.5';
    });
  };

  const markStep = (stepEl) => {
    stepEl.className = 'step-item text-emerald-600 font-black';
    stepEl.querySelector('div').className = 'h-1.5 rounded-full bg-emerald-500 mb-1.5';
  };

  resetSteps();

  if (status === 'created') {
    title.textContent = 'Pedido recibido por el restaurante';
    bannerStatus.textContent = 'El restaurante está confirmando tu pedido...';
    if (humanTitle) humanTitle.textContent = '1. Confirmación de Cocina';
    if (humanDesc) humanDesc.textContent = 'Tu orden ya ingresó a la pantalla del restaurante. En segundos comenzarán la preparación.';
    markStep(s1);
  } else if (status === 'confirmed' || status === 'preparing') {
    title.textContent = 'Platos en preparación en cocina';
    bannerStatus.textContent = 'Cocinando tu pedido con sazón llanera...';
    if (humanTitle) humanTitle.textContent = '2. Preparando tus Alimentos';
    if (humanDesc) humanDesc.textContent = 'Los cocineros están asando y empacando tu comida caliente en empaques térmicos.';
    markStep(s1); markStep(s2);
  } else if (status === 'ready_for_pickup' || status === 'driver_assigned' || status === 'on_the_way') {
    title.textContent = 'Repartidor en camino a tu ubicación';
    bannerStatus.textContent = 'Tu repartidor va en camino con tu comida...';
    if (humanTitle) humanTitle.textContent = '3. Domiciliario en Moto en Ruta';
    if (humanDesc) humanDesc.textContent = 'El repartidor va hacia tu dirección en Yopal. Ten listo tu PIN OTP de 4 dígitos para recibir el pedido.';
    markStep(s1); markStep(s2); markStep(s3);
  } else if (status === 'delivered') {
    title.textContent = '¡Pedido entregado con éxito!';
    bannerStatus.textContent = '¡Buen provecho! Pedido entregado.';
    if (humanTitle) humanTitle.textContent = '4. Entrega Exitosa';
    if (humanDesc) humanDesc.textContent = 'Tu pedido fue verificado mediante PIN OTP. ¡Esperamos que disfrutes de tu comida!';
    markStep(s1); markStep(s2); markStep(s3); markStep(s4);
  }
}

// --------------------------------------------------------------------------
// CHAT EN VIVO CON EL REPARTIDOR
// --------------------------------------------------------------------------
function renderChatMessages(messages) {
  const box = document.getElementById('chat-messages-box');
  box.innerHTML = messages.map(m => `
    <div class="flex ${m.sender_role === 'client' ? 'justify-end' : 'justify-start'}">
      <div class="max-w-[80%] rounded-2xl px-3 py-1.5 ${m.sender_role === 'client' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-tl-none shadow-sm'}">
        <span class="text-[9px] block opacity-75 font-semibold">${m.sender_role === 'client' ? 'Tú' : 'Repartidor'}</span>
        <p class="text-xs font-medium">${m.message}</p>
      </div>
    </div>
  `).join('');
  box.scrollTop = box.scrollHeight;
}

function appendChatMessage(msg) {
  const box = document.getElementById('chat-messages-box');
  const div = document.createElement('div');
  div.className = `flex ${msg.senderRole === 'client' ? 'justify-end' : 'justify-start'}`;
  div.innerHTML = `
    <div class="max-w-[80%] rounded-2xl px-3 py-1.5 ${msg.senderRole === 'client' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-tl-none shadow-sm'}">
      <span class="text-[9px] block opacity-75 font-semibold">${msg.senderRole === 'client' ? 'Tú' : 'Repartidor'}</span>
      <p class="text-xs font-medium">${msg.message}</p>
    </div>
  `;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !activeOrderId) return;

  if (socket) {
    socket.emit('chat:send_message', {
      orderId: activeOrderId,
      senderId: 'usr-client-01',
      senderRole: 'client',
      message: text
    });
  }
  input.value = '';
}

function sendQuickChatMessage(text) {
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = text;
    sendChatMessage();
  }
}

// --------------------------------------------------------------------------
// MODAL SELECCIONAR UBICACIÓN EN YOPAL
// --------------------------------------------------------------------------
function openLocationModal() {
  document.getElementById('location-modal').classList.remove('hidden');
  setTimeout(initPickerMap, 200);
}

function closeLocationModal() {
  document.getElementById('location-modal').classList.add('hidden');
}

function initPickerMap() {
  if (pickerMap) {
    setTimeout(() => { pickerMap.invalidateSize(); }, 150);
    return;
  }

  pickerMap = L.map('picker-map').setView([userLocation.lat, userLocation.lng], 14);

  let tileLayer = window.getLupinMapTileLayer ? window.getLupinMapTileLayer() : L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
  tileLayer.addTo(pickerMap);

  window.addEventListener('lupin:themeChanged', () => {
    if (pickerMap && tileLayer) {
      pickerMap.removeLayer(tileLayer);
      tileLayer = window.getLupinMapTileLayer();
      tileLayer.addTo(pickerMap);
    }
  });

  pickerMarker = L.marker([userLocation.lat, userLocation.lng], { draggable: true }).addTo(pickerMap);

  pickerMarker.on('dragend', (e) => {
    const pos = e.target.getLatLng();
    userLocation.lat = pos.lat;
    userLocation.lng = pos.lng;
  });

  pickerMap.on('click', (e) => {
    pickerMarker.setLatLng(e.latlng);
    userLocation.lat = e.latlng.lat;
    userLocation.lng = e.latlng.lng;
  });

  setTimeout(() => { pickerMap.invalidateSize(); }, 200);
}

function confirmLocation() {
  const input = document.getElementById('picker-address-input');
  userLocation.address = input.value.trim() || 'Dirección en Yopal';
  document.getElementById('current-address-label').textContent = userLocation.address;
  closeLocationModal();
  loadMerchants();
}
