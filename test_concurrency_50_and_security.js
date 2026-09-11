const http = require('http');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const latencyMs = Date.now() - start;
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed, headers: res.headers, latencyMs });
        } catch (e) {
          resolve({ status: res.statusCode, body, headers: res.headers, latencyMs });
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

async function runConcurrencyAndSecuritySuite() {
  console.log('========================================================================');
  console.log('🔥 SUITE DE ESTRÉS EXTREMO (50 PEDIDOS CONCURRENTES) Y SEGURIDAD HTTP');
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

  // 1. Verificación de Cabeceras HTTP de Seguridad
  const resHeaders = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/health',
    method: 'GET'
  });

  assert(
    resHeaders.headers['x-content-type-options'] === 'nosniff' &&
    resHeaders.headers['x-frame-options'] === 'SAMEORIGIN' &&
    resHeaders.headers['x-xss-protection'] === '1; mode=block',
    'Cabeceras HTTP de seguridad (nosniff, SAMEORIGIN, XSS-Protection) activas'
  );

  // 2. Prueba de Estrés Extremo: 50 Pedidos Concurrentes Simultáneos
  console.log('  ⚡ Disparando 50 transacciones concurrentes en ráfaga a SQLite WAL...');
  const orderPromises = Array(50).fill(0).map((_, i) => {
    return makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      client_name: `Usuario Estrés #${i + 1}`,
      client_phone: '3157890123',
      merchant_id: 'mch-01',
      items: [{ product_id: 'prd-mch-01-1', quantity: 1 }],
      payment_method: 'cash',
      cash_amount_to_pay_with: 80000,
      delivery_address: `Calle ${10 + (i % 20)} # ${20 + (i % 10)}-${i}, Yopal`,
      delivery_lat: 5.3385 + (i * 0.0001),
      delivery_lng: -72.3960 + (i * 0.0001)
    });
  });

  const orderResults = await Promise.all(orderPromises);
  const successOrders = orderResults.filter(r => r.status === 201 && r.body.order);
  const orderNumbers = successOrders.map(r => r.body.order.order_number);
  const uniqueOrderNumbers = new Set(orderNumbers);

  assert(
    successOrders.length === 50 && uniqueOrderNumbers.size === 50,
    `50 pedidos concurrentes procesados atómicamente con 0 bloqueos (50/50 exitosos, 50 códigos únicos)`
  );

  // 3. Verificación de Protección Anti-Fuerza Bruta (Rate Limiting)
  console.log('  🛡️ Probando limitador de tasa de peticiones en /api/auth/login...');
  const bruteForcePromises = Array(65).fill(0).map(() => 
    makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: 'fake@test.com', password: 'wrong' })
  );

  const bruteResults = await Promise.all(bruteForcePromises);
  const has429 = bruteResults.some(r => r.status === 429);

  assert(
    has429,
    'Protección contra fuerza bruta (HTTP 429 Too Many Requests) activa ante ráfagas maliciosas'
  );

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO SUITE ESTRÉS & SEGURIDAD: ${passed}/${total} pruebas pasadas (${Math.round(passed/total*100)}%)`);
  console.log('========================================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runConcurrencyAndSecuritySuite().catch(err => {
  console.error('Error en suite de estrés:', err);
  process.exit(1);
});
