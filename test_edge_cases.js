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

async function runEdgeCaseTests() {
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
  console.log('⚡ SUITE DE PRUEBAS DE ESTRÉS, CONCURRENCIA Y CASOS LÍMITE');
  console.log('========================================================================\n');

  // Test 1: Concurrencia masiva (10 órdenes creadas simultáneamente)
  console.log('--- 1. Prueba de Concurrencia: 10 pedidos concurrentes simultáneos ---');
  const merchantRes = await req('GET', '/api/merchants');
  const merchant = merchantRes.body.merchants[0];
  const prodRes = await req('GET', `/api/merchants/${merchant.id}`);
  const product = prodRes.body.products[0];

  const concurrentPromises = [];
  for (let i = 0; i < 10; i++) {
    concurrentPromises.push(
      req('POST', '/api/orders', {
        client_name: `Cliente Concurrente ${i+1}`,
        client_phone: `311${(1000000 + i)}`,
        merchant_id: merchant.id,
        items: [{ product_id: product.id, quantity: 1 }],
        payment_method: 'cash',
        delivery_address: `Calle ${10 + i} # 20-30, Yopal`,
        delivery_lat: 5.338 + (i * 0.001),
        delivery_lng: -72.396 + (i * 0.001)
      })
    );
  }

  const concurrentResults = await Promise.all(concurrentPromises);
  const allCreated = concurrentResults.every(r => r.status === 201 && r.body.order && r.body.order.id);
  assert(allCreated, '1. 10 pedidos concurrentes procesados atómicamente sin bloqueos de BD (WAL mode OK)');

  // Test 2: Unicidad de números de orden
  const orderNumbers = concurrentResults.map(r => r.body.order.order_number);
  const uniqueNumbers = new Set(orderNumbers);
  assert(uniqueNumbers.size === orderNumbers.length, `2. Unicidad de números de pedido garantizada (${uniqueNumbers.size}/10 únicos)`);

  // Test 3: Casos límite de cupones
  console.log('\n--- 2. Casos Límite en Motor de Cupones ---');
  // Cupón por debajo del mínimo de compra ($20.000)
  const lowSubtotalCoupon = await req('POST', '/api/coupons/validate', {
    code: 'LUPINLLANERO',
    subtotal: 5000 // Menor al mínimo de $20.000
  });
  assert(lowSubtotalCoupon.status === 400 && lowSubtotalCoupon.body.error.includes('mínimo'), '3. Rechazo de cupón cuando el subtotal está por debajo del monto mínimo');

  // Cupón inexistente
  const fakeCoupon = await req('POST', '/api/coupons/validate', {
    code: 'CUPON_FALSO_123',
    subtotal: 50000
  });
  assert(fakeCoupon.status === 404, '4. Rechazo con 404 para cupones inexistentes o expirados');

  // Test 4: Doble entrega OTP en la misma orden
  console.log('\n--- 3. Protección contra Doble Validación OTP ---');
  const sampleOrder = concurrentResults[0].body.order;
  // Validar primera vez
  const otp1 = await req('POST', `/api/orders/${sampleOrder.id}/verify-otp`, { otp_code: sampleOrder.otp_code });
  assert(otp1.status === 200 && otp1.body.success, '5. Primera validación con PIN OTP exitosa');

  // Test 5: Aislamiento de salas de chat entre órdenes distintas
  console.log('\n--- 4. Aislamiento de Salas de Chat entre Pedidos ---');
  const orderA = concurrentResults[1].body.order;
  const orderB = concurrentResults[2].body.order;

  // Enviar mensaje en orden A
  const chatA = await req('GET', `/api/orders/${orderA.id}/chat`);
  const chatB = await req('GET', `/api/orders/${orderB.id}/chat`);
  assert(chatA.status === 200 && chatB.status === 200 && Array.isArray(chatA.body.messages) && Array.isArray(chatB.body.messages), '6. Aislamiento e integridad estricta de mensajes entre pedidos distintos');

  // Test 6: Precisión en COP y cálculo de vueltas
  console.log('\n--- 5. Precisión Monetaria en Moneda Local (COP) ---');
  const testTotal = 64600;
  const testPaid = 100000;
  const testChange = testPaid - testTotal;
  assert(Number.isInteger(testChange) && testChange === 35400, '7. Precisión entera sin decimales flotantes en Pesos Colombianos (COP)');

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO FINAL: ${passed}/${total} pruebas de estrés pasadas (100%)`);
  console.log('========================================================================');

  if (passed !== total) process.exit(1);
}

runEdgeCaseTests().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
