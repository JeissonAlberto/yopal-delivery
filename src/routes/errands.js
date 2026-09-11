const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const { calculateDistanceKm, calculateDeliveryFare } = require('../services/geo');
const { autoDispatchOrder } = require('../services/dispatch');

// Crear un Mandado / Favor Express en Yopal
router.post('/', (req, res) => {
  try {
    const {
      client_name,
      client_phone,
      title,
      description,
      pickup_address,
      pickup_lat,
      pickup_lng,
      dropoff_address,
      dropoff_lat,
      dropoff_lng,
      payment_method = 'cash'
    } = req.body;

    if (!title || !description || !pickup_address || !dropoff_address) {
      return res.status(400).json({ error: 'Todos los datos del mandado son requeridos' });
    }

    const pLat = parseFloat(pickup_lat);
    const pLng = parseFloat(pickup_lng);
    const dLat = parseFloat(dropoff_lat);
    const dLng = parseFloat(dropoff_lng);

    if (isNaN(pLat) || isNaN(pLng) || isNaN(dLat) || isNaN(dLng) || pLat < -90 || pLat > 90 || dLat < -90 || dLat > 90) {
      return res.status(400).json({ error: 'Coordenadas GPS del mandado inválidas o fuera de rango' });
    }

    const distanceKm = calculateDistanceKm(pLat, pLng, dLat, dLng);
    const fareAmount = calculateDeliveryFare(distanceKm, 'Zona Centro') + 1000; // Base especial para favores punto a punto

    const id = `erd-${uuidv4().substring(0, 8)}`;
    const errandNumber = `MND-${Math.floor(1000 + Math.random() * 9000)}-${Date.now().toString().slice(-4)}`;
    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

    db.prepare(`
      INSERT INTO errands (
        id, errand_number, client_id, client_name, client_phone,
        title, description, pickup_address, pickup_lat, pickup_lng,
        dropoff_address, dropoff_lat, dropoff_lng, status, distance_km, fare_amount, payment_method, otp_code
      ) VALUES (
        ?, ?, 'usr-client-01', ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, 'created', ?, ?, ?, ?
      )
    `).run(
      id, errandNumber, client_name || 'Cliente Yopal', client_phone || '3157890123',
      title, description, pickup_address, pLat, pLng,
      dropoff_address, dLat, dLng, distanceKm, fareAmount, payment_method, otpCode
    );

    const createdErrand = db.prepare('SELECT * FROM errands WHERE id = ?').get(id);

    // Notificar por WebSocket a Torre de Control y Repartidores
    const io = req.app.get('io');
    if (io) {
      io.emit('admin:errand_created', { errand: createdErrand });
    }

    res.status(201).json({
      message: 'Mandado creado exitosamente',
      errand: createdErrand
    });
  } catch (err) {
    console.error('Error creando mandado:', err);
    res.status(500).json({ error: 'Error al procesar mandado' });
  }
});

// Listar mandados
router.get('/', (req, res) => {
  try {
    const errands = db.prepare('SELECT * FROM errands ORDER BY created_at DESC LIMIT 30').all();
    res.json({ errands });
  } catch (err) {
    res.status(500).json({ error: 'Error consultando mandados' });
  }
});

// Cambiar estado de mandado
router.patch('/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    db.prepare('UPDATE errands SET status = ? WHERE id = ?').run(status, id);

    const io = req.app.get('io');
    if (io) {
      io.emit('admin:errand_updated', { errandId: id, status });
    }

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: 'Error actualizando mandado' });
  }
});

module.exports = router;
