// LUPIN EXPRESS - SHARED AUTH GUARD
// Verifica la sesión JWT y protege las rutas de los portales

function lupinAuthCheck(allowedRoles = [], requireAuth = true) {
  const token = localStorage.getItem('lupin_token');
  const userStr = localStorage.getItem('lupin_user');
  const role = localStorage.getItem('lupin_role');
  const name = localStorage.getItem('lupin_name');

  if (!token || !userStr) {
    if (requireAuth) {
      window.location.href = '/auth/';
    }
    return null;
  }

  try {
    const user = JSON.parse(userStr);
    
    // Si se especifican roles permitidos, verificar
    if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
      if (requireAuth) {
        // Redirigir al portal correcto según el rol
        const redirects = {
          client: '/client/',
          driver: '/driver/',
          superadmin: '/admin/',
          merchant_admin: '/merchant/'
        };
        window.location.href = redirects[role] || '/auth/';
      }
      return null;
    }

    return { token, user, role, name: user.name || name };
  } catch (e) {
    localStorage.clear();
    if (requireAuth) {
      window.location.href = '/auth/';
    }
    return null;
  }
}

function lupinLogout() {
  localStorage.removeItem('lupin_token');
  localStorage.removeItem('lupin_user');
  localStorage.removeItem('lupin_role');
  localStorage.removeItem('lupin_name');
  window.location.href = '/auth/';
}

function lupinGetHeaders() {
  const token = localStorage.getItem('lupin_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

function lupinRenderUserBadge(containerId, role = 'client') {
  const name = localStorage.getItem('lupin_name') || 'Usuario';
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const el = document.getElementById(containerId);
  if (!el) return;

  const roleColors = {
    client: 'bg-orange-500',
    driver: 'bg-amber-500',
    superadmin: 'bg-cyan-500',
    merchant_admin: 'bg-emerald-500'
  };

  el.innerHTML = `
    <div class="flex items-center gap-2.5">
      <div class="w-8 h-8 rounded-xl ${roleColors[role] || 'bg-slate-500'} text-white flex items-center justify-center font-black text-xs shadow-md">
        ${initials}
      </div>
      <div class="hidden sm:block">
        <p class="text-xs font-bold text-white leading-none">${name}</p>
        <p class="text-[10px] text-slate-400">${role === 'superadmin' ? 'Administrador' : role === 'driver' ? 'Repartidor' : role === 'merchant_admin' ? 'Aliado' : 'Cliente'}</p>
      </div>
      <button onclick="lupinLogout()" class="ml-1 px-2 py-1 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 text-[10px] font-bold rounded-lg transition-all" title="Cerrar Sesión">
        <i class="fa-solid fa-right-from-bracket"></i>
      </button>
    </div>
  `;
}
