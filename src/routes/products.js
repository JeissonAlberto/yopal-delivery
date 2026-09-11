const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

// Crear producto
router.post('/', (req, res) => {
  try {
    const { merchant_id, name, description, price, image_url, options } = req.body;
    if (!merchant_id || !name || !price) {
      return res.status(400).json({ error: 'Comercio, nombre y precio son requeridos' });
    }

    const id = `prd-${uuidv4().substring(0, 8)}`;
    db.prepare(`
      INSERT INTO products (id, merchant_id, name, description, price, image_url, is_available, options_json)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(id, merchant_id, name, description || '', price, image_url || '', JSON.stringify(options || []));

    res.status(201).json({ message: 'Producto creado exitosamente', id });
  } catch (err) {
    console.error('Error creando producto:', err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// Actualizar producto
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, image_url, is_available, options } = req.body;

    db.prepare(`
      UPDATE products
      SET name = coalesce(?, name),
          description = coalesce(?, description),
          price = coalesce(?, price),
          image_url = coalesce(?, image_url),
          is_available = coalesce(?, is_available),
          options_json = coalesce(?, options_json),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name,
      description,
      price,
      image_url,
      is_available,
      options ? JSON.stringify(options) : null,
      id
    );

    res.json({ message: 'Producto actualizado exitosamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error actualizando producto' });
  }
});

// Toggle disponibilidad rápida (Agotado / Disponible)
router.patch('/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;
    const product = db.prepare('SELECT is_available FROM products WHERE id = ?').get(id);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

    const newStatus = product.is_available ? 0 : 1;
    db.prepare('UPDATE products SET is_available = ? WHERE id = ?').run(newStatus, id);

    res.json({ success: true, is_available: newStatus });
  } catch (err) {
    res.status(500).json({ error: 'Error cambiando disponibilidad' });
  }
});

module.exports = router;
