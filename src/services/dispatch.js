const { db } = require('../db/database');
const { calculateDistanceKm } = require('./geo');

/**
 * Encuentra repartidores disponibles y activos ordenados por cercanía al comercio en Yopal
 */
function findNearestAvailableDrivers(merchantLat, merchantLng, maxDistanceKm = 8.0) {
  // Consultar repartidores online y no ocupados
  const drivers = db.prepare(`
    SELECT id, user_id, name, phone, vehicle_type, plate_number, lat, lng,
           haversine_km(lat, lng, ?, ?) as distance_km,
           balance_cash_collected, balance_earnings, rating
    FROM drivers
    WHERE is_online = 1 AND is_busy = 0 AND lat IS NOT NULL AND lng IS NOT NULL
    ORDER BY distance_km ASC
  `).all(merchantLat, merchantLng);

  return drivers.filter(d => d.distance_km <= maxDistanceKm);
}

/**
 * Algoritmo de Asignación Automática de Pedido
 */
function autoDispatchOrder(orderId, io) {
  const order = db.prepare(`
    SELECT o.*, m.lat as merchant_lat, m.lng as merchant_lng, m.name as merchant_name, m.address as merchant_address
    FROM orders o
    JOIN merchants m ON o.merchant_id = m.id
    WHERE o.id = ?
  `).get(orderId);

  if (!order) return { success: false, message: 'Pedido no encontrado' };

  if (order.driver_id) {
    return { success: true, message: 'El pedido ya tiene repartidor asignado', driver_id: order.driver_id };
  }

  // Buscar el repartidor más cercano al comercio
  const availableDrivers = findNearestAvailableDrivers(order.merchant_lat, order.merchant_lng);

  if (availableDrivers.length === 0) {
    console.log(`⚠️ No hay repartidores libres cerca para la orden ${order.order_number}`);
    return { success: false, message: 'No hay repartidores disponibles en este momento en Yopal' };
  }

  const selectedDriver = availableDrivers[0];

  // Asignar al repartidor
  db.prepare(`
    UPDATE orders
    SET driver_id = ?, driver_name = ?, driver_phone = ?, status = 'driver_assigned'
    WHERE id = ?
  `).run(selectedDriver.id, selectedDriver.name, selectedDriver.phone, orderId);

  db.prepare(`
    UPDATE drivers
    SET is_busy = 1, current_order_id = ?
    WHERE id = ?
  `).run(orderId, selectedDriver.id);

  console.log(`🛵 Pedido ${order.order_number} asignado exitosamente al repartidor ${selectedDriver.name} (${selectedDriver.distance_km} km)`);

  // Notificar por WebSocket
  if (io) {
    // Al repartidor
    io.to(`driver:${selectedDriver.id}`).emit('order:assigned', {
      orderId: order.id,
      orderNumber: order.order_number,
      merchantName: order.merchant_name,
      merchantAddress: order.merchant_address,
      merchantLat: order.merchant_lat,
      merchantLng: order.merchant_lng,
      deliveryAddress: order.delivery_address,
      deliveryLat: order.delivery_lat,
      deliveryLng: order.delivery_lng,
      deliveryFee: order.delivery_fee,
      paymentMethod: order.payment_method,
      cashChangeDue: order.cash_change_due,
      totalAmount: order.total_amount
    });

    // Al cliente
    io.to(`order:${orderId}`).emit('order:status_update', {
      orderId: order.id,
      status: 'driver_assigned',
      driver: {
        id: selectedDriver.id,
        name: selectedDriver.name,
        phone: selectedDriver.phone,
        vehicleType: selectedDriver.vehicle_type,
        plateNumber: selectedDriver.plate_number,
        rating: selectedDriver.rating,
        lat: selectedDriver.lat,
        lng: selectedDriver.lng
      }
    });

    // A la torre de control Super Admin
    io.emit('admin:order_updated', { orderId: order.id, status: 'driver_assigned', driverId: selectedDriver.id });
  }

  return { success: true, driver: selectedDriver };
}

module.exports = {
  findNearestAvailableDrivers,
  autoDispatchOrder
};
