const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

// Listar repartidores activos y online (para Torre de Control y Despacho)
router.get('/active', (req, res) => {
  try {
    const drivers = db.prepare(`
      SELECT id, user_id, name, phone, vehicle_type, plate_number, lat, lng, heading, speed,
             is_online, is_busy, balance_cash_collected, balance_earnings, rating, total_deliveries, current_order_id, last_ping_at
      FROM drivers
      WHERE is_online = 1
    `).all();

    res.json({ drivers });
  } catch (err) {
    res.status(500).json({ error: 'Error consultando repartidores activos' });
  }
});

// Detalle de un repartidor
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const driver = db.prepare('SELECT * FROM drivers WHERE id = ? OR user_id = ?').get(id, id);
    if (!driver) return res.status(404).json({ error: 'Repartidor no encontrado' });

    // Historial de transacciones de billetera
    const ledger = db.prepare('SELECT * FROM driver_wallet_ledger WHERE driver_id = ? ORDER BY created_at DESC LIMIT 20').all(driver.id);

    // Pedido actual si existe
    let currentOrder = null;
    if (driver.current_order_id) {
      currentOrder = db.prepare(`
        SELECT o.*, m.name as merchant_name, m.address as merchant_address, m.lat as merchant_lat, m.lng as merchant_lng, m.phone as merchant_phone
        FROM orders o
        JOIN merchants m ON o.merchant_id = m.id
        WHERE o.id = ?
      `).get(driver.current_order_id);
    }

    res.json({ driver, ledger, currentOrder });
  } catch (err) {
    res.status(500).json({ error: 'Error consultando datos de repartidor' });
  }
});

// Cambiar estado Online / Offline
router.patch('/:id/toggle-online', (req, res) => {
  try {
    const { id } = req.params;
    const driver = db.prepare('SELECT is_online FROM drivers WHERE id = ? OR user_id = ?').get(id, id);
    if (!driver) return res.status(404).json({ error: 'Repartidor no encontrado' });

    const newStatus = driver.is_online ? 0 : 1;
    db.prepare('UPDATE drivers SET is_online = ? WHERE id = ? OR user_id = ?').run(newStatus, id, id);

    const io = req.app.get('io');
    if (io) {
      io.emit('admin:driver_status_changed', { driverId: id, is_online: newStatus });
    }

    res.json({ success: true, is_online: newStatus });
  } catch (err) {
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
});

// Actualizar coordenadas GPS
router.post('/:id/location', (req, res) => {
  try {
    const { id } = req.params;
    const { lat, lng, heading = 0, speed = 0, order_id } = req.body;

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (isNaN(parsedLat) || isNaN(parsedLng) || parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
      return res.status(400).json({ error: 'Coordenadas GPS de telemetría inválidas o fuera de rango' });
    }

    db.prepare(`
      UPDATE drivers
      SET lat = ?, lng = ?, heading = ?, speed = ?, last_ping_at = CURRENT_TIMESTAMP
      WHERE id = ? OR user_id = ?
    `).run(parsedLat, parsedLng, parseFloat(heading) || 0, parseFloat(speed) || 0, id, id);

    const driver = db.prepare('SELECT id, current_order_id FROM drivers WHERE id = ? OR user_id = ?').get(id, id);

    const activeOrderId = order_id || driver.current_order_id;
    const io = req.app.get('io');
    if (io) {
      if (activeOrderId) {
        io.to(`order:${activeOrderId}`).emit('driver:location_changed', {
          driverId: driver.id,
          lat,
          lng,
          heading,
          speed
        });
      }
      io.emit('admin:driver_moved', {
        driverId: driver.id,
        lat,
        lng,
        heading,
        speed
      });
    }

    res.json({ success: true, lat, lng });
  } catch (err) {
    res.status(500).json({ error: 'Error actualizando ubicación' });
  }
});

// ==============================================================================
// SOLICITUD DE RETIRO DE GANANCIAS A NEQUI / BRE-B
// ==============================================================================
router.post('/:id/withdraw', (req, res) => {
  try {
    const { id } = req.params;
    const { amount_cop, bre_b_key, account_type = 'nequi' } = req.body;

    const amount = parseInt(amount_cop);
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Monto de retiro inválido' });
    }

    if (!bre_b_key) {
      return res.status(400).json({ error: 'Se requiere el número de cuenta Nequi o Llave Bre-B para la transferencia' });
    }

    const driver = db.prepare('SELECT id, name, balance_earnings FROM drivers WHERE id = ? OR user_id = ?').get(id, id);
    if (!driver) {
      return res.status(404).json({ error: 'Repartidor no encontrado' });
    }

    if (amount > driver.balance_earnings) {
      return res.status(400).json({
        error: `Saldo insuficiente. Tu saldo disponible para retiro es de $${driver.balance_earnings.toLocaleString('es-CO')} COP`
      });
    }

    const txId = `tx-wdr-${Date.now().toString().slice(-6)}`;

    // Transacción atómica de retiro
    const withdrawTx = db.transaction(() => {
      db.prepare(`
        UPDATE drivers
        SET balance_earnings = balance_earnings - ?
        WHERE id = ?
      `).run(amount, driver.id);

      db.prepare(`
        INSERT INTO driver_wallet_ledger (id, driver_id, transaction_type, amount, description)
        VALUES (?, ?, 'withdrawal_payout', ?, ?)
      `).run(txId, driver.id, -amount, `Transferencia exitosa a ${account_type.toUpperCase()} / Bre-B: ${bre_b_key}`);
    });

    withdrawTx();

    const updatedDriver = db.prepare('SELECT balance_earnings, balance_cash_collected FROM drivers WHERE id = ?').get(driver.id);

    res.json({
      message: `¡Transferencia de $${amount.toLocaleString('es-CO')} COP enviada exitosamente a ${bre_b_key}!`,
      transaction_id: txId,
      new_balance: updatedDriver.balance_earnings
    });
  } catch (err) {
    console.error('Error procesando retiro:', err);
    res.status(500).json({ error: 'Error al procesar el retiro' });
  }
});

module.exports = router;
