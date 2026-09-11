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

async function runLifecycleTests() {
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
  console.log('📦 SUITE DE PRUEBAS DE CICLO DE VIDA DE PEDIDOS');
  console.log('====================================================\n');

  // 1. Obtener comercios de Yopal
  const mRes = await req('GET', '/api/merchants?lat=5.3377&lng=-72.3958');
  assert(mRes.status === 200 && mRes.body.merchants.length >= 5, '1. Consulta comercios Yopal (>= 5 aliados activos)');
  const merchant = mRes.body.merchants[0];

  // 2. Obtener productos de Mamona & Tradición
  const pRes = await req('GET', `/api/merchants/${merchant.id}`);
  assert(pRes.status === 200 && pRes.body.products.length >= 1, '2. Consulta menú y platos del aliado');
  const product = pRes.body.products[0];

  // 3. Crear orden inválida (producto inexistente)
  const badOrder = await req('POST', '/api/orders', {
    merchant_id: merchant.id,
    items: [{ product_id: 'prd-no-existe-xyz', quantity: 1 }],
    delivery_address: 'Calle 10 # 20-30',
    delivery_lat: 5.338,
    delivery_lng: -72.396
  });
  assert(badOrder.status === 400, '3. Rechazo de producto no perteneciente al comercio (400)');

  // 4. Crear orden válida con cálculo de cambio de efectivo
  const orderRes = await req('POST', '/api/orders', {
    client_name: 'Ana María Gómez',
    client_phone: '3157890123',
    merchant_id: merchant.id,
    items: [{ product_id: product.id, quantity: 2 }],
    payment_method: 'cash',
    cash_amount_to_pay_with: 1000000,
    delivery_address: 'Carrera 20 # 14-25, Centro Yopal',
    delivery_reference: 'Frente al Parque Ramón Nonato Pérez',
    delivery_lat: 5.3385,
    delivery_lng: -72.3960,
    tip_amount: 3000
  });
  if (orderRes.status !== 201) {
    console.error('Order creation debug:', orderRes.status, orderRes.body);
  }
  assert(orderRes.status === 201 && orderRes.body.order && orderRes.body.order.otp_code, '4. Creación exitosa de orden con OTP de 4 dígitos generado');
  const order = orderRes.body.order;

  // 5. Verificar cálculo de vueltas en efectivo
  const expectedChange = 1000000 - order.total_amount;
  assert(order.cash_change_due === expectedChange, `5. Cálculo exacto de vueltas ($${order.cash_change_due} COP de cambio)`);

  // 6. Transición a preparing
  const prep = await req('PATCH', `/api/orders/${order.id}/status`, { status: 'preparing' });
  assert(prep.status === 200 && prep.body.order.status === 'preparing', '6. Transición de estado a "preparing" en cocina');

  // 7. Transición a ready_for_pickup y auto-despacho
  const ready = await req('PATCH', `/api/orders/${order.id}/status`, { status: 'ready_for_pickup' });
  assert(ready.status === 200, '7. Transición a "ready_for_pickup" y disparo de algoritmo de auto-despacho');

  // 8. Verificar que se asignó un repartidor
  const assigned = await req('GET', `/api/orders/${order.id}`);
  assert(assigned.body.order.driver_id != null, `8. Repartidor asignado correctamente: ${assigned.body.order.driver_name}`);

  // 9. Repartidor recoge y va en camino
  const onTheWay = await req('PATCH', `/api/orders/${order.id}/status`, { status: 'on_the_way' });
  assert(onTheWay.status === 200 && onTheWay.body.order.status === 'on_the_way', '9. Repartidor marca pedido recogido ("on_the_way")');

  // 10. Envío de mensaje en chat de la orden
  const chatMsg = await req('GET', `/api/orders/${order.id}/chat`);
  assert(chatMsg.status === 200 && Array.isArray(chatMsg.body.messages), '10. Consulta de sala de chat del pedido');

  // 11. Intento de OTP incorrecto
  const badOtp = await req('POST', `/api/orders/${order.id}/verify-otp`, { otp_code: '0000' });
  assert(badOtp.status === 400 && badOtp.body.error, '11. Rechazo de código OTP incorrecto (400)');

  // 12. Validación con OTP correcto
  const goodOtp = await req('POST', `/api/orders/${order.id}/verify-otp`, { otp_code: order.otp_code });
  assert(goodOtp.status === 200 && goodOtp.body.success, '12. Confirmación de entrega segura con OTP correcto');

  // 13. Verificar que la orden quedó en 'delivered' y pago 'approved'
  const finalOrder = await req('GET', `/api/orders/${order.id}`);
  assert(finalOrder.body.order.status === 'delivered' && finalOrder.body.order.payment_status === 'approved', '13. Estado final de orden confirmado como "delivered" y "approved"');

  // 14. Verificar billetera del repartidor
  const driverWallet = await req('GET', `/api/drivers/${assigned.body.order.driver_id}`);
  assert(driverWallet.status === 200 && driverWallet.body.ledger.length >= 1, '14. Registro contable de ganancias en billetera del domiciliario');

  console.log('\n====================================================');
  console.log(`📊 RESULTADO: ${passed}/${total} pruebas pasadas (${Math.round((passed/total)*100)}%)`);
  console.log('====================================================');

  if (passed !== total) process.exit(1);
}

runLifecycleTests().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
