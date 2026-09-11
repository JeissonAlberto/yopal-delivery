const http = require('http');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body, headers: res.headers });
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

async function runFavoritesReorderAndWithdrawalsSuite() {
  console.log('========================================================================');
  console.log('❤️ SUITE DE FAVORITOS, RE-ORDER 1-TOQUE, RETIRO NEQUI Y REPORTES CSV');
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

  // 1. Guardar Comercio en Favoritos
  const resAddFav = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/favorites',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    user_id: 'usr-client-01',
    merchant_id: 'mch-01'
  });

  assert(
    resAddFav.status === 201 && resAddFav.body.is_favorite === true,
    'Comercio guardado exitosamente en favoritos del cliente'
  );

  // 2. Verificar Estado de Favorito
  const resCheckFav = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/favorites/check/mch-01?user_id=usr-client-01',
    method: 'GET'
  });

  assert(
    resCheckFav.status === 200 && resCheckFav.body.is_favorite === true,
    'Verificación de comercio en favoritos activa'
  );

  // 3. Listar Favoritos del Cliente
  const resListFav = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/favorites?user_id=usr-client-01',
    method: 'GET'
  });

  assert(
    resListFav.status === 200 &&
    Array.isArray(resListFav.body.favorites) &&
    resListFav.body.favorites.some(f => f.id === 'mch-01'),
    'Listado de comercios favoritos con metadatos de Yopal'
  );

  // 4. Eliminar de Favoritos
  const resDelFav = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/favorites/mch-01?user_id=usr-client-01',
    method: 'DELETE'
  });

  assert(
    resDelFav.status === 200 && resDelFav.body.is_favorite === false,
    'Comercio removido de favoritos limpiamente'
  );

  // 5. Retiro de Ganancias de Billetera a Nequi / Bre-B para Repartidor
  const resWithdraw = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/drivers/drv-01/withdraw',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    amount_cop: 20000,
    bre_b_key: '3123456781',
    account_type: 'nequi'
  });

  assert(
    resWithdraw.status === 200 &&
    resWithdraw.body.transaction_id &&
    typeof resWithdraw.body.new_balance === 'number',
    'Retiro de saldo de ganancias a Nequi / Bre-B procesado atómicamente'
  );

  // 6. Exportación de Reporte Financiero en CSV para SuperAdmin
  const resCsv = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/reports/financial.csv',
    method: 'GET'
  });

  assert(
    resCsv.status === 200 &&
    resCsv.headers['content-type'].includes('text/csv') &&
    resCsv.body.includes('Numero_Pedido,Fecha_Hora,Comercio'),
    'Exportación de reporte financiero diario en formato CSV para contabilidad'
  );

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO SUITE FAVORITOS & RETIROS: ${passed}/${total} pruebas pasadas (${Math.round(passed/total*100)}%)`);
  console.log('========================================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runFavoritesReorderAndWithdrawalsSuite().catch(err => {
  console.error('Error en suite favoritos:', err);
  process.exit(1);
});
