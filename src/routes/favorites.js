const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');

// ==============================================================================
// 1. LISTAR FAVORITOS DEL USUARIO
// ==============================================================================
router.get('/', (req, res) => {
  try {
    const userId = req.query.user_id || 'usr-client-01';

    const favs = db.prepare(`
      SELECT 
        m.*,
        f.created_at as favorited_at
      FROM favorites f
      JOIN merchants m ON f.merchant_id = m.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `).all(userId);

    res.json({ favorites: favs });
  } catch (err) {
    console.error('Error listando favoritos:', err);
    res.status(500).json({ error: 'Error al consultar favoritos' });
  }
});

// ==============================================================================
// 2. AGREGAR A FAVORITOS
// ==============================================================================
router.post('/', (req, res) => {
  try {
    const { user_id, merchant_id } = req.body;
    const finalUserId = user_id || 'usr-client-01';

    if (!merchant_id) {
      return res.status(400).json({ error: 'merchant_id es requerido' });
    }

    const merchant = db.prepare('SELECT id, name FROM merchants WHERE id = ?').get(merchant_id);
    if (!merchant) {
      return res.status(404).json({ error: 'Comercio no encontrado' });
    }

    const favId = `fav-${uuidv4().substring(0, 8)}`;
    db.prepare(`
      INSERT OR IGNORE INTO favorites (id, user_id, merchant_id)
      VALUES (?, ?, ?)
    `).run(favId, finalUserId, merchant_id);

    res.status(201).json({ message: 'Comercio guardado en favoritos', is_favorite: true });
  } catch (err) {
    console.error('Error guardando favorito:', err);
    res.status(500).json({ error: 'Error al guardar en favoritos' });
  }
});

// ==============================================================================
// 3. ELIMINAR DE FAVORITOS
// ==============================================================================
router.delete('/:merchantId', (req, res) => {
  try {
    const { merchantId } = req.params;
    const userId = req.query.user_id || req.body.user_id || 'usr-client-01';

    db.prepare('DELETE FROM favorites WHERE user_id = ? AND merchant_id = ?').run(userId, merchantId);
    res.json({ message: 'Comercio eliminado de favoritos', is_favorite: false });
  } catch (err) {
    console.error('Error eliminando favorito:', err);
    res.status(500).json({ error: 'Error al eliminar de favoritos' });
  }
});

// ==============================================================================
// 4. VERIFICAR SI UN COMERCIO ES FAVORITO
// ==============================================================================
router.get('/check/:merchantId', (req, res) => {
  try {
    const { merchantId } = req.params;
    const userId = req.query.user_id || 'usr-client-01';

    const exists = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND merchant_id = ?').get(userId, merchantId);
    res.json({ is_favorite: !!exists });
  } catch (err) {
    res.status(500).json({ error: 'Error verificando favorito' });
  }
});

module.exports = router;
