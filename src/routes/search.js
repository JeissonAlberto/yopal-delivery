const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { calculateDistanceKm, detectYopalZone, calculateDeliveryFare } = require('../services/geo');

// ==============================================================================
// BUSCADOR UNIVERSAL MULTICRITERIO PARA YOPAL, CASANARE
// ==============================================================================
router.get('/', (req, res) => {
  try {
    const {
      q,               // Búsqueda por texto (nombre, plato, servicio, descripción)
      category,        // Categoría específica
      lat,             // Latitud del usuario
      lng,             // Longitud del usuario
      max_distance,    // Radio máximo en km (ej: 5)
      min_rating,      // Calificación mínima (ej: 4.5)
      is_open,         // 1 = Abierto ahora
      is_featured,     // 1 = Destacado
      sort_by          // 'reputation', 'distance', 'rating', 'delivery_fee'
    } = req.query;

    const userLat = parseFloat(lat) || 5.3480;
    const userLng = parseFloat(lng) || -72.4010;

    let query = `
      SELECT 
        m.*,
        haversine_km(?, ?, m.lat, m.lng) as distance_km,
        (
          SELECT COUNT(*) 
          FROM business_reviews r 
          WHERE r.business_id = m.id AND r.status = 'published'
        ) as total_reviews,
        (
          SELECT COALESCE(AVG(r.rating), m.rating) 
          FROM business_reviews r 
          WHERE r.business_id = m.id AND r.status = 'published'
        ) as avg_rating
      FROM merchants m
      WHERE 1=1
    `;

    const params = [userLat, userLng];

    // 1. Filtro por texto de búsqueda
    if (q && q.trim()) {
      const searchTerm = `%${q.trim().toLowerCase()}%`;
      query += `
        AND (
          LOWER(m.name) LIKE ? 
          OR LOWER(m.description) LIKE ? 
          OR LOWER(m.category) LIKE ?
          OR EXISTS (
            SELECT 1 FROM products p 
            WHERE p.merchant_id = m.id 
            AND (LOWER(p.name) LIKE ? OR LOWER(p.description) LIKE ?)
          )
        )
      `;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // 2. Filtro por categoría
    if (category && category !== 'Todos') {
      query += ' AND m.category = ?';
      params.push(category);
    }

    // 3. Filtro de Abierto Ahora
    if (is_open === '1' || is_open === 'true') {
      query += ' AND m.is_open = 1';
    }

    // 4. Filtro de Destacados
    if (is_featured === '1' || is_featured === 'true') {
      query += ' AND m.is_featured = 1';
    }

    const merchants = db.prepare(query).all(...params);

    // Calcular Reputación Bayesiana y Tarifas de Despacho
    const m = 5;
    const C = 4.3;

    let results = merchants.map(merchant => {
      const v = merchant.total_reviews || 0;
      const R = merchant.avg_rating || merchant.rating || 5.0;
      const bayesianScore = v > 0
        ? parseFloat((((v / (v + m)) * R) + ((m / (v + m)) * C)).toFixed(2))
        : parseFloat(R.toFixed(2));

      const dist = Math.round((merchant.distance_km || 1.0) * 100) / 100;
      const zone = detectYopalZone(merchant.lat, merchant.lng);
      const deliveryFee = calculateDeliveryFare(dist, zone);

      return {
        ...merchant,
        distance_km: dist,
        delivery_fee: deliveryFee,
        bayesian_score: bayesianScore,
        estimated_time: merchant.prep_time_avg ? merchant.prep_time_avg + Math.round(dist * 3) : 25
      };
    });

    // 5. Filtros en memoria: Radio de distancia y Calificación mínima
    if (max_distance) {
      const maxDist = parseFloat(max_distance);
      if (!isNaN(maxDist) && maxDist > 0) {
        results = results.filter(item => item.distance_km <= maxDist);
      }
    }

    if (min_rating) {
      const minRate = parseFloat(min_rating);
      if (!isNaN(minRate) && minRate > 0) {
        results = results.filter(item => item.bayesian_score >= minRate);
      }
    }

    // 6. Ordenamiento
    if (sort_by === 'distance') {
      results.sort((a, b) => a.distance_km - b.distance_km);
    } else if (sort_by === 'delivery_fee') {
      results.sort((a, b) => a.delivery_fee - b.delivery_fee);
    } else if (sort_by === 'rating') {
      results.sort((a, b) => b.rating - a.rating);
    } else {
      // Por defecto: Reputación Bayesiana (Mayor confianza y compras verificadas primero)
      results.sort((a, b) => b.bayesian_score - a.bayesian_score);
    }

    return res.json({
      total_found: results.length,
      user_coordinates: { lat: userLat, lng: userLng },
      merchants: results
    });
  } catch (err) {
    console.error('Error en buscador universal:', err);
    return res.status(500).json({ error: 'Error al procesar la búsqueda en Yopal' });
  }
});

// Obtener todas las categorías únicas disponibles en Yopal
router.get('/categories', (req, res) => {
  try {
    const categories = db.prepare('SELECT DISTINCT category, COUNT(*) as count FROM merchants GROUP BY category ORDER BY count DESC').all();
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar categorías' });
  }
});

module.exports = router;
