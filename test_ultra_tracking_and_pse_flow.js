const http = require('http');
const { calculateDistanceKm } = require('./src/services/geo');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function runUltraTrackingAndPseSuite() {
  console.log('========================================================================');
  console.log('🛰️ SUITE DE SEGUIMIENTO ULTRA-MAPA, TELEMETRÍA 60FPS Y PASARELA PSE');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${total}. ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${total}. ${message}`);
    }
  }

  // 1. Creación de Pedido con Pasarela PSE y Banco Colombiano
  const resPseOrder = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/orders',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    client_id: 'usr-client-01',
    client_name: 'Ana María Gómez',
    client_phone: '3157890123',
    merchant_id: 'mch-01',
    items: [{ product_id: 'prd-mch-01-1', quantity: 1 }],
    payment_method: 'wompi_pse',
    delivery_address: 'Calle 24 # 25-18, Barrio La Campiña, Yopal',
    delivery_lat: 5.3480,
    delivery_lng: -72.4010
  });

  assert(
    resPseOrder.status === 201 &&
    resPseOrder.body.order &&
    resPseOrder.body.order.payment_method === 'wompi_pse',
    'Creación de pedido con pasarela bancaria PSE (Wompi Digital)'
  );

  const orderId = resPseOrder.body.order.id;

  // 2. Consulta de Tracking de Pedido en Vivo
  const resTrack = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/orders/${orderId}`,
    method: 'GET'
  });

  assert(
    resTrack.status === 200 &&
    resTrack.body.order &&
    (resTrack.body.order.otp_code || resTrack.body.order.delivery_otp),
    'Consulta de orden con PIN OTP de 4 dígitos para seguimiento satelital'
  );

  // 3. Verificación de Cálculo de Proximidad (< 250 metros)
  const driverLat = 5.3482; // A ~30 metros de La Campiña
  const driverLng = -72.4011;
  const dist = calculateDistanceKm(driverLat, driverLng, 5.3480, -72.4010);

  assert(
    dist <= 0.25,
    `Detección de radio de proximidad inmediata para alerta sonora de llegada (${Math.round(dist * 1000)}m <= 250m)`
  );

  // 4. Integración de Pasarela Llave Bre-B del Banco de la República
  const resBrebGen = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/payments/generate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    order_id: orderId,
    user_id: 'usr-client-01',
    payment_method: 'bre_b',
    amount_cop: 45000,
    bre_b_key_type: 'phone',
    bre_b_key_value: '3123456781'
  });

  assert(
    resBrebGen.status === 201 &&
    resBrebGen.body.reference_code &&
    resBrebGen.body.reference_code.startsWith('BREB-'),
    'Generación de comprobante digital e intención con Llave Bre-B ($0 comisión)'
  );

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO SUITE ULTRA-TRACKING & PSE: ${passed}/${total} pruebas pasadas (${Math.round(passed/total*100)}%)`);
  console.log('========================================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runUltraTrackingAndPseSuite().catch(err => {
  console.error('Error en suite:', err);
  process.exit(1);
});
