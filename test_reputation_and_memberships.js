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

async function runReputationAndMembershipsSuite() {
  console.log('========================================================================');
  console.log('🌟 SUITE DE REPUTACIÓN BAYESIANA, RESEÑAS CONSTRUCTIVAS Y MEMBRESÍAS VIP');
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

  // 1. Consultar Reseñas y Reputación Bayesiana
  const resReviews = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reviews/merchant/mch-01',
    method: 'GET'
  });

  assert(
    resReviews.status === 200 &&
    typeof resReviews.body.bayesian_score === 'number' &&
    resReviews.body.distribution &&
    resReviews.body.distribution[5] >= 1,
    'Consulta de reputación bayesiana y distribución de 1-5 estrellas exitosa'
  );

  // 2. Crear Crítica Constructiva con 3 Bloques y Verificación
  const newReviewData = {
    business_id: 'mch-01',
    user_id: 'usr-client-01',
    user_name: 'Don Carlos Llanero',
    order_id: null,
    rating: 5,
    positive_aspects: 'La carne a la perra y la mamona tienen el mejor sabor a leña de Yopal.',
    improvement_aspects: 'El tiempo de espera en horas pico (domingo a la 1pm) puede mejorar.',
    recommendation: 'Recomiendo habilitar una estación extra de empaque térmico para domicilios.'
  };

  const resCreateReview = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reviews',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, newReviewData);

  assert(
    resCreateReview.status === 201 &&
    resCreateReview.body.review &&
    resCreateReview.body.review.rating === 5 &&
    resCreateReview.body.review.positive_aspects.includes('mamona'),
    'Publicación de crítica constructiva con campos estructurados y asignación de puntos'
  );

  const createdReviewId = resCreateReview.body.review.id;

  // 3. Respuesta Oficial del Comercio
  const resReply = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/reviews/${createdReviewId}/reply`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    official_reply: 'Muchas gracias por su valiosa recomendación. Ya asignamos un segundo empacador los domingos.',
    responder_name: 'Gerencia Mamona & Tradición',
    merchant_id: 'mch-01'
  });

  assert(
    resReply.status === 200 &&
    resReply.body.response &&
    resReply.body.response.official_reply.includes('segundo empacador'),
    'Respuesta oficial del restaurante asociada a la reseña'
  );

  // 4. Votación de Reseña Útil
  const resVote = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/reviews/${createdReviewId}/vote`,
    method: 'POST'
  });

  assert(
    resVote.status === 200 &&
    resVote.body.helpful_votes >= 1,
    'Votación de reseña como útil registrada correctamente'
  );

  // 5. Reporte Antifraude / Spam de Reseña
  const resReport = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/reviews/${createdReviewId}/report`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    reported_by: 'usr-client-01',
    reason: 'offensive',
    details: 'Prueba de auditoría de reporte'
  });

  assert(
    resReport.status === 201 &&
    resReport.body.report_id != null,
    'Reporte de moderación antifraude registrado sin censura arbitraria'
  );

  // 6. Consultar Planes de Membresía (B2C y B2B)
  const resPlans = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/subscriptions/plans',
    method: 'GET'
  });

  assert(
    resPlans.status === 200 &&
    Array.isArray(resPlans.body.plans) &&
    resPlans.body.plans.some(p => p.id === 'plan-client-vip') &&
    resPlans.body.plans.some(p => p.id === 'plan-merchant-pro'),
    'Listado de planes B2C Club VIP y B2B Comercio Pro con beneficios parseados'
  );

  // 7. Suscribir al Cliente a Club VIP y Consultar Estado
  const resSubscribe = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/subscriptions/subscribe',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    user_id: 'usr-client-01',
    plan_id: 'plan-client-vip'
  });

  const resSubStatus = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/subscriptions/my-status/usr-client-01',
    method: 'GET'
  });

  assert(
    resSubscribe.status === 201 &&
    resSubStatus.status === 200 &&
    resSubStatus.body.is_active_member === true &&
    resSubStatus.body.free_deliveries_quota === 4 &&
    resSubStatus.body.points >= 50,
    'Suscripción activa Club VIP con cupo de 4 domicilios gratis y saldo de puntos'
  );

  // 8. Crear Pedido y Aplicar Subsidio de Domicilio Gratis por Membresía VIP
  const orderWithVip = {
    client_id: 'usr-client-01',
    client_name: 'Cliente VIP Yopal',
    client_phone: '3123456781',
    merchant_id: 'mch-01',
    payment_method: 'cash',
    cash_amount_to_pay_with: 80000,
    delivery_address: 'Calle 24 # 25-18, Barrio La Campiña, Yopal',
    delivery_lat: 5.3480,
    delivery_lng: -72.4010,
    items: [
      { product_id: 'prd-mch-01-1', quantity: 1, selected_options: [] } // Mamona $32.000 COP (> $25.000 min)
    ]
  };

  const resOrderVip = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/orders',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, orderWithVip);

  assert(
    resOrderVip.status === 201 &&
    resOrderVip.body.order &&
    resOrderVip.body.order.delivery_fee === 0, // Tarifa de envío subsidiada $0 COP
    'Aplicación automática de subsidio de Domicilio Gratis ($0 COP) para miembro VIP'
  );

  // 9. Verificar que el cupo de domicilios usados se incrementó
  const resSubStatusAfter = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/subscriptions/my-status/usr-client-01',
    method: 'GET'
  });

  assert(
    resSubStatusAfter.body.free_deliveries_used === (resSubStatus.body.free_deliveries_used + 1),
    'Deducción atómica de 1 cupo de domicilio gratis en el libro mayor de membresía'
  );

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO SUITE REPUTACIÓN & MEMBRESÍAS: ${passed}/${total} pruebas pasadas (${Math.round(passed/total*100)}%)`);
  console.log('========================================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runReputationAndMembershipsSuite().catch(err => {
  console.error('Error en suite:', err);
  process.exit(1);
});
