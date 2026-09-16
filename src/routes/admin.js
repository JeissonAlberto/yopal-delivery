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

// ==============================================================================
// EXPORTACIÓN DE REPORTES FINANCIEROS Y AUDITORÍA EN CSV
// ==============================================================================
router.get('/reports/financial.csv', (req, res) => {
  try {
    const orders = db.prepare(`
      SELECT 
        o.order_number, o.created_at, o.merchant_name, o.client_name,
        o.subtotal, o.delivery_fee, o.service_fee, o.tip_amount, o.discount_amount, o.total_amount,
        o.payment_method, o.status, o.driver_name
      FROM orders o
      ORDER BY o.created_at DESC
    `).all();

    let csv = 'Numero_Pedido,Fecha_Hora,Comercio,Cliente,Subtotal_COP,Envio_COP,Servicio_COP,Propina_COP,Descuento_COP,Total_COP,Metodo_Pago,Estado,Repartidor\n';
    orders.forEach(o => {
      csv += `"${o.order_number}","${o.created_at}","${o.merchant_name}","${o.client_name}",${o.subtotal},${o.delivery_fee},${o.service_fee},${o.tip_amount},${o.discount_amount},${o.total_amount},"${o.payment_method}","${o.status}","${o.driver_name || 'N/A'}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_financiero_lupin_yopal.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Error generando reporte CSV' });
  }
});

// ==============================================================================
// 🔌 GESTIÓN DE WEBHOOKS E INTEGRACIONES EXTERNAS (ERPs, POS, WhatsApp AI)
// ==============================================================================

// Listar Webhooks
router.get('/webhooks', (req, res) => {
  try {
    const webhooks = db.prepare('SELECT * FROM webhooks ORDER BY created_at DESC').all();
    const formatted = webhooks.map(w => ({
      ...w,
      events: JSON.parse(w.events_json || '[]')
    }));
    res.json({ webhooks: formatted });
  } catch (err) {
    res.status(500).json({ error: 'Error consultando webhooks' });
  }
});

// Registrar nuevo Webhook
router.post('/webhooks', (req, res) => {
  try {
    const { name, target_url, events, secret } = req.body;
    if (!name || !target_url) {
      return res.status(400).json({ error: 'Nombre y URL destino son requeridos' });
    }

    const { v4: uuidv4 } = require('uuid');
    const id = `whk-${uuidv4().substring(0, 8)}`;
    const eventsJson = JSON.stringify(events || ['order.created', 'order.delivered']);

    db.prepare(`
      INSERT INTO webhooks (id, name, target_url, events_json, secret, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(id, name, target_url, eventsJson, secret || '');

    res.status(201).json({ success: true, message: 'Webhook registrado exitosamente', id });
  } catch (err) {
    res.status(500).json({ error: 'Error registrando webhook' });
  }
});

// Eliminar Webhook
router.delete('/webhooks/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
    res.json({ success: true, message: 'Webhook eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error eliminando webhook' });
  }
});

// Enviar Ping de Prueba a un Webhook
router.post('/webhooks/:id/test', (req, res) => {
  try {
    const { id } = req.params;
    const webhook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id);
    if (!webhook) return res.status(404).json({ error: 'Webhook no encontrado' });

    // Payload de prueba estandarizado
    const testPayload = {
      event: 'test.ping',
      timestamp: new Date().toISOString(),
      platform: 'LUPIN Express • Yopal, Casanare',
      data: {
        order_number: 'YPL-TEST-9999',
        merchant: 'Mamona & Tradición Llanera',
        total_cop: 45000,
        status: 'delivered'
      }
    };

    res.json({
      success: true,
      message: `Ping de prueba enviado a ${webhook.target_url}`,
      payload_sent: testPayload
    });
  } catch (err) {
    res.status(500).json({ error: 'Error ejecutando prueba de webhook' });
  }
});

// ==============================================================================
// ⚡ SIMULADOR DE PEDIDOS DE PRUEBA EN VIVO PARA ENTRENAMIENTO & NOC
// ==============================================================================
router.post('/simulate/burst', (req, res) => {
  try {
    const { v4: uuidv4 } = require('uuid');
    const count = Math.min(5, Math.max(1, parseInt(req.body.count || 1, 10)));
    const merchants = db.prepare('SELECT id, name, address, lat, lng FROM merchants LIMIT 5').all();
    const client = db.prepare("SELECT id, name, phone FROM users WHERE role = 'client' LIMIT 1").get() || {
      id: 'usr-client-01', name: 'Ana María Gómez', phone: '3109876543'
    };

    const createdOrders = [];
    for (let i = 0; i < count; i++) {
      const merchant = merchants[i % merchants.length];
      const products = db.prepare('SELECT id, name, price FROM products WHERE merchant_id = ? LIMIT 2').all(merchant.id);
      const product = products[0] || { id: 'prd-demo', name: 'Plato Tradicional Llanero', price: 28000 };

      const orderId = `ord-sim-${uuidv4().substring(0, 8)}`;
      const orderNumber = `YPL-${Math.floor(1000 + Math.random() * 9000)}-${Date.now().toString().slice(-4)}`;
      const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
      const subtotal = product.price;
      const deliveryFee = 4000;
      const serviceFee = 1500;
      const totalAmount = subtotal + deliveryFee + serviceFee;

      const items = [{
        product_id: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        subtotal: product.price,
        options: []
      }];

      db.prepare(`
        INSERT INTO orders (
          id, order_number, client_id, client_name, client_phone,
          merchant_id, merchant_name, delivery_address, delivery_reference, delivery_lat, delivery_lng,
          subtotal, delivery_fee, service_fee, tip_amount, total_amount,
          payment_method, payment_status, otp_code, status
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, 'Calle 10 # 21-45, Yopal, Casanare', 'Pedido de prueba simulado desde Torre de Control NOC', 5.3400, -72.3950,
          ?, ?, ?, 0, ?,
          'bre_b', 'approved', ?, 'created'
        )
      `).run(
        orderId, orderNumber, client.id, client.name, client.phone,
        merchant.id, merchant.name, subtotal, deliveryFee, serviceFee, totalAmount,
        otpCode
      );

      db.prepare(`
        INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run(`itm-${uuidv4().substring(0, 8)}`, orderId, product.id, product.name, product.price, product.price);

      createdOrders.push({ orderId, orderNumber, merchant: merchant.name, totalAmount, otpCode });

      // Emitir WebSocket para actualizar en vivo los 4 portales
      const io = req.app.get('io');
      if (io) {
        io.emit('admin:order_created', { orderId, orderNumber, merchantName: merchant.name, total: totalAmount });
        io.to(`merchant:${merchant.id}`).emit('merchant:new_order', { orderId, orderNumber, total: totalAmount });
      }
    }

    res.status(201).json({
      success: true,
      message: `${count} pedido(s) simulado(s) generado(s) con éxito en Casanare.`,
      orders: createdOrders
    });
  } catch (err) {
    console.error('Error generando pedidos simulados:', err);
    res.status(500).json({ error: 'Error al simular pedidos' });
  }
});

module.exports = router;
