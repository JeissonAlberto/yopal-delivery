const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');

// ==============================================================================
// 1. LISTAR PLANES DE SUSCRIPCIÓN ACTIVOS (B2C Y B2B)
// ==============================================================================
router.get('/plans', (req, res) => {
  try {
    const { audience } = req.query; // 'client' o 'merchant'
    let query = 'SELECT * FROM subscription_plans WHERE is_active = 1';
    const params = [];

    if (audience) {
      query += ' AND audience = ?';
      params.push(audience);
    }

    query += ' ORDER BY price_cop ASC';
    const plans = db.prepare(query).all(...params);

    const formattedPlans = plans.map(p => ({
      ...p,
      benefits: JSON.parse(p.benefits_json || '[]')
    }));

    return res.json({ plans: formattedPlans });
  } catch (err) {
    console.error('Error listando planes:', err);
    return res.status(500).json({ error: 'Error al consultar planes de suscripción' });
  }
});

// ==============================================================================
// 2. CONTRATAR / RENOVAR MEMBRESÍA (B2C O B2B)
// ==============================================================================
router.post('/subscribe', (req, res) => {
  try {
    const { user_id, plan_id, payment_method } = req.body;

    if (!user_id || !plan_id) {
      return res.status(400).json({ error: 'Usuario y plan son requeridos' });
    }

    const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1').get(plan_id);
    if (!plan) {
      return res.status(404).json({ error: 'Plan de suscripción no encontrado o inactivo' });
    }

    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(user_id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const subId = `sub-${uuidv4().substring(0, 8)}`;
    const quota = plan.free_delivery_allowance || 0;

    // Transacción atómica de suscripción
    const subscribeTx = db.transaction(() => {
      // Cancelar suscripción previa activa si existía
      db.prepare(`
        UPDATE user_subscriptions 
        SET status = 'cancelled' 
        WHERE user_id = ? AND status = 'active'
      `).run(user_id);

      // Crear nueva suscripción con vigencia de 30 días
      db.prepare(`
        INSERT INTO user_subscriptions (
          id, user_id, plan_id, status, free_deliveries_quota, free_deliveries_used,
          current_period_start, current_period_end
        ) VALUES (
          ?, ?, ?, 'active', ?, 0,
          datetime('now'), datetime('now', '+30 days')
        )
      `).run(subId, user_id, plan_id, quota);

      // Otorgar bono de bienvenida en puntos de fidelización (+100 pts)
      db.prepare(`
        INSERT INTO loyalty_points (id, user_id, points_change, reason, reference_id)
        VALUES (?, ?, 100, 'subscription_bonus', ?)
      `).run(`pts-${uuidv4().substring(0, 8)}`, user_id, subId);
    });

    subscribeTx();

    const createdSub = db.prepare(`
      SELECT s.*, p.name as plan_name, p.tier, p.price_cop, p.max_delivery_subsidy_cop, p.min_order_for_free_delivery
      FROM user_subscriptions s
      JOIN subscription_plans p ON s.plan_id = p.id
      WHERE s.id = ?
    `).get(subId);

    return res.status(201).json({
      message: `¡Membresía ${plan.name} activada exitosamente!`,
      subscription: createdSub
    });
  } catch (err) {
    console.error('Error procesando suscripción:', err);
    return res.status(500).json({ error: 'Error al procesar la membresía' });
  }
});

// ==============================================================================
// 3. CONSULTAR ESTADO DE MEMBRESÍA Y CUPO DE DOMICILIOS GRATIS DEL USUARIO
// ==============================================================================
router.get('/my-status/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    const sub = db.prepare(`
      SELECT 
        s.*,
        p.name as plan_name,
        p.audience,
        p.tier,
        p.price_cop,
        p.free_delivery_allowance,
        p.max_delivery_subsidy_cop,
        p.min_order_for_free_delivery,
        p.benefits_json
      FROM user_subscriptions s
      JOIN subscription_plans p ON s.plan_id = p.id
      WHERE s.user_id = ? AND s.status = 'active' AND datetime(s.current_period_end) > datetime('now')
      ORDER BY s.current_period_start DESC
      LIMIT 1
    `).get(userId);

    // Obtener balance de puntos
    const pointsRow = db.prepare('SELECT COALESCE(SUM(points_change), 0) as total_points FROM loyalty_points WHERE user_id = ?').get(userId);
    const totalPoints = pointsRow ? pointsRow.total_points : 0;

    if (!sub) {
      return res.json({
        is_active_member: false,
        plan: null,
        points: totalPoints,
        free_deliveries_remaining: 0
      });
    }

    const remainingDeliveries = Math.max(0, (sub.free_deliveries_quota || 0) - (sub.free_deliveries_used || 0));

    return res.json({
      is_active_member: true,
      subscription_id: sub.id,
      plan_name: sub.plan_name,
      tier: sub.tier,
      expires_at: sub.current_period_end,
      free_deliveries_remaining: remainingDeliveries,
      free_deliveries_used: sub.free_deliveries_used,
      free_deliveries_quota: sub.free_deliveries_quota,
      max_delivery_subsidy_cop: sub.max_delivery_subsidy_cop,
      min_order_for_free_delivery: sub.min_order_for_free_delivery,
      benefits: JSON.parse(sub.benefits_json || '[]'),
      points: totalPoints
    });
  } catch (err) {
    console.error('Error consultando membresía:', err);
    return res.status(500).json({ error: 'Error al consultar estado de membresía' });
  }
});

// ==============================================================================
// 4. HISTORIAL DE PUNTOS Y RECOMPENSAS
// ==============================================================================
router.get('/points-history/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const history = db.prepare(`
      SELECT * FROM loyalty_points 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 20
    `).all(userId);

    const totalRow = db.prepare('SELECT COALESCE(SUM(points_change), 0) as total FROM loyalty_points WHERE user_id = ?').get(userId);
    res.json({
      total_points: totalRow ? totalRow.total : 0,
      history
    });
  } catch (err) {
    res.status(500).json({ error: 'Error consultando historial de puntos' });
  }
});

// ==============================================================================
// 5. CANCELAR MEMBRESÍA
// ==============================================================================
router.post('/cancel', (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id es requerido' });

    const result = db.prepare(`
      UPDATE user_subscriptions
      SET status = 'cancelled'
      WHERE user_id = ? AND status = 'active'
    `).run(user_id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'No se encontró suscripción activa para cancelar' });
    }

    return res.json({ message: 'Membresía cancelada correctamente' });
  } catch (err) {
    console.error('Error cancelando membresía:', err);
    return res.status(500).json({ error: 'Error al cancelar membresía' });
  }
});

module.exports = router;
