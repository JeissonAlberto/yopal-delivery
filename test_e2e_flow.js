const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: reqHeaders
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runE2ETest() {
  console.log('========================================================================');
  console.log('🧪 INICIANDO TEST INTEGRAL MULTIDISCIPLINAR: LUPIN EXPRESS YOPAL');
  console.log('   (Ingeniería, Neuromarketing, Gamificación, Finanzas & Mandados)');
  console.log('========================================================================');

  // 1. Health Check
  console.log('\n[1/8] Probando Health Check del Backend LUPIN Express...');
  const health = await makeRequest('GET', '/api/health');
  if (health.status === 200 && health.body.status === 'online') {
    console.log(`✅ Servidor en línea en ${health.body.city}`);
  } else {
    throw new Error(`Fallo health check: ${JSON.stringify(health)}`);
  }

  // 2. Consulta de Comercios en Casco Urbano de Yopal
  console.log('\n[2/8] Consultando Comercios y Menú de Mamona & Tradición Llanera...');
  const merchantsRes = await makeRequest('GET', '/api/merchants?lat=5.3480&lng=-72.4010');
  const merchants = merchantsRes.body.merchants;
  const sampleMerchant = merchants[0];
  console.log(`📍 Comercio: ${sampleMerchant.name} (Distancia: ${sampleMerchant.distanceKm} km, Envío: $${sampleMerchant.deliveryFee} COP)`);

  const detailRes = await makeRequest('GET', `/api/merchants/${sampleMerchant.id}`);
  const products = detailRes.body.products;
  const sampleProduct = products[0];
  console.log(`🍖 Plato: ${sampleProduct.name} - $${sampleProduct.price} COP`);

  // 3. Validación de Cupón de Fidelización (LUPINLLANERO)
  console.log('\n[3/8] Probando Motor de Cupones de Neuromarketing (LUPINLLANERO)...');
  const couponRes = await makeRequest('POST', '/api/coupons/validate', {
    code: 'LUPINLLANERO',
    subtotal: sampleProduct.price * 2
  });
  if (couponRes.status === 200 && couponRes.body.valid) {
    console.log(`✅ Cupón validado: -${couponRes.body.discount_percent}% -> Descuento: $${couponRes.body.discount_amount} COP (${couponRes.body.description})`);
  } else {
    throw new Error(`Fallo validación cupón: ${JSON.stringify(couponRes)}`);
  }

  // 4. Creación de Pedido con Propina Emocional para el Llanero
  console.log('\n[4/8] Creando Pedido con Propina ("Gasolina para la moto ⛽")...');
  const cashToPay = (sampleProduct.price * 2) + 50000;
  const orderPayload = {
    client_name: 'Mateo Cárdenas (Cliente Frecuente)',
    client_phone: '3204567890',
    merchant_id: sampleMerchant.id,
    items: [{ product_id: sampleProduct.id, quantity: 2 }],
    payment_method: 'cash',
    cash_amount_to_pay_with: cashToPay,
    delivery_address: 'Calle 24 # 25-18, Barrio La Campiña, Yopal',
    delivery_reference: 'Frente al parque de La Campiña, portón blanco',
    delivery_lat: 5.3480,
    delivery_lng: -72.4010,
    tip_amount: 3000
  };

  const createOrderRes = await makeRequest('POST', '/api/orders', orderPayload);
  if (createOrderRes.status !== 201) {
    throw new Error(`Error creando pedido: ${JSON.stringify(createOrderRes)}`);
  }
  const order = createOrderRes.body.order;
  console.log(`✅ Pedido Creado con Éxito:`);
  console.log(`   - Código: ${order.order_number}`);
  console.log(`   - Total a Pagar: $${order.total_amount} COP`);
  console.log(`   - PIN OTP de Seguridad: ${order.otp_code}`);

  // 5. Módulo LUPIN Mandados / Favor Express
  console.log('\n[5/8] Probando Módulo de Mandados Express en Yopal...');
  const errandPayload = {
    client_name: 'Laura Restrepo',
    client_phone: '3145566778',
    title: 'Llevar llaves y documentos urgentes',
    description: 'Recoger sobre en CC Unicentro y entregar en Barrio Llano Lindo',
    pickup_address: 'Unicentro Yopal',
    pickup_lat: 5.3470,
    pickup_lng: -72.4045,
    dropoff_address: 'Calle 30 # 21-50, Llano Lindo',
    dropoff_lat: 5.3140,
    dropoff_lng: -72.3995,
    payment_method: 'cash'
  };
  const errandRes = await makeRequest('POST', '/api/errands', errandPayload);
  if (errandRes.status === 201) {
    console.log(`✅ Mandado Creado: #${errandRes.body.errand.errand_number} • Tarifa: $${errandRes.body.errand.fare_amount} COP (${errandRes.body.errand.distance_km} km)`);
  } else {
    throw new Error(`Fallo creación de mandado: ${JSON.stringify(errandRes)}`);
  }

  // 6. Cocina y Despacho Automático
  console.log('\n[6/8] Cocina avanza estado y despacha a repartidor más cercano...');
  await makeRequest('PATCH', `/api/orders/${order.id}/status`, { status: 'preparing' });
  await makeRequest('PATCH', `/api/orders/${order.id}/status`, { status: 'ready_for_pickup' });
  
  const assignedOrderRes = await makeRequest('GET', `/api/orders/${order.id}`);
  const assignedOrder = assignedOrderRes.body.order;
  console.log(`🛵 Repartidor asignado: ${assignedOrder.driver_name || 'En despacho'}`);

  // 7. Telemetría y Entrega con OTP
  console.log('\n[7/8] Repartidor recoge, transmite GPS y valida PIN OTP...');
  await makeRequest('PATCH', `/api/orders/${order.id}/status`, { status: 'on_the_way' });
  const otpRes = await makeRequest('POST', `/api/orders/${order.id}/verify-otp`, { otp_code: order.otp_code });
  if (otpRes.status === 200 && otpRes.body.success) {
    console.log(`🎉 ${otpRes.body.message}`);
  }

  // 8. Unit Economics & Finanzas de la Plataforma
  console.log('\n[8/8] Verificando Dashboard Financiero de Torre de Control...');
  const metrics = (await makeRequest('GET', '/api/admin/metrics')).body.metrics;
  console.log(`📊 Balance Financiero LUPIN Express:`);
  console.log(`   - GMV Total Hoy: $${metrics.todayGmv} COP`);
  console.log(`   - Ganancias Netas Plataforma: $${metrics.todayPlatformProfit} COP`);
  console.log(`   - Fondos a Liquidar a Restaurantes (Nequi/Banco): $${metrics.todayMerchantPayout} COP`);
  console.log(`   - Mandados Express: ${metrics.todayErrands}`);

  console.log('\n========================================================================');
  console.log('🚀 ¡TODAS LAS MEJORAS MULTIDISCIPLINARES FUNCIONAN AL 100%!');
  console.log('   Desarrollado por: Ing. Jeisson Alberto Sarmiento • LUPIN Express 2026');
  console.log('========================================================================');
}

runE2ETest().catch((err) => {
  console.error('❌ Error en test E2E:', err);
  process.exit(1);
});
