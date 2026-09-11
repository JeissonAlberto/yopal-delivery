const config = require('../config');

/**
 * Calcula la distancia en kilómetros entre dos coordenadas en Yopal usando la fórmula Haversine
 */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * Calcula la tarifa de envío para Yopal basada en la distancia y zona
 */
function calculateDeliveryFare(distanceKm, zoneName = 'Zona Centro') {
  const baseFare = config.PRICING.BASE_FARE_URBAN;
  const baseDist = config.PRICING.BASE_DISTANCE_KM;
  const perKmFare = config.PRICING.PER_KM_EXTRA_FARE;

  let fee = baseFare;
  if (distanceKm > baseDist) {
    const extraKm = distanceKm - baseDist;
    fee += Math.ceil(extraKm) * perKmFare;
  }

  // Recargos especiales por zonas periféricas en Yopal
  if (zoneName && (zoneName.includes('Aeropuerto') || zoneName.includes('El Morro') || zoneName.includes('Sirivana'))) {
    fee = Math.max(fee, 7000);
  } else if (zoneName && (zoneName.includes('Llano Lindo') || zoneName.includes('Sur'))) {
    fee = Math.max(fee, 5000);
  }

  // Redondear a múltiplos de 500 COP
  return Math.ceil(fee / 500) * 500;
}

/**
 * Estima el tiempo total de entrega (en minutos)
 * Tiempo de preparación + Tiempo de traslado en moto en Yopal (velocidad promedio 25 km/h)
 */
function estimateDeliveryTimeMinutes(prepTimeAvg = 20, distanceKm = 2.0) {
  const travelTimeMinutes = Math.ceil((distanceKm / 25) * 60) + 5; // +5 mins tiempo de entrega
  return (prepTimeAvg || 20) + travelTimeMinutes;
}

/**
 * Detecta la zona de Yopal según la coordenada
 */
function detectYopalZone(lat, lng) {
  if (lat > 5.345) {
    return 'Zona Norte / La Campiña / Unicentro';
  } else if (lat < 5.325) {
    return 'Zona Sur / Llano Lindo / Los Progresos';
  } else if (lng > -72.385) {
    return 'Zona Aeropuerto / Vereda El Morro / Sirivana';
  } else {
    return 'Zona Centro / Parque Santander';
  }
}

module.exports = {
  calculateDistanceKm,
  calculateDeliveryFare,
  estimateDeliveryTimeMinutes,
  detectYopalZone
};
