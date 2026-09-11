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

async function runAuthTests() {
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

  console.log('====================================================');
  console.log('🔒 SUITE DE PRUEBAS DE AUTENTICACIÓN (LUPIN Express)');
  console.log('====================================================\n');

  // 1. Login Admin
  const lAdmin = await req('POST', '/api/auth/login', { email: 'admin@yopalexpress.com', password: 'admin123' });
  assert(lAdmin.status === 200 && lAdmin.body.token && lAdmin.body.user.role === 'superadmin', '1. Login SuperAdmin exitoso (200 + token + role superadmin)');
  const adminToken = lAdmin.body.token;

  // 2. Login Driver
  const lDriver = await req('POST', '/api/auth/login', { email: 'carlos.driver@yopal.com', password: 'yopal2026' });
  assert(lDriver.status === 200 && lDriver.body.token && lDriver.body.user.role === 'driver', '2. Login Repartidor exitoso (200 + token + role driver)');
  const driverToken = lDriver.body.token;

  // 3. Login Client
  const lClient = await req('POST', '/api/auth/login', { email: 'ana@yopal.com', password: 'yopal2026' });
  assert(lClient.status === 200 && lClient.body.token && lClient.body.user.role === 'client', '3. Login Cliente exitoso (200 + token + role client)');
  const clientToken = lClient.body.token;

  // 4. Login Merchant
  const lMerchant = await req('POST', '/api/auth/login', { email: 'mamona-tradicion-llanera@yopal.com', password: 'yopal2026' });
  assert(lMerchant.status === 200 && lMerchant.body.token && lMerchant.body.user.role === 'merchant_admin', '4. Login Comercio Aliado exitoso (200 + token + role merchant_admin)');

  // 5. Login contraseña incorrecta
  const lBadPass = await req('POST', '/api/auth/login', { email: 'ana@yopal.com', password: 'wrongpassword' });
  assert(lBadPass.status === 401 && lBadPass.body.error, '5. Login contraseña incorrecta rechazado (401)');

  // 6. Login usuario inexistente
  const lNoUser = await req('POST', '/api/auth/login', { email: 'fantasma@yopal.com', password: '123' });
  assert(lNoUser.status === 401 && lNoUser.body.error, '6. Login usuario inexistente rechazado (401)');

  // 7. Registro nuevo Cliente con email único
  const testEmailClient = `test.client.${Date.now()}@yopal.com`;
  const rClient = await req('POST', '/api/auth/register', {
    name: 'Carlos Yopal Test',
    email: testEmailClient,
    phone: `319${Date.now().toString().slice(-7)}`,
    password: 'securepass2026',
    role: 'client'
  });
  assert(rClient.status === 201 && rClient.body.token && rClient.body.user.role === 'client', '7. Registro nuevo Cliente exitoso (201 + token)');

  // 8. Registro nuevo Repartidor con vehículo y placa
  const testEmailDriver = `test.driver.${Date.now()}@yopal.com`;
  const rDriver = await req('POST', '/api/auth/register', {
    name: 'Motorizado Casanare Test',
    email: testEmailDriver,
    phone: `318${Date.now().toString().slice(-7)}`,
    password: 'securepass2026',
    role: 'driver',
    vehicle_type: 'moto',
    plate_number: 'XYZ-99D'
  });
  assert(rDriver.status === 201 && rDriver.body.token && rDriver.body.user.role === 'driver', '8. Registro nuevo Repartidor con moto/placa exitoso (201 + driver record)');

  // 9. Registro email duplicado
  const rDup = await req('POST', '/api/auth/register', {
    name: 'Duplicado Test',
    email: testEmailClient,
    phone: '3150001122',
    password: 'pass',
    role: 'client'
  });
  assert(rDup.status === 400 && rDup.body.error, '9. Registro email duplicado rechazado (400)');

  // 10. GET /api/auth/me con token válido
  const meAdmin = await req('GET', '/api/auth/me', null, { Authorization: `Bearer ${adminToken}` });
  assert(meAdmin.status === 200 && meAdmin.body.user.email === 'admin@yopalexpress.com', '10. GET /api/auth/me con Bearer token admin válido (200)');

  // 11. GET /api/auth/me con token repartidor
  const meDriver = await req('GET', '/api/auth/me', null, { Authorization: `Bearer ${driverToken}` });
  assert(meDriver.status === 200 && meDriver.body.user.driver && meDriver.body.user.driver.vehicle_type === 'moto', '11. GET /api/auth/me repartidor retorna datos de vehículo (200 + driver data)');

  // 12. GET /api/auth/me sin token
  const meNoToken = await req('GET', '/api/auth/me');
  assert(meNoToken.status === 401, '12. GET /api/auth/me sin token rechazado (401)');

  // 13. GET /api/auth/me con token falso/corrupto
  const meFake = await req('GET', '/api/auth/me', null, { Authorization: 'Bearer token_totalmente_falso' });
  assert(meFake.status === 401, '13. GET /api/auth/me con token inválido rechazado (401)');

  console.log('\n====================================================');
  console.log(`📊 RESULTADO: ${passed}/${total} pruebas pasadas (${Math.round((passed/total)*100)}%)`);
  console.log('====================================================');

  if (passed !== total) process.exit(1);
}

runAuthTests().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
