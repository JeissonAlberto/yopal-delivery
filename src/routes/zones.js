const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { calculateDistanceKm, calculateDeliveryFare, detectYopalZone, estimateDeliveryTimeMinutes } = require('../services/geo');

// Listar zonas configuradas en Yopal
router.get('/', (req, res) => {
  try {
    const zones = db.prepare('SELECT * FROM delivery_zones WHERE is_active = 1').all();
    res.json({ zones });
  } catch (err) {
    res.status(500).json({ error: 'Error consultando zonas' });
  }
});

// Cotizar tarifa de envío y tiempo estimado en Yopal
router.post('/calculate-fare', (req, res) => {
  try {
    const { originLat, originLng, destLat, destLng } = req.body;

    if (originLat == null || originLng == null || destLat == null || destLng == null) {
      return res.status(400).json({ error: 'Coordenadas de origen y destino son requeridas' });
    }

    const distanceKm = calculateDistanceKm(originLat, originLng, destLat, destLng);
    const zoneName = detectYopalZone(destLat, destLng);
    const deliveryFare = calculateDeliveryFare(distanceKm, zoneName);
    const estimatedMinutes = estimateDeliveryTimeMinutes(20, distanceKm);

    res.json({
      distanceKm,
      zoneName,
      deliveryFare,
      estimatedMinutes,
      serviceFee: 1000,
      currency: 'COP'
    });
  } catch (err) {
    console.error('Error calculando tarifa:', err);
    res.status(500).json({ error: 'Error calculando tarifa' });
  }
});

module.exports = router;
