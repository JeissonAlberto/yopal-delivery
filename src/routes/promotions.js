const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');

// ==============================================================================
// 1. LISTAR PROMOCIONES Y OFERTAS ACTIVAS EN YOPAL
// ==============================================================================
router.get('/', (req, res) => {
  try {
    const { is_vip } = req.query;

    let query = `
      SELECT 
        p.*,
        m.name as merchant_name,
        m.category as merchant_category,
        m.logo_url as merchant_logo,
        m.address as merchant_address
      FROM promotions p
      JOIN merchants m ON p.merchant_id = m.id
      WHERE p.is_active = 1 AND datetime(p.end_date) > datetime('now')
    `;

    if (is_vip !== '1' && is_vip !== 'true') {
      query += ' AND p.is_vip_exclusive = 0';
    }

    query += ' ORDER BY p.created_at DESC';

    const promos = db.prepare(query).all();
    return res.json({ promotions: promos });
  } catch (err) {
    console.error('Error listando promociones:', err);
    return res.status(500).json({ error: 'Error al consultar promociones activas' });
  }
});

// ==============================================================================
// 2. CREAR NUEVA PROMOCIÓN O CAMPAÑA FLASH
// ==============================================================================
router.post('/', (req, res) => {
  try {
    const {
      merchant_id,
      title,
      description,
      banner_url,
      discount_percent,
      discount_amount_fixed,
      promo_type,
      is_vip_exclusive,
      end_date_days
    } = req.body;

    if (!merchant_id || !title || !description) {
      return res.status(400).json({ error: 'Comercio, título y descripción son requeridos' });
    }

    const merchant = db.prepare('SELECT id, name FROM merchants WHERE id = ?').get(merchant_id);
    if (!merchant) {
      return res.status(404).json({ error: 'Comercio no existe' });
    }

    const promoId = `prm-${uuidv4().substring(0, 8)}`;
    const days = parseInt(end_date_days) || 15;

    db.prepare(`
      INSERT INTO promotions (
        id, merchant_id, title, description, banner_url,
        discount_percent, discount_amount_fixed, promo_type,
        is_vip_exclusive, start_date, end_date, is_active
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, datetime('now'), datetime('now', '+' || ? || ' days'), 1
      )
    `).run(
      promoId,
      merchant_id,
      title,
      description,
      banner_url || 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800',
      parseFloat(discount_percent) || 0,
      parseFloat(discount_amount_fixed) || 0,
      promo_type || 'percentage',
      is_vip_exclusive ? 1 : 0,
      days
    );

    const created = db.prepare('SELECT * FROM promotions WHERE id = ?').get(promoId);
    return res.status(201).json({ message: 'Promoción publicada exitosamente', promotion: created });
  } catch (err) {
    console.error('Error creando promoción:', err);
    return res.status(500).json({ error: 'Error al crear la promoción' });
  }
});

module.exports = router;
