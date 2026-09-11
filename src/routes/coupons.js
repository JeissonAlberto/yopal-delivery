const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

// Validar cupón de descuento
router.post('/validate', (req, res) => {
  try {
    const { code, subtotal } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Ingresa un código de cupón' });
    }

    const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(code.toUpperCase().trim());
    if (!coupon) {
      return res.status(404).json({ error: 'Cupón no válido o expirado' });
    }

    const sub = parseFloat(subtotal) || 0;
    if (sub < coupon.min_order_amount) {
      return res.status(400).json({
        error: `El pedido mínimo para usar este cupón es de $${coupon.min_order_amount.toLocaleString('es-CO')} COP`
      });
    }

    const discountAmount = Math.min((sub * coupon.discount_percent) / 100, coupon.max_discount);

    res.json({
      valid: true,
      code: coupon.code,
      discount_percent: coupon.discount_percent,
      discount_amount: Math.round(discountAmount),
      description: coupon.description
    });
  } catch (err) {
    console.error('Error validando cupón:', err);
    res.status(500).json({ error: 'Error al validar cupón' });
  }
});

// Listar cupones disponibles
router.get('/', (req, res) => {
  try {
    const coupons = db.prepare('SELECT * FROM coupons WHERE is_active = 1 ORDER BY created_at DESC').all();
    res.json({ coupons });
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar cupones' });
  }
});

// Crear nuevo cupón (Comercio / Admin)
router.post('/create', (req, res) => {
  try {
    const { code, discount_percent, max_discount, min_order_amount, description } = req.body;
    if (!code || !discount_percent) {
      return res.status(400).json({ error: 'Código y porcentaje de descuento son obligatorios' });
    }

    const cleanCode = code.toUpperCase().trim();
    const id = `cpn-${Date.now().toString().slice(-6)}`;

    db.prepare(`
      INSERT INTO coupons (id, code, discount_percent, max_discount, min_order_amount, description, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      cleanCode,
      parseFloat(discount_percent) || 10.0,
      parseFloat(max_discount) || 10000.0,
      parseFloat(min_order_amount) || 20000.0,
      description || `Descuento especial del ${discount_percent}%`
    );

    const created = db.prepare('SELECT * FROM coupons WHERE id = ?').get(id);
    res.status(201).json({ message: 'Cupón creado exitosamente', coupon: created });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || (err.message && err.message.includes('UNIQUE'))) {
      return res.status(400).json({ error: 'Ya existe un cupón con este código' });
    }
    res.status(500).json({ error: 'Error al crear cupón' });
  }
});

module.exports = router;
