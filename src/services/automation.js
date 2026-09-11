const { db } = require('../db/database');

// ==============================================================================
// SERVICIO DE AUTOMATIZACIÓN Y MANTENIMIENTO PERIÓDICO (LUPIN EXPRESS)
// ==============================================================================
function runAutomatedMaintenance() {
  try {
    const now = new Date().toISOString();

    // 1. Expirar promociones vencidas
    const expPromos = db.prepare(`
      UPDATE promotions
      SET is_active = 0
      WHERE is_active = 1 AND datetime(end_date) <= datetime('now')
    `).run();

    // 2. Expirar suscripciones vencidas
    const expSubs = db.prepare(`
      UPDATE user_subscriptions
      SET status = 'expired'
      WHERE status = 'active' AND datetime(current_period_end) <= datetime('now')
    `).run();

    // 3. Optimización periódica de base de datos WAL
    db.prepare('PRAGMA optimize').run();

    if (expPromos.changes > 0 || expSubs.changes > 0) {
      console.log(`🧹 Mantenimiento automático: ${expPromos.changes} promos expiradas, ${expSubs.changes} membresías vencidas.`);
    }
  } catch (err) {
    console.error('Error en mantenimiento automático:', err);
  }
}

// Iniciar cron cada 10 minutos
function startAutomationScheduler() {
  // Ejecución inicial
  runAutomatedMaintenance();
  // Intervalo cada 10 minutos
  setInterval(runAutomatedMaintenance, 10 * 60 * 1000);
}

module.exports = {
  runAutomatedMaintenance,
  startAutomationScheduler
};
