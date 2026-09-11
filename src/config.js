const path = require('path');
require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'yopal_express_secret_key_casanare_2026',
  DB_FILE: path.join(__dirname, '..', 'yopal_delivery.sqlite'),
  
  // Coordenadas de Referencia de Yopal, Casanare
  YOPAL_CENTER: {
    lat: 5.3377,
    lng: -72.3958,
    name: 'Parque Santander / Centro de Yopal'
  },
  
  // Parámetros de Tarifas por Defecto (en Pesos Colombianos COP)
  PRICING: {
    BASE_FARE_URBAN: 4000,      // $4.000 COP hasta 2 km
    BASE_DISTANCE_KM: 2.0,
    PER_KM_EXTRA_FARE: 1200,    // $1.200 COP por km adicional
    SERVICE_FEE: 1000,          // $1.000 COP tarifa de plataforma/tecnología
    DEFAULT_COMMISSION: 12.0,   // 12% comisión de aliados
    DRIVER_PAYOUT_SHARE: 0.85   // 85% de la tarifa de envío va directo al repartidor
  }
};
