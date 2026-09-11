const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const config = require('./config');
const { initDatabase } = require('./db/database');
const { seedData } = require('./db/seed');
const { setupSocketIO } = require('./services/socket');
const { startAutomationScheduler } = require('./services/automation');

// Iniciar aplicación Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  }
});

// Guardar instancia de io en app para su uso en rutas
app.set('io', io);

// Middlewares de Alto Rendimiento & Seguridad
app.use(compression()); // Compresión Gzip/Deflate para reducir uso de red 75%
app.use(cors());

// Cabeceras HTTP de Seguridad
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Rate Limiter en Memoria para Protección contra Ataques de Fuerza Bruta
const ipRequestHits = new Map();
app.use('/api/auth/login', (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const clientHits = ipRequestHits.get(ip) || { count: 0, resetAt: now + 60000 };

  if (now > clientHits.resetAt) {
    clientHits.count = 1;
    clientHits.resetAt = now + 60000;
  } else {
    clientHits.count++;
  }
  ipRequestHits.set(ip, clientHits);

  if (clientHits.count > 60) {
    return res.status(429).json({ error: 'Demasiadas solicitudes de autenticación. Intenta de nuevo en un minuto.' });
  }
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Servir archivos estáticos del frontend con caché optimizado
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: '1d',
  etag: true
}));

// Inicializar base de datos y seed data
initDatabase();
seedData().catch(console.error);

// Configurar WebSockets
setupSocketIO(io);

// Rutas de API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/merchants', require('./routes/merchants'));
app.use('/api/products', require('./routes/products'));
app.use('/api/zones', require('./routes/zones'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/errands', require('./routes/errands'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/search', require('./routes/search'));
app.use('/api/promotions', require('./routes/promotions'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/favorites', require('./routes/favorites'));

// Iniciar programador de tareas automáticas
startAutomationScheduler();

// Fallback de salud
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'LUPIN Express Backend',
    city: 'Yopal, Casanare, Colombia',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// Middleware Global de Manejo de Errores
app.use((err, req, res, next) => {
  console.error('⚠️ Error no controlado:', err.stack || err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
    timestamp: new Date().toISOString()
  });
});

// Iniciar servidor HTTP
server.listen(config.PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 LUPIN EXPRESS - PLATAFORMA DE DELIVERY INTEGRAL`);
  console.log(`📍 Ciudad: Yopal, Casanare, Colombia`);
  console.log(`🌐 Servidor activo en: http://localhost:${config.PORT}`);
  console.log(`📱 Portal Switcher: http://localhost:${config.PORT}/index.html`);
  console.log(`🍔 App Cliente: http://localhost:${config.PORT}/client/`);
  console.log(`🏬 Portal Comercio: http://localhost:${config.PORT}/merchant/`);
  console.log(`🛵 App Repartidor: http://localhost:${config.PORT}/driver/`);
  console.log(`🛡️ Torre de Control Admin: http://localhost:${config.PORT}/admin/`);
  console.log(`=======================================================`);
});

module.exports = { app, server };
