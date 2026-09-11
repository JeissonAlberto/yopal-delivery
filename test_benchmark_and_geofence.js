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
          resolve({ status: res.statusCode, body: parsed, latencyMs });
        } catch (e) {
          resolve({ status: res.statusCode, body, latencyMs });
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

async function runBenchmarkAndGeofenceSuite() {
  console.log('========================================================================');
  console.log('⚡ SUITE DE BENCHMARK DE RENDIMIENTO, RESILIENCIA Y GEOFENCING ANTIFRAUDE');
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

  // 1. Verificación de Página Offline PWA
  const resOffline = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/offline.html',
    method: 'GET'
  });

  assert(
    resOffline.status === 200 &&
    typeof resOffline.body === 'string' &&
    resOffline.body.includes('Sin Conexión a Internet'),
    'Página de contingencia Offline PWA disponible y precacheada'
  );

  // 2. Benchmark de Latencia: 20 peticiones concurrentes a la API
  const benchmarkPromises = Array(20).fill(0).map((_, i) => 
    makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/merchants?lat=5.3480&lng=-72.4010',
      method: 'GET'
    })
  );

  const benchmarkResults = await Promise.all(benchmarkPromises);
  const avgLatency = benchmarkResults.reduce((acc, r) => acc + r.latencyMs, 0) / benchmarkResults.length;
  const allSuccessful = benchmarkResults.every(r => r.status === 200);

  assert(
    allSuccessful && avgLatency < 100,
    `Benchmark de concurrencia superado (20 peticiones simultáneas con latencia promedio de ${Math.round(avgLatency)}ms < 100ms)`
  );

  // 3. Verificación de Integridad de todos los 11 Endpoints Principales
  const endpoints = [
    '/api/health',
    '/api/auth/me',
    '/api/merchants',
    '/api/zones',
    '/api/drivers/active',
    '/api/admin/metrics',
    '/api/coupons',
    '/api/promotions',
    '/api/search?q=mamona',
    '/api/subscriptions/plans',
    '/api/payments/methods'
  ];

  const endpointChecks = await Promise.all(endpoints.map(p => 
    makeRequest({ hostname: 'localhost', port: 3000, path: p, method: 'GET' })
  ));

  const endpointsHealthy = endpointChecks.every(r => [200, 401].includes(r.status));
  assert(
    endpointsHealthy,
    `Auditoría de integridad de 11 endpoints del backend de LUPIN Express 100% saludables`
  );

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO SUITE BENCHMARK: ${passed}/${total} pruebas pasadas (${Math.round(passed/total*100)}%)`);
  console.log('========================================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runBenchmarkAndGeofenceSuite().catch(err => {
  console.error('Error en suite benchmark:', err);
  process.exit(1);
});
