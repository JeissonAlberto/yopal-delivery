const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const { calculateDistanceKm, calculateDeliveryFare, detectYopalZone } = require('../services/geo');
const { autoDispatchOrder } = require('../services/dispatch');

// Crear un nuevo pedido
router.post('/', (req, res) => {
  try {
    const {
      client_id,
      client_name,
      client_phone,
      merchant_id,
      items,
      payment_method = 'cash',
      cash_amount_to_pay_with,
      delivery_address,
      delivery_reference,
      delivery_lat,
      delivery_lng,
      tip_amount = 0,
      discount_amount = 0
    } = req.body;

    if (!merchant_id || !items || !Array.isArray(items) || items.length === 0 || !delivery_address) {
      return res.status(400).json({ error: 'Datos incompletos para procesar el pedido' });
    }

    const parsedLat = parseFloat(delivery_lat);
    const parsedLng = parseFloat(delivery_lng);
    if (isNaN(parsedLat) || isNaN(parsedLng) || parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
      return res.status(400).json({ error: 'Coordenadas GPS de entrega inválidas o fuera de rango' });
    }

    const merchant = db.prepare('SELECT * FROM merchants WHERE id = ?').get(merchant_id);
    if (!merchant) {
      return res.status(404).json({ error: 'Comercio no encontrado' });
    }

    // Calcular subtotal con verificación de precios en DB
    let subtotal = 0;
    const verifiedItems = [];

    for (const it of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND merchant_id = ?').get(it.product_id, merchant_id);
      if (!product) {
        return res.status(400).json({ error: `Producto ${it.product_id} no válido para este comercio` });
      }
      const qty = parseInt(it.quantity);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: `La cantidad para el producto "${product.name}" debe ser un número mayor a 0` });
      }
      const unitPrice = product.price;
      const itemTotal = unitPrice * qty;
      subtotal += itemTotal;

      verifiedItems.push({
        id: `it-${uuidv4().substring(0, 8)}`,
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        unit_price: unitPrice,
        total_price: itemTotal,
        selected_options: it.selected_options || []
      });
    }

    // Calcular tarifa de envío en Yopal
    const distanceKm = calculateDistanceKm(merchant.lat, merchant.lng, parsedLat, parsedLng);
    const deliveryZone = detectYopalZone(parsedLat, parsedLng);
    const rawDeliveryFee = calculateDeliveryFare(distanceKm, deliveryZone);
    const serviceFee = 1000;
    const finalDiscount = Math.max(0, parseFloat(discount_amount) || 0);
    const finalTip = Math.max(0, parseFloat(tip_amount) || 0);

    // Verificar beneficio de Domicilio Gratis por Membresía VIP
    const finalClientId = client_id && client_id !== 'guest' ? client_id : 'usr-client-01';
    let appliedDeliveryFee = rawDeliveryFee;
    let deliverySubsidyApplied = 0;
    let activeSubId = null;

    const activeSub = db.prepare(`
      SELECT s.id, s.free_deliveries_quota, s.free_deliveries_used, p.max_delivery_subsidy_cop, p.min_order_for_free_delivery
      FROM user_subscriptions s
      JOIN subscription_plans p ON s.plan_id = p.id
      WHERE s.user_id = ? AND s.status = 'active' AND datetime(s.current_period_end) > datetime('now')
      LIMIT 1
    `).get(finalClientId);

    if (activeSub && (activeSub.free_deliveries_quota - activeSub.free_deliveries_used) > 0) {
      if (subtotal >= (activeSub.min_order_for_free_delivery || 25000)) {
        deliverySubsidyApplied = Math.min(rawDeliveryFee, activeSub.max_delivery_subsidy_cop || 6000);
        appliedDeliveryFee = Math.max(0, rawDeliveryFee - deliverySubsidyApplied);
        activeSubId = activeSub.id;
      }
    }

    const totalAmount = Math.max(0, subtotal - finalDiscount) + appliedDeliveryFee + serviceFee + finalTip;

    // Validación de efectivo suficiente
    let changeDue = 0;
    let cashPaidFinal = totalAmount;
    if (payment_method === 'cash' && cash_amount_to_pay_with != null) {
      const cashPaid = parseFloat(cash_amount_to_pay_with);
      if (isNaN(cashPaid) || cashPaid < totalAmount) {
        return res.status(400).json({
          error: `El monto para pagar en efectivo ($${(cashPaid || 0).toLocaleString('es-CO')}) no puede ser menor al total del pedido ($${totalAmount.toLocaleString('es-CO')})`
        });
      }
      cashPaidFinal = cashPaid;
      changeDue = cashPaid - totalAmount;
    }

    // Generar código OTP seguro de 4 dígitos para entrega
    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const orderId = `ord-${uuidv4().substring(0, 8)}`;
    const orderNumber = `YPL-${Math.floor(1000 + Math.random() * 9000)}-${Date.now().toString().slice(-4)}`;

    // Transacción atómica
    const createOrderTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO orders (
          id, order_number, client_id, client_name, client_phone,
          merchant_id, merchant_name, status,
          subtotal, delivery_fee, service_fee, tip_amount, discount_amount, total_amount,
          payment_method, payment_status, cash_amount_to_pay_with, cash_change_due,
          delivery_address, delivery_reference, delivery_lat, delivery_lng, delivery_zone,
          otp_code
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, 'created',
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?
        )
      `).run(
        orderId, orderNumber, finalClientId, client_name || 'Cliente Yopal', client_phone || '3000000000',
        merchant.id, merchant.name,
        subtotal, appliedDeliveryFee, serviceFee, finalTip, finalDiscount, totalAmount,
        payment_method, payment_method === 'cash' ? 'pending' : 'approved',
        cashPaidFinal, changeDue,
        delivery_address, delivery_reference || '', parsedLat, parsedLng, deliveryZone,
        otpCode
      );

      const insertItem = db.prepare(`
        INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price, selected_options_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of verifiedItems) {
        insertItem.run(
          item.id, orderId, item.product_id, item.product_name, item.quantity,
          item.unit_price, item.total_price, JSON.stringify(item.selected_options)
        );
      }

      // Descontar cupo de domicilio gratis si aplicó membresía VIP
      if (activeSubId && deliverySubsidyApplied > 0) {
        db.prepare(`
          UPDATE user_subscriptions
          SET free_deliveries_used = free_deliveries_used + 1
          WHERE id = ?
        `).run(activeSubId);
      }

      // Registrar puntos por compra (+10 pts por cada $10.000 COP)
      const pointsEarned = Math.max(5, Math.floor(totalAmount / 10000) * 10);
      db.prepare(`
        INSERT INTO loyalty_points (id, user_id, points_change, reason, reference_id)
        VALUES (?, ?, ?, 'order_completed', ?)
      `).run(`pts-${uuidv4().substring(0, 8)}`, finalClientId, pointsEarned, orderId);
    });

    createOrderTx();

    const createdOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    createdOrder.items = verifiedItems;
    createdOrder.merchant = merchant;

    // Notificar por WebSocket al comercio en tiempo real
    const io = req.app.get('io');
    if (io) {
      io.to(`merchant:${merchant.id}`).emit('order:new', {
        order: createdOrder,
        sound: 'alert_new_order'
      });
      io.emit('admin:order_created', { order: createdOrder });
    }

    res.status(201).json({
      message: 'Pedido creado exitosamente',
      order: createdOrder
    });
  } catch (err) {
    console.error('Error creando pedido:', err);
    res.status(500).json({ error: 'Error al procesar el pedido' });
  }
});

// Consultar pedidos con filtros por rol o usuario
router.get('/', (req, res) => {
  try {
    const { client_id, merchant_id, driver_id, status } = req.query;

    let query = `
      SELECT o.*, m.logo_url as merchant_logo, m.address as merchant_address, m.lat as merchant_lat, m.lng as merchant_lng
      FROM orders o
      JOIN merchants m ON o.merchant_id = m.id
      WHERE 1=1
    `;
    const params = [];

    if (client_id) {
      query += ` AND o.client_id = ?`;
      params.push(client_id);
    }
    if (merchant_id) {
      query += ` AND o.merchant_id = ?`;
      params.push(merchant_id);
    }
    if (driver_id) {
      query += ` AND o.driver_id = ?`;
      params.push(driver_id);
    }
    if (status) {
      query += ` AND o.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY o.created_at DESC LIMIT 50`;

    const orders = db.prepare(query).all(...params);

    const enrichedOrders = orders.map(o => {
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
      return {
        ...o,
        items: items.map(i => ({ ...i, options: JSON.parse(i.selected_options_json || '[]') }))
      };
    });

    res.json({ orders: enrichedOrders });
  } catch (err) {
    console.error('Error listando pedidos:', err);
    res.status(500).json({ error: 'Error al consultar pedidos' });
  }
});

// Detalle de un pedido específico
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const order = db.prepare(`
      SELECT o.*, m.name as merchant_name, m.address as merchant_address, m.logo_url as merchant_logo,
             m.lat as merchant_lat, m.lng as merchant_lng, m.phone as merchant_phone,
             d.name as driver_name, d.phone as driver_phone, d.vehicle_type as driver_vehicle,
             d.plate_number as driver_plate, d.lat as driver_lat, d.lng as driver_lng, d.rating as driver_rating
      FROM orders o
      JOIN merchants m ON o.merchant_id = m.id
      LEFT JOIN drivers d ON o.driver_id = d.id
      WHERE o.id = ? OR o.order_number = ?
    `).get(id, id);

    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    const chat = db.prepare('SELECT * FROM order_chat_messages WHERE order_id = ? ORDER BY created_at ASC').all(order.id);

    res.json({
      order: {
        ...order,
        items: items.map(i => ({ ...i, options: JSON.parse(i.selected_options_json || '[]') })),
        chat
      }
    });
  } catch (err) {
    console.error('Error consultando pedido:', err);
    res.status(500).json({ error: 'Error al consultar pedido' });
  }
});

// Actualizar estado del pedido (Flujo de vida del pedido)
router.patch('/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status, cancel_reason } = req.body;

    const validStatuses = ['created', 'confirmed', 'preparing', 'ready_for_pickup', 'driver_assigned', 'driver_at_merchant', 'on_the_way', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Estado no válido' });
    }

    let timestampCol = null;
    if (status === 'confirmed') timestampCol = 'confirmed_at';
    if (status === 'preparing') timestampCol = 'prepared_at';
    if (status === 'on_the_way') timestampCol = 'picked_up_at';
    if (status === 'delivered') timestampCol = 'delivered_at';
    if (status === 'cancelled') timestampCol = 'cancelled_at';

    let updateQuery = `UPDATE orders SET status = ?`;
    const params = [status];

    if (timestampCol) {
      updateQuery += `, ${timestampCol} = CURRENT_TIMESTAMP`;
    }
    if (cancel_reason) {
      updateQuery += `, cancel_reason = ?`;
      params.push(cancel_reason);
    }

    updateQuery += ` WHERE id = ?`;
    params.push(id);

    db.prepare(updateQuery).run(...params);

    const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);

    // Si el estado pasa a 'ready_for_pickup' o 'confirmed', disparar auto-despacho si no tiene repartidor
    const io = req.app.get('io');
    if ((status === 'confirmed' || status === 'ready_for_pickup') && !updatedOrder.driver_id) {
      autoDispatchOrder(id, io);
    }

    // Si se entrega o cancela, liberar al repartidor y asentar saldos en billetera
    if ((status === 'delivered' || status === 'cancelled') && updatedOrder.driver_id) {
      db.prepare('UPDATE drivers SET is_busy = 0, current_order_id = NULL WHERE id = ?').run(updatedOrder.driver_id);

      if (status === 'delivered') {
        const driverEarning = Math.round(updatedOrder.delivery_fee * 0.85); // 85% de la tarifa de envío para el domiciliario
        db.prepare(`
          UPDATE drivers
          SET balance_earnings = balance_earnings + ?,
              balance_cash_collected = balance_cash_collected + ?,
              total_deliveries = total_deliveries + 1
          WHERE id = ?
        `).run(
          driverEarning,
          updatedOrder.payment_method === 'cash' ? updatedOrder.total_amount : 0,
          updatedOrder.driver_id
        );

        // Registrar en libro de transacciones de billetera
        db.prepare(`
          INSERT INTO driver_wallet_ledger (id, driver_id, order_id, transaction_type, amount, description)
          VALUES (?, ?, ?, 'order_earning', ?, 'Ganancia por entrega de pedido ' || ?)
        `).run(`tx-${uuidv4().substring(0, 8)}`, updatedOrder.driver_id, id, driverEarning, updatedOrder.order_number);
      }
    }

    if (io) {
      io.to(`order:${id}`).emit('order:status_update', { orderId: id, status });
      io.to(`merchant:${updatedOrder.merchant_id}`).emit('order:status_update', { orderId: id, status });
      if (updatedOrder.driver_id) {
        io.to(`driver:${updatedOrder.driver_id}`).emit('order:status_update', { orderId: id, status });
      }
      io.emit('admin:order_updated', { orderId: id, status });
    }

    res.json({ message: 'Estado actualizado exitosamente', order: updatedOrder });
  } catch (err) {
    console.error('Error actualizando estado de pedido:', err);
    res.status(500).json({ error: 'Error al actualizar estado del pedido' });
  }
});

// Verificar código OTP de entrega segura (Dictado por el cliente al repartidor)
router.post('/:id/verify-otp', (req, res) => {
  try {
    const { id } = req.params;
    const { otp_code } = req.body;

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    if (order.otp_code !== otp_code.trim()) {
      return res.status(400).json({ error: 'Código PIN / OTP incorrecto. Solicítalo al cliente.' });
    }

    // Actualizar estado a delivered
    db.prepare(`
      UPDATE orders
      SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP, payment_status = 'approved'
      WHERE id = ?
    `).run(id);

    // Liberar repartidor y registrar ganancias
    if (order.driver_id) {
      const driverEarning = Math.round(order.delivery_fee * 0.85);
      db.prepare(`
        UPDATE drivers
        SET is_busy = 0, current_order_id = NULL,
            balance_earnings = balance_earnings + ?,
            balance_cash_collected = balance_cash_collected + ?,
            total_deliveries = total_deliveries + 1
        WHERE id = ?
      `).run(
        driverEarning,
        order.payment_method === 'cash' ? order.total_amount : 0,
        order.driver_id
      );

      db.prepare(`
        INSERT INTO driver_wallet_ledger (id, driver_id, order_id, transaction_type, amount, description)
        VALUES (?, ?, ?, 'order_earning', ?, 'Ganancia por entrega confirmada OTP orden ' || ?)
      `).run(`tx-${uuidv4().substring(0, 8)}`, order.driver_id, id, driverEarning, order.order_number);
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`order:${id}`).emit('order:status_update', { orderId: id, status: 'delivered' });
      io.emit('admin:order_updated', { orderId: id, status: 'delivered' });
    }

    res.json({ success: true, message: '¡Entrega confirmada exitosamente mediante código OTP!' });
  } catch (err) {
    console.error('Error verificando OTP:', err);
    res.status(500).json({ error: 'Error al verificar OTP' });
  }
});

// Chat del pedido
router.get('/:id/chat', (req, res) => {
  try {
    const { id } = req.params;
    const messages = db.prepare('SELECT * FROM order_chat_messages WHERE order_id = ? ORDER BY created_at ASC').all(id);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: 'Error consultando chat' });
  }
});

module.exports = router;
