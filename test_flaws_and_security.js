const http = require('http');

const BASE_URL = 'http://localhost:3000';

function req(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { 'Content-Type': 'application/json', ...headers };
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: reqHeaders
    };
    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function runSecurityAndFuzzTests() {
  let passed = 0;
  let total = 0;

  function assert(condition, name) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name}`);
    }
  }

  console.log('========================================================================');
  console.log('🛡️ SUITE DE SEGURIDAD, FUZZING Y VALIDACIÓN DE ENTRADAS');
  console.log('========================================================================\n');

  const mRes = await req('GET', '/api/merchants');
  const merchant = mRes.body.merchants[0];
  const prodRes = await req('GET', `/api/merchants/${merchant.id}`);
  const product = prodRes.body.products[0];

  // Test 1: Intento de pago en efectivo menor al total (Falla de negocio)
  console.log('--- 1. Validación de Efectivo Insuficiente ---');
  const underpaidOrder = await req('POST', '/api/orders', {
    client_name: 'Comprador Tramposo',
    client_phone: '3110001122',
    merchant_id: merchant.id,
    items: [{ product_id: product.id, quantity: 2 }],
    payment_method: 'cash',
    cash_amount_to_pay_with: 10000, // Total es > $60.000 COP
    delivery_address: 'Calle 10 # 20-30',
    delivery_lat: 5.338,
    delivery_lng: -72.396
  });
  assert(underpaidOrder.status === 400 && underpaidOrder.body.error, '1. Rechazo de orden cuando el monto en efectivo es menor al total a pagar');

  // Test 2: Inyección de cantidad negativa de productos
  console.log('\n--- 2. Fuzzing de Cantidades Negativas o Inválidas ---');
  const negativeQtyOrder = await req('POST', '/api/orders', {
    client_name: 'Hacker Qty',
    client_phone: '3110001122',
    merchant_id: merchant.id,
    items: [{ product_id: product.id, quantity: -5 }],
    delivery_address: 'Calle 10 # 20-30',
    delivery_lat: 5.338,
    delivery_lng: -72.396
  });
  assert(negativeQtyOrder.status === 400, '2. Rechazo de cantidad negativa o cero en ítems de pedido (400)');

  // Test 3: Propina negativa
  console.log('\n--- 3. Validación de Propinas Negativas ---');
  const negativeTipOrder = await req('POST', '/api/orders', {
    client_name: 'Hacker Tip',
    client_phone: '3110001122',
    merchant_id: merchant.id,
    items: [{ product_id: product.id, quantity: 1 }],
    tip_amount: -50000,
    delivery_address: 'Calle 10 # 20-30',
    delivery_lat: 5.338,
    delivery_lng: -72.396
  });
  assert(negativeTipOrder.status === 400 || (negativeTipOrder.status === 201 && negativeTipOrder.body.order.tip_amount >= 0), '3. Sanitización de propina negativa (monto >= 0 garantizado)');

  // Test 4: Coordenadas NaN o corruptas en Pedidos
  console.log('\n--- 4. Coordenadas GPS Inválidas / NaN ---');
  const nanCoordOrder = await req('POST', '/api/orders', {
    client_name: 'Hacker GPS',
    client_phone: '3110001122',
    merchant_id: merchant.id,
    items: [{ product_id: product.id, quantity: 1 }],
    delivery_address: 'Calle 10 # 20-30',
    delivery_lat: 'invalid_lat',
    delivery_lng: 'invalid_lng'
  });
  assert(nanCoordOrder.status === 400, '4. Rechazo de coordenadas NaN o corruptas en creación de pedido (400)');

  // Test 5: Coordenadas NaN en telemetría de conductor
  const driverTele = await req('POST', '/api/drivers/drv-01/location', {
    lat: 'lat_corrupta',
    lng: 'lng_corrupta'
  });
  assert(driverTele.status === 400, '5. Rechazo de telemetría de repartidor con coordenadas no numéricas (400)');

  // Test 6: Fuzzing en Validación de Cupones con subtotal negativo
  console.log('\n--- 5. Casos Límite en Cupones ---');
  const negativeSubtotalCoupon = await req('POST', '/api/coupons/validate', {
    code: 'LUPINLLANERO',
    subtotal: -20000
  });
  assert(negativeSubtotalCoupon.status === 400, '6. Rechazo de cupón con subtotal negativo (400)');

  // Test 7: Mandado con coordenadas no numéricas
  console.log('\n--- 6. Fuzzing en Módulo de Mandados ---');
  const corruptErrand = await req('POST', '/api/errands', {
    title: 'Mandado con GPS roto',
    description: 'Test',
    pickup_address: 'Unicentro',
    pickup_lat: 'NaN',
    pickup_lng: -72.4045,
    dropoff_address: 'Llano Lindo',
    dropoff_lat: 5.3140,
    dropoff_lng: -72.3995
  });
  assert(corruptErrand.status === 400, '7. Rechazo de mandado con coordenadas no numéricas (400)');

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO FUZZING & SEGURIDAD: ${passed}/${total} pruebas pasadas (${Math.round((passed/total)*100)}%)`);
  console.log('========================================================================');

  if (passed !== total) process.exit(1);
}

runSecurityAndFuzzTests().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
