const { db } = require('../db/database');

// Throttle map para evitar saturación de I/O en ráfagas de GPS
const lastDriverDbUpdate = new Map();

function setupSocketIO(io) {
  io.on('connection', (socket) => {
    // Unirse a salas de seguimiento
    socket.on('join:order', (orderId) => {
      socket.join(`order:${orderId}`);
    });

    socket.on('join:merchant', (merchantId) => {
      socket.join(`merchant:${merchantId}`);
    });

    socket.on('join:driver', (driverId) => {
      socket.join(`driver:${driverId}`);
    });

    socket.on('join:admin', () => {
      socket.join('admin_channel');
    });

    // Actualización de ubicación GPS del Repartidor en tiempo real (Throttled DB write)
    socket.on('driver:update_location', (data) => {
      const { driverId, orderId, lat, lng, heading, speed } = data;
      if (!driverId || lat == null || lng == null) return;

      const pLat = parseFloat(lat);
      const pLng = parseFloat(lng);
      if (isNaN(pLat) || isNaN(pLng)) return;

      try {
        const now = Date.now();
        const lastUpdate = lastDriverDbUpdate.get(driverId) || 0;

        // Persistir en DB cada 1.5 segundos por repartidor para alto rendimiento
        if (now - lastUpdate > 1500) {
          lastDriverDbUpdate.set(driverId, now);
          db.prepare(`
            UPDATE drivers
            SET lat = ?, lng = ?, heading = ?, speed = ?, last_ping_at = datetime('now')
            WHERE id = ?
          `).run(pLat, pLng, heading || 0, speed || 0, driverId);

          db.prepare(`
            INSERT INTO driver_telemetry_history (driver_id, order_id, lat, lng, heading, speed_kmh)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(driverId, orderId || null, pLat, pLng, heading || 0, speed || 0);
        }

        // Retransmisión en tiempo real en memoria por WebSockets a 60fps (sin latencia)
        if (orderId) {
          io.to(`order:${orderId}`).emit('driver:location_changed', {
            driverId,
            lat: pLat,
            lng: pLng,
            heading: heading || 0,
            speed: speed || 0
          });
        }

        io.to('admin_channel').emit('admin:driver_moved', {
          driverId,
          lat: pLat,
          lng: pLng,
          heading: heading || 0,
          speed: speed || 0
        });
      } catch (err) {
        console.error('Error procesando telemetría de repartidor:', err);
      }
    });

    // Envío de mensajes de chat en vivo del pedido
    socket.on('chat:send_message', (data) => {
      const { orderId, senderId, senderRole, message } = data;
      if (!orderId || !message) return;

      try {
        const msgId = `msg-${Date.now()}`;
        db.prepare(`
          INSERT INTO order_chat_messages (id, order_id, sender_id, sender_role, message)
          VALUES (?, ?, ?, ?, ?)
        `).run(msgId, orderId, senderId || 'anon', senderRole || 'client', message);

        const newMsg = {
          id: msgId,
          orderId,
          senderId,
          senderRole,
          message,
          createdAt: new Date().toISOString()
        };

        // Emitir a la sala del pedido
        io.to(`order:${orderId}`).emit('chat:new_message', newMsg);
      } catch (err) {
        console.error('Error guardando mensaje de chat:', err);
      }
    });

    socket.on('disconnect', () => {
      // console.log(`🔌 Cliente desconectado: ${socket.id}`);
    });
  });
}

module.exports = {
  setupSocketIO
};
