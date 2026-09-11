const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { calculateDistanceKm, calculateDeliveryFare, estimateDeliveryTimeMinutes } = require('../services/geo');

// Listar comercios en Yopal con filtros, búsqueda y cálculo de distancia
router.get('/', (req, res) => {
  try {
    const { category, search, lat, lng } = req.query;
    const userLat = lat ? parseFloat(lat) : null;
    const userLng = lng ? parseFloat(lng) : null;

    let query = `
      SELECT id, name, slug, description, category, logo_url, banner_url, address, zone_name,
             lat, lng, is_open, is_featured, rating, prep_time_avg, phone
      FROM merchants
      WHERE 1=1
    `;
    const params = [];

    if (category && category !== 'Todos') {
      query += ` AND category = ?`;
      params.push(category);
    }

    if (search) {
      query += ` AND (name LIKE ? OR description LIKE ? OR category LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY is_featured DESC, is_open DESC, rating DESC`;

    const merchants = db.prepare(query).all(...params);

    // Enriquecer con cálculo de distancia, tarifa de envío y tiempo estimado en Yopal
    const enriched = merchants.map(m => {
      let distanceKm = 1.8; // Default aproximado en casco urbano
      if (userLat != null && userLng != null) {
        distanceKm = calculateDistanceKm(userLat, userLng, m.lat, m.lng);
      }
      const deliveryFee = calculateDeliveryFare(distanceKm, m.zone_name);
      const estimatedTime = estimateDeliveryTimeMinutes(m.prep_time_avg, distanceKm);

      return {
        ...m,
        distanceKm,
        deliveryFee,
        estimatedTime
      };
    });

    res.json({ merchants: enriched });
  } catch (err) {
    console.error('Error obteniendo comercios:', err);
    res.status(500).json({ error: 'Error al consultar comercios' });
  }
});

// Detalle de un comercio por ID o slug con sus productos y categorías
router.get('/:idOrSlug', (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const { lat, lng } = req.query;

    const merchant = db.prepare(`
      SELECT * FROM merchants
      WHERE id = ? OR slug = ?
    `).get(idOrSlug, idOrSlug);

    if (!merchant) {
      return res.status(404).json({ error: 'Comercio no encontrado' });
    }

    const products = db.prepare(`
      SELECT id, name, description, price, image_url, is_available, options_json
      FROM products
      WHERE merchant_id = ?
      ORDER BY is_available DESC, created_at ASC
    `).all(merchant.id);

    const parsedProducts = products.map(p => ({
      ...p,
      options: JSON.parse(p.options_json || '[]')
    }));

    let distanceKm = 1.8;
    if (lat && lng) {
      distanceKm = calculateDistanceKm(parseFloat(lat), parseFloat(lng), merchant.lat, merchant.lng);
    }
    const deliveryFee = calculateDeliveryFare(distanceKm, merchant.zone_name);
    const estimatedTime = estimateDeliveryTimeMinutes(merchant.prep_time_avg, distanceKm);

    res.json({
      merchant: {
        ...merchant,
        distanceKm,
        deliveryFee,
        estimatedTime
      },
      products: parsedProducts
    });
  } catch (err) {
    console.error('Error obteniendo detalle de comercio:', err);
    res.status(500).json({ error: 'Error en consulta de comercio' });
  }
});

// Toggle abrir / cerrar comercio
router.patch('/:id/toggle-open', (req, res) => {
  try {
    const { id } = req.params;
    const merchant = db.prepare('SELECT is_open FROM merchants WHERE id = ?').get(id);
    if (!merchant) return res.status(404).json({ error: 'Comercio no encontrado' });

    const newStatus = merchant.is_open ? 0 : 1;
    db.prepare('UPDATE merchants SET is_open = ? WHERE id = ?').run(newStatus, id);

    res.json({ success: true, is_open: newStatus });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar estado del comercio' });
  }
});

module.exports = router;
