const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');

// ==============================================================================
// 1. LISTAR MÉTODOS DE PAGO DISPONIBLES (BRE-B, NEQUI, EFECTIVO, PSE, WOMPI)
// ==============================================================================
router.get('/methods', (req, res) => {
  try {
    const paymentMethods = [
      {
        id: 'bre_b',
        name: 'Llave Bre-B (Banco de la República)',
        badge: '⚡ Instantáneo y GRATIS ($0 Comisión)',
        description: 'Transfiere gratis desde cualquier banco o billetera digital (Nequi, Daviplata, Bancolombia, Nu, Davivienda, BBVA).',
        is_free: true,
        keys: {
          phone: '3123456781',
          merchant_code: 'LUPIN-YOPAL-01',
          national_id: '901824550',
          email: 'pagos@lupinexpress.com'
        },
        supported_entities: [
          'Nequi', 'Daviplata', 'Bancolombia', 'Davivienda', 'Nu Colombia',
          'Banco de Bogotá', 'BBVA', 'Dale!', 'Movii', 'Lulo Bank'
        ]
      },
      {
        id: 'nequi',
        name: 'Nequi Directo / QR',
        badge: '📲 $0 Comisión',
        description: 'Envía directamente a nuestra cuenta Nequi oficial en Yopal sin intermediarios.',
        is_free: true,
        phone: '3123456781',
        qr_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300'
      },
      {
        id: 'daviplata',
        name: 'Daviplata Directo',
        badge: '📲 $0 Comisión',
        description: 'Pasa plata gratis desde tu Daviplata a nuestro número en Casanare.',
        is_free: true,
        phone: '3123456781'
      },
      {
        id: 'cash',
        name: 'Efectivo Contra Entrega',
        badge: '💵 Pago en Mano',
        description: 'Paga al domiciliario cuando llegue a tu casa. Lleva cambio exacto.',
        is_free: true
      },
      {
        id: 'wompi_pse',
        name: 'PSE / Tarjetas Crédito & Débito (Wompi)',
        badge: '💳 Pasarela Digital',
        description: 'Paga con tarjeta débito, crédito o cuenta de ahorros mediante PSE.',
        is_free: false,
        gateway: 'Wompi Bancolombia'
      }
    ];

    res.json({ payment_methods: paymentMethods });
  } catch (err) {
    console.error('Error listando métodos de pago:', err);
    res.status(500).json({ error: 'Error al consultar métodos de pago' });
  }
});

// ==============================================================================
// 2. GENERAR ORDEN DE PAGO CON LLAVE BRE-B / DIGITAL
// ==============================================================================
router.post('/generate', (req, res) => {
  try {
    const { order_id, user_id, payment_method, amount_cop, bre_b_key_type } = req.body;

    if (!user_id || !payment_method || !amount_cop) {
      return res.status(400).json({ error: 'user_id, payment_method y amount_cop son requeridos' });
    }

    const paymentId = `pay-${uuidv4().substring(0, 8)}`;
    const referenceCode = `BREB-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    let keyValue = '3123456781';
    if (bre_b_key_type === 'merchant_code') keyValue = 'LUPIN-YOPAL-01';
    if (bre_b_key_type === 'national_id') keyValue = '901824550';
    if (bre_b_key_type === 'email') keyValue = 'pagos@lupinexpress.com';

    db.prepare(`
      INSERT INTO payments (
        id, order_id, user_id, payment_method, amount_cop, status,
        bre_b_key_type, bre_b_key_value, reference_code
      ) VALUES (
        ?, ?, ?, ?, ?, 'pending',
        ?, ?, ?
      )
    `).run(
      paymentId,
      order_id || null,
      user_id,
      payment_method,
      parseInt(amount_cop),
      bre_b_key_type || 'phone',
      keyValue,
      referenceCode
    );

    const createdPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);

    res.status(201).json({
      message: 'Intención de pago generada exitosamente',
      reference_code: referenceCode,
      payment: createdPayment,
      instructions: {
        method: payment_method,
        key_type: bre_b_key_type || 'phone',
        key_value: keyValue,
        reference: referenceCode,
        amount_cop: parseInt(amount_cop),
        step_1: `Abre tu app bancaria (Nequi, Daviplata, Bancolombia, Nu, etc.)`,
        step_2: `Transfiere con Llave Bre-B a ${keyValue}`,
        step_3: `Coloca el código de referencia ${referenceCode} en la descripción`
      }
    });
  } catch (err) {
    console.error('Error generando pago:', err);
    res.status(500).json({ error: 'Error al generar la orden de pago' });
  }
});

// ==============================================================================
// 3. CONFIRMAR PAGO DIGITAL CON CÓDIGO DE APROBACIÓN / COMPROBANTE
// ==============================================================================
router.post('/confirm', (req, res) => {
  try {
    const { reference_code, approval_code, proof_photo_url } = req.body;

    if (!reference_code) {
      return res.status(400).json({ error: 'reference_code es obligatorio' });
    }

    const payment = db.prepare('SELECT * FROM payments WHERE reference_code = ?').get(reference_code);
    if (!payment) {
      return res.status(404).json({ error: 'Orden de pago no encontrada' });
    }

    const confirmTx = db.transaction(() => {
      // 1. Actualizar estado del pago a 'approved'
      db.prepare(`
        UPDATE payments
        SET status = 'approved',
            approval_code = ?,
            proof_photo_url = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE reference_code = ?
      `).run(approval_code || 'APROBADO-BREB', proof_photo_url || '', reference_code);

      // 2. Si está vinculado a un pedido, actualizar orders.payment_status = 'approved'
      if (payment.order_id) {
        db.prepare(`
          UPDATE orders
          SET payment_status = 'approved'
          WHERE id = ?
        `).run(payment.order_id);
      }
    });

    confirmTx();

    const updatedPayment = db.prepare('SELECT * FROM payments WHERE reference_code = ?').get(reference_code);

    res.json({
      message: '¡Pago confirmado exitosamente mediante Llave Bre-B / Billetera Digital!',
      payment: updatedPayment
    });
  } catch (err) {
    console.error('Error confirmando pago:', err);
    res.status(500).json({ error: 'Error al confirmar pago' });
  }
});

module.exports = router;
