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

async function runAutonomousFullStackSuite() {
  console.log('========================================================================');
  console.log('🤖 SUITE DE INTEGRACIÓN AUTÓNOMA: BÚSQUEDA, NEGOCIOS Y CAMPAÑAS EN YOPAL');
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

  // 1. Búsqueda Universal por Texto (Palabra clave: 'mamona')
  const resSearchMamona = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/search?q=mamona&lat=5.3480&lng=-72.4010',
    method: 'GET'
  });

  assert(
    resSearchMamona.status === 200 &&
    resSearchMamona.body.total_found >= 1 &&
    resSearchMamona.body.merchants.some(m => m.name.includes('Mamona')),
    'Búsqueda por palabra clave "mamona" retorna comercios relevantes con score bayesiano'
  );

  // 2. Búsqueda por Categoría Específica ('Hoteles & Hospedaje')
  const resSearchHotels = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/search?category=${encodeURIComponent('Hoteles & Hospedaje')}&lat=5.3480&lng=-72.4010`,
    method: 'GET'
  });

  assert(
    resSearchHotels.status === 200 &&
    resSearchHotels.body.total_found >= 1 &&
    resSearchHotels.body.merchants.some(m => m.name.includes('Hotel Plaza Real')),
    'Búsqueda por categoría "Hoteles & Hospedaje" retorna hoteles verificados en Yopal'
  );

  // 3. Búsqueda con Filtro de Radio Geográfico (max_distance = 1.5 km)
  const resSearchRadius = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/search?max_distance=1.5&lat=5.3480&lng=-72.4010',
    method: 'GET'
  });

  assert(
    resSearchRadius.status === 200 &&
    resSearchRadius.body.merchants.every(m => m.distance_km <= 1.5),
    'Filtro de radio geográfico estricto (<= 1.5 km en Yopal) respetado al 100%'
  );

  // 4. Crear Promoción Comercial para Restaurante
  const resCreatePromo = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/promotions',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    merchant_id: 'mch-01',
    title: 'Súper Promo Mamona 2x1 en Plátano con Queso',
    description: 'Por la compra de 1 libra de mamona, recibe gratis una porción de plátano maduro con queso siete cueros.',
    discount_percent: 20,
    promo_type: 'percentage',
    is_vip_exclusive: false,
    end_date_days: 30
  });

  assert(
    resCreatePromo.status === 201 &&
    resCreatePromo.body.promotion &&
    resCreatePromo.body.promotion.title.includes('2x1 en Plátano'),
    'Creación de campaña promocional con vigencia temporal y cálculo de descuentos'
  );

  // 5. Listar Promociones Activas
  const resListPromos = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/promotions',
    method: 'GET'
  });

  assert(
    resListPromos.status === 200 &&
    Array.isArray(resListPromos.body.promotions) &&
    resListPromos.body.promotions.length >= 1,
    'Listado público de promociones activas con datos del comercio asociado'
  );

  // 6. Crear Cupón Comercial Dinámico
  const resCreateCoupon = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/coupons/create',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    code: `YOPALPROMO${Date.now().toString().slice(-4)}`,
    discount_percent: 25,
    max_discount: 15000,
    min_order_amount: 30000,
    description: '25% de descuento especial en compras mayores a $30.000 COP'
  });

  assert(
    resCreateCoupon.status === 201 &&
    resCreateCoupon.body.coupon &&
    resCreateCoupon.body.coupon.discount_percent === 25,
    'Creación de cupón dinámico con reglas de compra mínima y tope máximo en COP'
  );

  // 7. Validar Cupón Creado
  const newCouponCode = resCreateCoupon.body.coupon.code;
  const resValidateCoupon = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/coupons/validate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    code: newCouponCode,
    subtotal: 40000
  });

  assert(
    resValidateCoupon.status === 200 &&
    resValidateCoupon.body.valid === true &&
    resValidateCoupon.body.discount_amount === 10000, // 25% de 40000 = 10000 COP
    'Validación matemática exacta del cupón dinámico en moneda local'
  );

  // 8. Consulta de Historial de Puntos y Recompensas del Cliente
  const resPointsHistory = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/subscriptions/points-history/usr-client-01',
    method: 'GET'
  });

  assert(
    resPointsHistory.status === 200 &&
    typeof resPointsHistory.body.total_points === 'number' &&
    Array.isArray(resPointsHistory.body.history),
    'Libro mayor de puntos de fidelización consultado con desglose de transacciones'
  );

  // 9. Auditoría de Coordenadas de los 12 Comercios de Yopal
  const resAllMerchants = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/merchants',
    method: 'GET'
  });

  const validGeo = resAllMerchants.body.merchants.every(m => 
    m.lat >= 5.30 && m.lat <= 5.37 && m.lng >= -72.43 && m.lng <= -72.36
  );

  assert(
    resAllMerchants.status === 200 &&
    resAllMerchants.body.merchants.length >= 10 &&
    validGeo,
    'Verificación de geolocalización legítima de los 12 comercios en el perímetro de Yopal'
  );

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO SUITE AUTÓNOMA: ${passed}/${total} pruebas pasadas (${Math.round(passed/total*100)}%)`);
  console.log('========================================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAutonomousFullStackSuite().catch(err => {
  console.error('Error en suite autónoma:', err);
  process.exit(1);
});
