// LUPIN EXPRESS - AUTH SYSTEM JS
// Gestión de Login, Registro y JWT por Rol (Cliente, Repartidor, Admin)

let selectedRole = 'client';
let currentMode = 'login';

// Mapeo de configuración por rol
const ROLES = {
  client: {
    label: 'Cliente',
    labelShort: 'CLIENTE',
    icon: 'fa-solid fa-bag-shopping',
    iconBg: 'bg-orange-500/20 group-hover:bg-orange-500',
    iconColor: 'text-orange-400 group-hover:text-white',
    borderColor: 'border-orange-500/30',
    redirect: '/client/',
    showDriverFields: false
  },
  driver: {
    label: 'Repartidor',
    labelShort: 'REPARTIDOR',
    icon: 'fa-solid fa-helmet-safety',
    iconBg: 'bg-amber-500/20 group-hover:bg-amber-500',
    iconColor: 'text-amber-400 group-hover:text-amber-400',
    borderColor: 'border-amber-500/30',
    redirect: '/driver/',
    showDriverFields: true
  },
  superadmin: {
    label: 'Administrador',
    labelShort: 'ADMIN / ALIADO',
    icon: 'fa-solid fa-shield-halved',
    iconBg: 'bg-emerald-500/20 group-hover:bg-emerald-500',
    iconColor: 'text-emerald-500 group-hover:text-emerald-400',
    borderColor: 'border-emerald-500/30',
    redirect: '/admin/',
    showDriverFields: false
  }
};

// Verificar si ya hay sesión activa
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('lupin_token');
  const role = localStorage.getItem('lupin_role');
  
  if (token && role) {
    const r = ROLES[role];
    if (r) {
      window.location.href = r.redirect;
      return;
    }
  }
});

// ─── STEP 1: SELECCIÓN DE ROL ────────────────────────────────────
function selectRole(role) {
  selectedRole = role;
  const r = ROLES[role];

  // Animar transición
  document.getElementById('step-role').classList.add('hidden');
  document.getElementById('step-form').classList.remove('hidden');
  document.getElementById('step-form').classList.add('animate-slide-up');

  // Configurar icono y label del rol
  const iconEl = document.getElementById('form-role-icon');
  iconEl.className = `w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-bold shadow-lg ${r.iconBg} ${r.iconColor}`;
  iconEl.innerHTML = `<i class="${r.icon}"></i>`;

  document.getElementById('form-role-label').textContent = `LUPIN Express • ${r.labelShort}`;
  document.getElementById('form-role-label').className = `text-[10px] font-black uppercase tracking-wider block ${r.iconColor.split(' ')[0]}`;

  document.getElementById('form-title').textContent = `Bienvenido, ${r.label}`;

  // Mostrar/ocultar campos de repartidor
  document.getElementById('driver-fields').classList.toggle('hidden', !r.showDriverFields);

  // Reset forms
  switchAuthMode('login');
  hideError();
}

function backToRoles() {
  document.getElementById('step-form').classList.add('hidden');
  document.getElementById('step-role').classList.remove('hidden');
  hideError();
}

// ─── STEP 2: TOGGLE LOGIN / REGISTER ─────────────────────────────
function switchAuthMode(mode) {
  currentMode = mode;
  const loginForm = document.getElementById('form-login');
  const registerForm = document.getElementById('form-register');
  const btnLogin = document.getElementById('btn-tab-login');
  const btnRegister = document.getElementById('btn-tab-register');

  hideError();

  if (mode === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    btnLogin.className = 'flex-1 py-2.5 rounded-xl text-xs font-bold transition-all bg-orange-500 text-white shadow-lg shadow-orange-600/20';
    btnRegister.className = 'flex-1 py-2.5 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-white';
  } else {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    btnRegister.className = 'flex-1 py-2.5 rounded-xl text-xs font-bold transition-all bg-orange-500 text-white shadow-lg shadow-orange-600/20';
    btnLogin.className = 'flex-1 py-2.5 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-white';
  }
}

async function quickLogin(email, password) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (res.ok && data.token) {
      localStorage.setItem('lupin_token', data.token);
      localStorage.setItem('lupin_user', JSON.stringify(data.user));
      localStorage.setItem('lupin_role', data.user.role);
      localStorage.setItem('lupin_name', data.user.name);

      const r = ROLES[data.user.role];
      if (r) {
        window.location.href = r.redirect;
      } else {
        window.location.href = '/';
      }
    } else {
      alert(data.error || 'Error en inicio de sesión rápido');
    }
  } catch (err) {
    alert('Error conectando al servidor');
  }
}

// ─── LOGIN HANDLER ───────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Verificando credenciales...';
  hideError();

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (res.ok && data.token) {
      // Guardar sesión en localStorage
      localStorage.setItem('lupin_token', data.token);
      localStorage.setItem('lupin_user', JSON.stringify(data.user));
      localStorage.setItem('lupin_role', data.user.role);
      localStorage.setItem('lupin_name', data.user.name);

      // Mostrar feedback exitoso
      btn.innerHTML = '<i class="fa-solid fa-check-circle"></i> ¡Bienvenido, ' + data.user.name.split(' ')[0] + '!';

      // Redirigir al portal correspondiente
      setTimeout(() => {
        const r = ROLES[data.user.role];
        if (r) {
          window.location.href = r.redirect;
        } else {
          window.location.href = '/';
        }
      }, 800);
    } else {
      showError(data.error || 'Credenciales inválidas');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Iniciar Sesión';
    }
  } catch (err) {
    showError('Error de conexión con el servidor');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Iniciar Sesión';
  }
}

// ─── REGISTER HANDLER ────────────────────────────────────────────
async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-register');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Creando tu cuenta...';
  hideError();

  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const password = document.getElementById('reg-password').value;

  const payload = {
    name,
    email,
    phone,
    password,
    role: selectedRole
  };

  // Campos extra de repartidor
  if (selectedRole === 'driver') {
    payload.vehicle_type = document.getElementById('reg-vehicle').value;
    payload.plate_number = document.getElementById('reg-plate').value.trim();
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (res.ok && data.token) {
      // Guardar sesión
      localStorage.setItem('lupin_token', data.token);
      localStorage.setItem('lupin_user', JSON.stringify(data.user));
      localStorage.setItem('lupin_role', data.user.role);
      localStorage.setItem('lupin_name', data.user.name);

      btn.innerHTML = '<i class="fa-solid fa-check-circle"></i> ¡Cuenta creada exitosamente!';

      // Redirigir al portal correspondiente
      setTimeout(() => {
        const r = ROLES[data.user.role];
        if (r) {
          window.location.href = r.redirect;
        } else {
          window.location.href = '/';
        }
      }, 1000);
    } else {
      showError(data.error || 'Error al crear la cuenta');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Crear Mi Cuenta';
    }
  } catch (err) {
    showError('Error de conexión con el servidor');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Crear Mi Cuenta';
  }
}

// ─── UTILS ───────────────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById('auth-error');
  el.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${msg}`;
  el.classList.remove('hidden');
}

function hideError() {
  document.getElementById('auth-error').classList.add('hidden');
}
