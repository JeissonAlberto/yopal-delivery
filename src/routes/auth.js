const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const config = require('../config');

// Registro de usuario
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, role = 'client', vehicle_type, plate_number } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Todos los campos básicos son obligatorios' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = phone.trim();

    const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? OR phone = ?').get(cleanEmail, cleanPhone);
    if (existingUser) {
      return res.status(400).json({ error: 'El correo electrónico o número de teléfono ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `usr-${uuidv4().substring(0, 8)}`;

    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, name.trim(), cleanEmail, cleanPhone, passwordHash, role);

    // Si es repartidor, registrar en tabla drivers
    if (role === 'driver') {
      const driverId = `drv-${uuidv4().substring(0, 8)}`;
      db.prepare(`
        INSERT INTO drivers (id, user_id, name, phone, vehicle_type, plate_number, lat, lng, is_online)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(driverId, userId, name.trim(), cleanPhone, vehicle_type || 'moto', plate_number || '', config.YOPAL_CENTER.lat, config.YOPAL_CENTER.lng);
    }

    const token = jwt.sign({ id: userId, email: cleanEmail, role, name: name.trim() }, config.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user: { id: userId, name: name.trim(), email: cleanEmail, phone: cleanPhone, role }
    });
  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Inicio de Sesión
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Correo y contraseña requeridos' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(cleanEmail);
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    let extraData = {};
    if (user.role === 'driver') {
      const driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(user.id);
      extraData.driver = driver;
    } else if (user.role === 'merchant_admin') {
      const merchant = db.prepare('SELECT * FROM merchants WHERE user_id = ?').get(user.id);
      extraData.merchant = merchant;
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      config.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Inicio de sesión exitoso',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar_url: user.avatar_url,
        ...extraData
      }
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Perfil actual
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const user = db.prepare('SELECT id, name, email, phone, role, avatar_url FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    let extraData = {};
    if (user.role === 'driver') {
      extraData.driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(user.id);
    } else if (user.role === 'merchant_admin') {
      extraData.merchant = db.prepare('SELECT * FROM merchants WHERE user_id = ?').get(user.id);
    }

    res.json({ user: { ...user, ...extraData } });
  } catch (e) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
});

module.exports = router;
