const http = require('http');
const { db } = require('./src/db/database');

const BASE_URL = 'http://127.0.0.1:3000';

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch(e) {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runSprintSuite() {
  console.log('========================================================================');
  console.log('🚀 SUITE DE SPRINT: CREADOR DE PRODUCTOS, WEBHOOKS & SIMULADOR DE RÁFAGAS');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  // 1. Crear nuevo producto de prueba
  total++;
  let testProductId = null;
  try {
    const resCreateProd = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/products',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      merchant_id: 'mch-01',
      name: 'Carne a la Llanera Especial Sprint',
      price: 38000,
      description: 'Porción generosa de ternera con yuca y plátano',
      image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947',
      options: []
    });

    if (resCreateProd.status === 201 && resCreateProd.body.id) {
      testProductId = resCreateProd.body.id;
      console.log(`  ✅ [PASS] 1. Creación rápida de producto en catálogo exitosa (ID: ${testProductId})`);
      passed++;
    } else {
      console.error('  ❌ [FAIL] 1. Falla al crear producto:', resCreateProd.body);
    }
  } catch(e) {
    console.error('  ❌ [FAIL] 1. Excepción creando producto:', e.message);
  }

  // 2. Toggle disponibilidad del producto
  total++;
  try {
    const resToggle = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: `/api/products/${testProductId}/toggle`,
      method: 'PATCH'
    });

    if (resToggle.status === 200 && resToggle.body.success && resToggle.body.is_available === 0) {
      console.log('  ✅ [PASS] 2. Pausado / Desactivación rápida de producto (is_available = 0) verificado');
      passed++;
    } else {
      console.error('  ❌ [FAIL] 2. Falla en toggle:', resToggle.body);
    }
  } catch(e) {
    console.error('  ❌ [FAIL] 2. Excepción en toggle:', e.message);
  }

  // 3. Eliminar producto de prueba
  total++;
  try {
    const resDel = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: `/api/products/${testProductId}`,
      method: 'DELETE'
    });

    if (resDel.status === 200 && resDel.body.success) {
      console.log('  ✅ [PASS] 3. Eliminación de producto del catálogo exitosa');
      passed++;
    } else {
      console.error('  ❌ [FAIL] 3. Falla al eliminar producto:', resDel.body);
    }
  } catch(e) {
    console.error('  ❌ [FAIL] 3. Excepción eliminando producto:', e.message);
  }

  // 4. Registrar Webhook para ERP / WhatsApp
  total++;
  let testWebhookId = null;
  try {
    const resWhk = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/admin/webhooks',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name: 'SIIGO ERP Yopal',
      target_url: 'https://api.siigo.com/v1/webhooks/lupin-yopal',
      secret: 'whsec_yopal2026',
      events: ['order.created', 'order.delivered']
    });

    if (resWhk.status === 201 && resWhk.body.id) {
      testWebhookId = resWhk.body.id;
      console.log(`  ✅ [PASS] 4. Registro de Webhook para ERP/Contabilidad exitoso (ID: ${testWebhookId})`);
      passed++;
    } else {
      console.error('  ❌ [FAIL] 4. Falla registrando webhook:', resWhk.body);
    }
  } catch(e) {
    console.error('  ❌ [FAIL] 4. Excepción registrando webhook:', e.message);
  }

  // 5. Test Ping a Webhook
  total++;
  try {
    const resPing = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: `/api/admin/webhooks/${testWebhookId}/test`,
      method: 'POST'
    });

    if (resPing.status === 200 && resPing.body.success && resPing.body.payload_sent) {
      console.log('  ✅ [PASS] 5. Emisión de Ping de prueba de Webhook validada');
      passed++;
    } else {
      console.error('  ❌ [FAIL] 5. Falla en ping webhook:', resPing.body);
    }
  } catch(e) {
    console.error('  ❌ [FAIL] 5. Excepción en ping webhook:', e.message);
  }

  // 6. Simulación de Ráfaga de Pedidos NOC
  total++;
  try {
    const resSim = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/admin/simulate/burst',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { count: 1 });

    if (resSim.status === 201 && resSim.body.success && resSim.body.orders.length === 1) {
      console.log(`  ✅ [PASS] 6. Simulación de pedido en vivo ejecutada (${resSim.body.orders[0].orderNumber})`);
      passed++;
    } else {
      console.error('  ❌ [FAIL] 6. Falla simulando pedido:', resSim.body);
    }
  } catch(e) {
    console.error('  ❌ [FAIL] 6. Excepción simulando pedido:', e.message);
  }

  // 7. Eliminar Webhook
  total++;
  try {
    const resDelWhk = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: `/api/admin/webhooks/${testWebhookId}`,
      method: 'DELETE'
    });

    if (resDelWhk.status === 200 && resDelWhk.body.success) {
      console.log('  ✅ [PASS] 7. Eliminación limpia de webhook exitosa');
      passed++;
    } else {
      console.error('  ❌ [FAIL] 7. Falla al eliminar webhook:', resDelWhk.body);
    }
  } catch(e) {
    console.error('  ❌ [FAIL] 7. Excepción eliminando webhook:', e.message);
  }

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO SPRINT INTEGRACIONES & PRODUCTOS: ${passed}/${total} pruebas pasadas (${Math.round((passed/total)*100)}%)`);
  console.log('========================================================================\n');

  if (passed !== total) process.exit(1);
}

runSprintSuite();
