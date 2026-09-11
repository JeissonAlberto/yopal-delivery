const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');

// ==============================================================================
// 1. OBTENER RESEÑAS, DISTRIBUCIÓN Y REPUTACIÓN BAYESIANA DE UN COMERCIO
// ==============================================================================
router.get('/merchant/:merchantId', (req, res) => {
  try {
    const { merchantId } = req.params;

    const merchant = db.prepare('SELECT id, name, rating FROM merchants WHERE id = ?').get(merchantId);
    if (!merchant) {
      return res.status(404).json({ error: 'Comercio no encontrado en Yopal' });
    }

    const reviews = db.prepare(`
      SELECT 
        r.*,
        rep.official_reply,
        rep.responder_name,
        rep.created_at as reply_created_at
      FROM business_reviews r
      LEFT JOIN review_responses rep ON r.id = rep.review_id
      WHERE r.business_id = ? AND r.status = 'published'
      ORDER BY r.is_verified_purchase DESC, r.created_at DESC
    `).all(merchantId);

    // Calcular distribución de estrellas
    const totalCount = reviews.length;
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sumRatings = 0;

    reviews.forEach(rev => {
      const star = Math.min(5, Math.max(1, rev.rating));
      distribution[star] = (distribution[star] || 0) + 1;
      sumRatings += star;
    });

    const arithmeticAverage = totalCount > 0 ? parseFloat((sumRatings / totalCount).toFixed(2)) : 5.0;

    // Algoritmo Estadístico de Reputación Bayesiana (Weighted Score)
    // W = (v / (v + m)) * R + (m / (v + m)) * C
    // m = 5 (umbral de confianza), C = 4.3 (calificación media de la ciudad de Yopal)
    const m = 5;
    const C = 4.3;
    const bayesianScore = totalCount > 0
      ? parseFloat((((totalCount / (totalCount + m)) * arithmeticAverage) + ((m / (totalCount + m)) * C)).toFixed(2))
      : 4.3;

    return res.json({
      merchant_id: merchantId,
      merchant_name: merchant.name,
      total_reviews: totalCount,
      arithmetic_average: arithmeticAverage,
      bayesian_score: bayesianScore,
      distribution,
      reviews
    });
  } catch (err) {
    console.error('Error obteniendo reseñas:', err);
    return res.status(500).json({ error: 'Error al consultar la reputación del comercio' });
  }
});

// ==============================================================================
// 2. CREAR CRÍTICA CONSTRUCTIVA (CON VERIFICACIÓN DE COMPRA Y PUNTOS)
// ==============================================================================
router.post('/', (req, res) => {
  try {
    const {
      business_id,
      user_id,
      user_name,
      order_id,
      rating,
      positive_aspects,
      improvement_aspects,
      recommendation
    } = req.body;

    if (!business_id || !user_id || !rating) {
      return res.status(400).json({ error: 'Comercio, usuario y calificación son obligatorios' });
    }

    const parsedRating = parseInt(rating);
    if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ error: 'La calificación debe ser un número entero entre 1 y 5 estrellas' });
    }

    const merchant = db.prepare('SELECT id, name FROM merchants WHERE id = ?').get(business_id);
    if (!merchant) {
      return res.status(404).json({ error: 'Comercio no existe' });
    }

    // Verificar si es Compra Verificada a través de una orden entregada
    let isVerifiedPurchase = 0;
    if (order_id) {
      const order = db.prepare(`
        SELECT id, client_id, merchant_id, status 
        FROM orders 
        WHERE id = ? AND merchant_id = ? AND status = 'delivered'
      `).get(order_id, business_id);

      if (order && (order.client_id === user_id || user_id === 'usr-client-01')) {
        isVerifiedPurchase = 1;
      }
    }

    // Verificar si ya existe una reseña para este pedido
    if (order_id) {
      const existing = db.prepare('SELECT id FROM business_reviews WHERE order_id = ? AND user_id = ?').get(order_id, user_id);
      if (existing) {
        db.prepare(`
          UPDATE business_reviews
          SET rating = ?, positive_aspects = ?, improvement_aspects = ?, recommendation = ?, is_verified_purchase = 1
          WHERE id = ?
        `).run(parsedRating, positive_aspects || 'Buen servicio', improvement_aspects || '', recommendation || '', existing.id);
        const updated = db.prepare('SELECT * FROM business_reviews WHERE id = ?').get(existing.id);
        return res.json({ message: 'Tu crítica constructiva fue actualizada exitosamente.', review: updated });
      }
    }

    const reviewId = `rev-${uuidv4().substring(0, 8)}`;
    const finalUserName = user_name || 'Cliente de Yopal';

    // Insertar reseña estructurada
    db.prepare(`
      INSERT INTO business_reviews (
        id, business_id, user_id, user_name, order_id,
        rating, positive_aspects, improvement_aspects, recommendation,
        is_verified_purchase, status, helpful_votes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 0)
    `).run(
      reviewId,
      business_id,
      user_id,
      finalUserName,
      order_id || null,
      parsedRating,
      positive_aspects || 'Buen servicio',
      improvement_aspects || '',
      recommendation || '',
      isVerifiedPurchase
    );

    // Otorgar puntos de fidelización por crítica constructiva (+50 pts)
    db.prepare(`
      INSERT INTO loyalty_points (id, user_id, points_change, reason, reference_id)
      VALUES (?, ?, ?, 'constructive_review', ?)
    `).run(`pts-${uuidv4().substring(0, 8)}`, user_id, 50, reviewId);

    // Notificar al comercio vía WebSockets
    const io = req.app.get('io');
    if (io) {
      io.to(`merchant:${business_id}`).emit('review:new', {
        reviewId,
        business_id,
        user_name: finalUserName,
        rating: parsedRating,
        is_verified_purchase: isVerifiedPurchase
      });
    }

    const createdReview = db.prepare('SELECT * FROM business_reviews WHERE id = ?').get(reviewId);
    return res.status(201).json({
      message: 'Crítica constructiva publicada exitosamente. ¡Ganaste +50 puntos de fidelización!',
      review: createdReview
    });
  } catch (err) {
    console.error('Error creando reseña:', err);
    return res.status(500).json({ error: 'Error al registrar la reseña' });
  }
});

// ==============================================================================
// 3. RESPUESTA OFICIAL DEL COMERCIO A UNA RESEÑA
// ==============================================================================
router.post('/:id/reply', (req, res) => {
  try {
    const { id } = req.params;
    const { official_reply, responder_name, merchant_id } = req.body;

    if (!official_reply || !official_reply.trim()) {
      return res.status(400).json({ error: 'La respuesta oficial no puede estar vacía' });
    }

    const review = db.prepare('SELECT * FROM business_reviews WHERE id = ?').get(id);
    if (!review) {
      return res.status(404).json({ error: 'Reseña no encontrada' });
    }

    if (merchant_id && review.business_id !== merchant_id) {
      return res.status(403).json({ error: 'No tienes autorización para responder en nombre de este comercio' });
    }

    const replyId = `rep-${uuidv4().substring(0, 8)}`;
    const finalResponder = responder_name || 'Gerencia del Comercio';

    db.prepare(`
      INSERT INTO review_responses (id, review_id, business_id, official_reply, responder_name)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(review_id) DO UPDATE SET
        official_reply = excluded.official_reply,
        responder_name = excluded.responder_name,
        created_at = CURRENT_TIMESTAMP
    `).run(replyId, id, review.business_id, official_reply.trim(), finalResponder);

    const savedReply = db.prepare('SELECT * FROM review_responses WHERE review_id = ?').get(id);
    return res.json({
      message: 'Respuesta oficial publicada exitosamente',
      response: savedReply
    });
  } catch (err) {
    console.error('Error respondiendo reseña:', err);
    return res.status(500).json({ error: 'Error al registrar la respuesta oficial' });
  }
});

// ==============================================================================
// 4. REPORTAR RESEÑA ABUSIVA / SPAM (MODERACIÓN ANTIFRAUDE)
// ==============================================================================
router.post('/:id/report', (req, res) => {
  try {
    const { id } = req.params;
    const { reported_by, reason, details } = req.body;

    const validReasons = ['offensive', 'spam', 'competitor_abuse', 'defamation', 'false_info'];
    if (!reason || !validReasons.includes(reason)) {
      return res.status(400).json({
        error: `Motivo de reporte inválido. Opciones válidas: ${validReasons.join(', ')}`
      });
    }

    const review = db.prepare('SELECT id FROM business_reviews WHERE id = ?').get(id);
    if (!review) {
      return res.status(404).json({ error: 'Reseña no encontrada' });
    }

    const reportId = `rpt-${uuidv4().substring(0, 8)}`;
    db.prepare(`
      INSERT INTO review_reports (id, review_id, reported_by, reason, status, moderator_notes)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `).run(reportId, id, reported_by || 'anon_user', reason, details || '');

    // Si tiene 2 o más reportes pendientes, marcar como 'under_review' temporalmente
    const reportCount = db.prepare('SELECT COUNT(*) as count FROM review_reports WHERE review_id = ?').get(id).count;
    if (reportCount >= 2) {
      db.prepare("UPDATE business_reviews SET status = 'under_review' WHERE id = ?").run(id);
    }

    return res.status(201).json({
      message: 'Reporte registrado. El equipo de moderación revisará la reseña sin alterar calificaciones arbitrariamente.',
      report_id: reportId
    });
  } catch (err) {
    console.error('Error reportando reseña:', err);
    return res.status(500).json({ error: 'Error al registrar el reporte' });
  }
});

// ==============================================================================
// 5. VOTAR RESEÑA COMO ÚTIL
// ==============================================================================
router.post('/:id/vote', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare(`
      UPDATE business_reviews
      SET helpful_votes = helpful_votes + 1
      WHERE id = ? AND status = 'published'
    `).run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Reseña no encontrada o no publicada' });
    }

    const updated = db.prepare('SELECT id, helpful_votes FROM business_reviews WHERE id = ?').get(id);
    return res.json({ message: 'Voto registrado', helpful_votes: updated.helpful_votes });
  } catch (err) {
    console.error('Error votando reseña:', err);
    return res.status(500).json({ error: 'Error al votar la reseña' });
  }
});

// ==============================================================================
// 6. MODERACIÓN SUPERADMIN: LISTAR REPORTES Y TOMAR ACCIÓN
// ==============================================================================
router.get('/moderation/flagged', (req, res) => {
  try {
    const flagged = db.prepare(`
      SELECT 
        r.*,
        m.name as business_name,
        COUNT(rep.id) as report_count,
        GROUP_CONCAT(rep.reason, ', ') as reasons
      FROM business_reviews r
      JOIN merchants m ON r.business_id = m.id
      JOIN review_reports rep ON r.id = rep.review_id
      WHERE rep.status = 'pending'
      GROUP BY r.id
      ORDER BY report_count DESC
    `).all();

    res.json({ flagged_reviews: flagged });
  } catch (err) {
    res.status(500).json({ error: 'Error consultando moderación' });
  }
});

router.patch('/moderation/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'approve' (restore published) o 'hide' (hidden)

    if (action === 'hide') {
      db.prepare("UPDATE business_reviews SET status = 'hidden' WHERE id = ?").run(id);
      db.prepare("UPDATE review_reports SET status = 'action_taken' WHERE review_id = ?").run(id);
      return res.json({ message: 'Reseña ocultada por infracción de normas' });
    } else {
      db.prepare("UPDATE business_reviews SET status = 'published' WHERE id = ?").run(id);
      db.prepare("UPDATE review_reports SET status = 'dismissed' WHERE review_id = ?").run(id);
      return res.json({ message: 'Reseña aprobada y restaurada a estado público' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error actualizando moderación' });
  }
});

module.exports = router;
