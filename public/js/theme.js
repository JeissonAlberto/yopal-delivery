// ==============================================================================
// LUPIN EXPRESS - THEME MANAGER (MODO DÍA / MODO NOCHE)
// Gestión global de tema claro/oscuro y sincronización de mapas
// ==============================================================================

(function() {
  const THEME_KEY = 'lupin_theme';

  // Obtener tema inicial (Por defecto 'dark' para estilo moderno/NOC o lectura guardada)
  function getInitialTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    // Si no hay preferencia, verificar preferencia del sistema operativo
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark'; // Dark mode por defecto
  }

  // Aplicar tema en el DOM
  function applyTheme(theme) {
    const root = document.documentElement;
    const body = document.body;

    if (theme === 'dark') {
      root.classList.add('dark');
      if (body) body.classList.add('dark');
    } else {
      root.classList.remove('dark');
      if (body) body.classList.remove('dark');
    }

    localStorage.setItem(THEME_KEY, theme);
    updateToggleButtons(theme);

    // Disparar evento personalizado para que los mapas Leaflet cambien de capa si están activos
    window.dispatchEvent(new CustomEvent('lupin:themeChanged', { detail: { theme } }));
  }

  // Alternar entre modo día y modo noche
  window.toggleTheme = function() {
    const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  };

  // Actualizar icono del botón
  function updateToggleButtons(theme) {
    const btns = document.querySelectorAll('.theme-toggle-btn');
    btns.forEach(btn => {
      if (theme === 'dark') {
        btn.innerHTML = '<i class="fa-solid fa-sun text-amber-400"></i>';
        btn.title = 'Cambiar a Modo Día';
      } else {
        btn.innerHTML = '<i class="fa-solid fa-moon text-slate-700"></i>';
        btn.title = 'Cambiar a Modo Noche';
      }
    });
  }

  // Inyectar botón de tema automáticamente si existe un contenedor
  window.renderThemeToggle = function(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    container.innerHTML = `
      <button onclick="toggleTheme()" class="theme-toggle-btn" aria-label="Alternar Modo Día/Noche">
        ${currentTheme === 'dark' ? '<i class="fa-solid fa-sun text-amber-400"></i>' : '<i class="fa-solid fa-moon text-slate-700"></i>'}
      </button>
    `;
  };

  // Proveedor de capa de mapas según el tema
  window.getLupinMapTileLayer = function() {
    const isDark = document.documentElement.classList.contains('dark');
    const tileUrl = isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

    return L.tileLayer(tileUrl, {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19
    });
  };

  // Inicialización inmediata para evitar parpadeos
  const initial = getInitialTheme();
  applyTheme(initial);

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(initial);
    renderThemeToggle('theme-toggle-container');
  });
})();
