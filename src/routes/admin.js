const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

// Métricas de Rendimiento en Vivo para Yopal Express
router.get('/metrics', (req, res) => {
  try {
    const todayOrders = db.prepare(`
      SELECT COUNT(*) as total_orders,
             COALESCE(SUM(total_amount), 0) as gmv,
             COALESCE(SUM(delivery_fee), 0) as total_delivery_fees,
             COALESCE(SUM(service_fee), 0) as total_platform_cut
      FROM orders
      WHERE date(created_at) = date('now')
    `).get();

    const activeOrders = db.prepare(`
      SELECT COUNT(*) as count
      FROM orders
      WHERE status NOT IN ('delivered', 'cancelled')
    `).get().count;

    const onlineDrivers = db.prepare(`
      SELECT COUNT(*) as count
      FROM drivers
      WHERE is_online = 1
    `).get().count;

    const busyDrivers = db.prepare(`
      SELECT COUNT(*) as count
      FROM drivers
      WHERE is_online = 1 AND is_busy = 1
    `).get().count;

    const totalMerchants = db.prepare(`
      SELECT COUNT(*) as count
      FROM merchants
      WHERE is_open = 1
    `).get().count;

    const todayErrands = db.prepare(`
      SELECT COUNT(*) as count
      FROM errands
      WHERE date(created_at) = date('now')
    `).get().count;

    const merchantPayout = Math.round(todayOrders.gmv * 0.88); // 88% para los restaurantes aliados

    res.json({
      metrics: {
        todayOrders: todayOrders.total_orders,
        todayGmv: todayOrders.gmv,
        todayDeliveryFees: todayOrders.total_delivery_fees,
        todayPlatformProfit: todayOrders.total_platform_cut + Math.round(todayOrders.gmv * 0.12),
        todayMerchantPayout: merchantPayout,
        todayErrands,
        activeOrders,
        onlineDrivers,
        busyDrivers,
        availableDrivers: onlineDrivers - busyDrivers,
        openMerchants: totalMerchants
      }
    });
  } catch (err) {
    console.error('Error calculando métricas:', err);
    res.status(500).json({ error: 'Error al consultar métricas' });
  }
});

// Asignación manual de pedido desde la Torre de Control
router.post('/dispatch-manual', (req, res) => {
  try {
    const { order_id, driver_id } = req.body;
    if (!order_id || !driver_id) {
      return res.status(400).json({ error: 'order_id y driver_id son requeridos' });
    }

    const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driver_id);
    if (!driver) return res.status(404).json({ error: 'Repartidor no encontrado' });

    db.prepare(`
      UPDATE orders
      SET driver_id = ?, driver_name = ?, driver_phone = ?, status = 'driver_assigned'
      WHERE id = ?
    `).run(driver.id, driver.name, driver.phone, order_id);

    db.prepare(`
      UPDATE drivers
      SET is_busy = 1, current_order_id = ?
      WHERE id = ?
    `).run(order_id, driver.id);

    const io = req.app.get('io');
    if (io) {
      io.to(`order:${order_id}`).emit('order:status_update', { orderId: order_id, status: 'driver_assigned', driver });
      io.to(`driver:${driver.id}`).emit('order:assigned', { orderId: order_id });
      io.emit('admin:order_updated', { orderId: order_id, status: 'driver_assigned', driverId: driver.id });
    }

    res.json({ success: true, message: `Pedido asignado a ${driver.name}` });
  } catch (err) {
    res.status(500).json({ error: 'Error en despacho manual' });
  }
});

module.exports = router;
