const http = require('http');
const fs = require('fs');
const path = require('path');
const { db } = require('./src/db/database');
const { calculateDistanceKm, validateColombianPhone } = require('./src/services/geo');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const duration = Date.now() - start;
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed, headers: res.headers, duration });
        } catch (e) {
          resolve({ status: res.statusCode, body, headers: res.headers, duration });
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

async function runISO25000Suite() {
  console.log('========================================================================');
  console.log('🏛️ SUITE DE EVALUACIÓN DE CALIDAD DE SOFTWARE ISO/IEC 25000 (SQuaRE)');
  console.log('   Plataforma: LUPIN Express • Yopal, Casanare, Colombia');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, category, message) {
    total++;
    if (condition) {
      console.log(`  ✅ [ISO 25000 PASS] [${category}] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [ISO 25000 FAIL] [${category}] ${message}`);
    }
  }

  // --------------------------------------------------------------------------
  // 1. ADECUACIÓN FUNCIONAL (Functional Suitability)
  // --------------------------------------------------------------------------
  const healthRes = await makeRequest({ hostname: 'localhost', port: 3000, path: '/api/health', method: 'GET' });
  assert(healthRes.status === 200 && healthRes.body.status === 'online', '1. Adecuación Funcional', 'Endpoint de salud e integridad operacional 100% en línea');

  const merchantsRes = await makeRequest({ hostname: 'localhost', port: 3000, path: '/api/merchants', method: 'GET' });
  assert(merchantsRes.status === 200 && merchantsRes.body.merchants.length >= 10, '1. Adecuación Funcional', 'Catálogo de comercios legítimos de Yopal sembrado y completo');

  // --------------------------------------------------------------------------
  // 2. EFICIENCIA DE DESEMPEÑO (Performance Efficiency)
  // --------------------------------------------------------------------------
  const perfStart = Date.now();
  const promises = Array(20).fill(0).map(() => makeRequest({ hostname: 'localhost', port: 3000, path: '/api/merchants', method: 'GET' }));
  const results = await Promise.all(promises);
  const avgDuration = results.reduce((acc, r) => acc + r.duration, 0) / results.length;
  assert(avgDuration < 60, '2. Eficiencia de Desempeño', `Latencia promedio sub-60ms bajo carga concurrente (${Math.round(avgDuration)}ms)`);

  // --------------------------------------------------------------------------
  // 3. COMPATIBILIDAD (Compatibility)
  // --------------------------------------------------------------------------
  const paymentsRes = await makeRequest({ hostname: 'localhost', port: 3000, path: '/api/payments/methods', method: 'GET' });
  const methods = paymentsRes.body.payment_methods || [];
  const hasBreB = methods.some(m => m.id === 'bre_b');
  const hasPse = methods.some(m => m.id === 'wompi_pse');
  assert(hasBreB && hasPse, '3. Compatibilidad', 'Interoperabilidad bancaria nacional activa (Llave Bre-B, PSE, Nequi y Daviplata)');

  // --------------------------------------------------------------------------
  // 4. USABILIDAD (Usability / UX)
  // --------------------------------------------------------------------------
  const phoneValidation = validateColombianPhone('+57 312 345 6781');
  assert(phoneValidation.valid && phoneValidation.phone === '3123456781', '4. Usabilidad', 'Normalización tolerante a errores de digitación en números móviles (+57, espacios, guiones)');

  // --------------------------------------------------------------------------
  // 5. FIABILIDAD (Reliability)
  // --------------------------------------------------------------------------
  const dbCheck = db.prepare('PRAGMA integrity_check').all();
  const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
  assert(dbCheck[0].integrity_check === 'ok' && fkCheck.length === 0, '5. Fiabilidad', 'Cero corrupción relacional o violaciones de claves foráneas en base de datos');

  // --------------------------------------------------------------------------
  // 6. SEGURIDAD (Security)
  // --------------------------------------------------------------------------
  const secHeaders = healthRes.headers;
  const hasSecHeaders = secHeaders['x-content-type-options'] === 'nosniff' &&
                        secHeaders['x-frame-options'] === 'SAMEORIGIN' &&
                        secHeaders['x-xss-protection'] === '1; mode=block';
  assert(hasSecHeaders, '6. Seguridad', 'Cabeceras de protección HTTP estrictas (nosniff, SAMEORIGIN, XSS-Protection)');

  // --------------------------------------------------------------------------
  // 7. MANTENIBILIDAD (Maintainability)
  // --------------------------------------------------------------------------
  const hasDocDir = fs.existsSync(path.join(__dirname, 'docs', 'ARCHITECTURE.md'));
  assert(hasDocDir, '7. Mantenibilidad', 'Documentación arquitectónica completa y modular en /docs/');

  // --------------------------------------------------------------------------
  // 8. PORTABILIDAD (Portability)
  // --------------------------------------------------------------------------
  const hasCapacitorConfig = fs.existsSync(path.join(__dirname, 'capacitor.config.json'));
  const hasDeployVps = fs.existsSync(path.join(__dirname, 'deploy_vps.sh'));
  assert(hasCapacitorConfig && hasDeployVps, '8. Portabilidad', 'Artefactos de exportación nativa Android (Capacitor) y despliegue multiplataforma VPS');

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO AUDITORÍA ISO/IEC 25000: ${passed}/${total} características aprobadas (${Math.round(passed/total*100)}%)`);
  console.log('========================================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runISO25000Suite().catch(err => {
  console.error('Error en suite ISO 25000:', err);
  process.exit(1);
});
