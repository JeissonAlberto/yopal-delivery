const http = require('http');

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

async function runBreBPaymentsSuite() {
  console.log('========================================================================');
  console.log('⚡ SUITE DE PAGOS DIGITALES & LLAVE BRE-B (BANCO DE LA REPÚBLICA)');
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

  // 1. Consultar Métodos de Pago Disponibles
  const resMethods = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/payments/methods',
    method: 'GET'
  });

  assert(
    resMethods.status === 200 &&
    Array.isArray(resMethods.body.payment_methods) &&
    resMethods.body.payment_methods.some(m => m.id === 'bre_b' && m.is_free === true) &&
    resMethods.body.payment_methods.some(m => m.id === 'nequi'),
    'Listado de métodos de pago con Llave Bre-B ($0 comisión) e interoperabilidad Nequi/Daviplata'
  );

  // 2. Generar Orden de Pago con Llave Bre-B (Celular 3123456781)
  const resGenerateBreB = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/payments/generate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    user_id: 'usr-client-01',
    payment_method: 'bre_b',
    amount_cop: 64000,
    bre_b_key_type: 'phone'
  });

  assert(
    resGenerateBreB.status === 201 &&
    resGenerateBreB.body.payment &&
    resGenerateBreB.body.payment.bre_b_key_value === '3123456781' &&
    resGenerateBreB.body.payment.reference_code.startsWith('BREB-'),
    'Generación de intención de pago con Llave Bre-B y código de referencia único'
  );

  const referenceCode = resGenerateBreB.body.payment.reference_code;

  // 3. Confirmar Pago Digital mediante Llave Bre-B
  const resConfirm = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/payments/confirm',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    reference_code: referenceCode,
    approval_code: 'BREB-AUT-89421',
    proof_photo_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400'
  });

  assert(
    resConfirm.status === 200 &&
    resConfirm.body.payment &&
    resConfirm.body.payment.status === 'approved' &&
    resConfirm.body.payment.approval_code === 'BREB-AUT-89421',
    'Confirmación de pago digital con código de aprobación y comprobante registrado'
  );

  // 4. Crear Pedido con Método de Pago Llave Bre-B
  const orderPayload = {
    client_name: 'Ana María Gómez (Pago Bre-B)',
    client_phone: '3157890123',
    merchant_id: 'mch-01',
    items: [{ product_id: 'prd-mch-01-1', quantity: 1 }],
    payment_method: 'bre_b',
    delivery_address: 'Calle 24 # 25-18, Barrio La Campiña, Yopal',
    delivery_reference: 'Portón blanco',
    delivery_lat: 5.3480,
    delivery_lng: -72.4010
  };

  const resOrderBreB = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/orders',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, orderPayload);

  assert(
    resOrderBreB.status === 201 &&
    resOrderBreB.body.order &&
    resOrderBreB.body.order.payment_method === 'bre_b',
    'Creación exitosa de pedido con pasarela gratuita Llave Bre-B del Banco de la República'
  );

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO SUITE BRE-B & PAGOS: ${passed}/${total} pruebas pasadas (${Math.round(passed/total*100)}%)`);
  console.log('========================================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runBreBPaymentsSuite().catch(err => {
  console.error('Error en suite Bre-B:', err);
  process.exit(1);
});
