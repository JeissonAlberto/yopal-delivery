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

module.exports = router;
