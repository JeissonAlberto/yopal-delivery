// ==============================================================================
// LUPIN EXPRESS - PM2 ECOSYSTEM CONFIGURATION
// Configuración para ejecución en clúster / modo bare-metal en VPS
// ==============================================================================

module.exports = {
  apps: [
    {
      name: 'lupin-express-api',
      script: './src/server.js',
      instances: 'max', // Clúster multinúcleo
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '800M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
