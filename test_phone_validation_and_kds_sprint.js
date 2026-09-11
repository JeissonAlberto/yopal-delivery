const { validateColombianPhone, calculateErrandFare, calculateDistanceKm } = require('./src/services/geo');
const { runAutomatedMaintenance } = require('./src/services/automation');

async function runPhoneAndKdsSprintSuite() {
  console.log('========================================================================');
  console.log('📱 SUITE DE NORMALIZACIÓN DE TELÉFONOS, TARIFAS DE MANDADOS Y CRON WAL');
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

  // 1. Validación de Celular Colombiano Válido (10 dígitos)
  const p1 = validateColombianPhone('3123456781');
  assert(p1.valid === true && p1.phone === '3123456781', 'Validación de celular nacional de 10 dígitos estándar');

  // 2. Normalización de Prefijo Internacional (+57)
  const p2 = validateColombianPhone('+57 310 987 6543');
  assert(p2.valid === true && p2.phone === '3109876543', 'Limpieza y normalización automática de prefijo +57 y espacios');

  // 3. Rechazo de Número Inválido / Falso
  const p3 = validateColombianPhone('12345');
  assert(p3.valid === false && p3.phone === null, 'Rechazo estricto de números incompletos o malformados');

  // 4. Tarifa Base de Mandado Express (<= 2 km)
  const feeBase = calculateErrandFare(1.5, false, false);
  assert(feeBase === 4000, 'Tarifa urbana base de Mandado Express ($4.000 COP)');

  // 5. Tarifa con Distancia Extra y Recargo Nocturno
  const feeNight = calculateErrandFare(4.5, true, false);
  // Base 4000 + (3 km extra * 1200 = 3600) + Noche 1500 = 9100 -> redondeado a 9500
  assert(feeNight === 9500, 'Cálculo dinámico con kilometraje adicional y recargo nocturno ($9.500 COP)');

  // 6. Mantenimiento Automático de Base de Datos y WAL Checkpoint
  try {
    runAutomatedMaintenance();
    assert(true, 'Ejecución exitosa de mantenimiento automático y PRAGMA wal_checkpoint(TRUNCATE)');
  } catch(e) {
    assert(false, 'Falla en mantenimiento automático');
  }

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO SUITE TELÉFONOS & MANDADOS: ${passed}/${total} pruebas pasadas (${Math.round(passed/total*100)}%)`);
  console.log('========================================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runPhoneAndKdsSprintSuite().catch(err => {
  console.error('Error en suite:', err);
  process.exit(1);
});
