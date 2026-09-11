const { db } = require('../db/database');
const { calculateDistanceKm } = require('./geo');

/**
 * Motor de Detección de Agrupación de Pedidos (Order Batching)
 * Revisa si existen pedidos pendientes que puedan unirse en una sola ruta de reparto
 */
function findBatchableOrders(merchantLat, merchantLng, deliveryLat, deliveryLng, excludeOrderId = null) {
  const pendingOrders = db.prepare(`
    SELECT o.id, o.order_number, o.merchant_name, m.lat as m_lat, m.lng as m_lng,
           o.delivery_lat as d_lat, o.delivery_lng as d_lng, o.delivery_address, o.delivery_fee
    FROM orders o
    JOIN merchants m ON o.merchant_id = m.id
    WHERE o.status IN ('confirmed', 'preparing', 'ready_for_pickup')
      AND (o.driver_id IS NULL OR o.id = ?)
  `).all(excludeOrderId || 'none');

  const batchOpportunities = [];

  for (const other of pendingOrders) {
    if (other.id === excludeOrderId) continue;

    // Distancia entre comercios de recogida (máximo 800m en Yopal)
    const pickupDist = calculateDistanceKm(merchantLat, merchantLng, other.m_lat, other.m_lng);
    // Distancia entre puntos de entrega (máximo 1.2km en Yopal)
    const dropoffDist = calculateDistanceKm(deliveryLat, deliveryLng, other.d_lat, other.d_lng);

    if (pickupDist <= 0.8 && dropoffDist <= 1.2) {
      batchOpportunities.push({
        primaryOrderId: excludeOrderId,
        secondaryOrderId: other.id,
        secondaryOrderNumber: other.order_number,
        combinedSavingsPct: 30, // Ahorro logístico
        pickupDistanceMeters: Math.round(pickupDist * 1000),
        dropoffDistanceMeters: Math.round(dropoffDist * 1000),
        bonusDriverEarnings: Math.round(other.delivery_fee * 0.75)
      });
    }
  }

  return batchOpportunities;
}

/**
 * Calculador de Tarifa Dinámica / Surge Pricing
 * Incrementa ligeramente la tarifa en picos de demanda (almuerzo llanero o lluvia)
 */
function getSurgeMultiplier() {
  const currentHour = new Date().getHours();
  // Horas pico en Yopal: 11:30 AM - 2:00 PM y 6:30 PM - 9:00 PM
  const isLunchPeak = currentHour >= 11 && currentHour <= 14;
  const isDinnerPeak = currentHour >= 18 && currentHour <= 21;

  if (isLunchPeak || isDinnerPeak) {
    return {
      multiplier: 1.15, // +15% de incentivo en hora pico
      reason: 'Alta demanda en hora de almuerzo/cena llanera'
    };
  }

  return { multiplier: 1.0, reason: 'Tarifa estándar' };
}

module.exports = {
  findBatchableOrders,
  getSurgeMultiplier
};
