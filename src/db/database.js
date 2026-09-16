const Database = require('better-sqlite3');
const config = require('../config');

const db = new Database(config.DB_FILE);

// High-performance Pragmas for Maximum Concurrency & Low Latency
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64MB memory cache
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 268435456'); // 256MB memory mapped I/O
db.pragma('busy_timeout = 10000'); // 10s wait before busy error
db.pragma('foreign_keys = ON');

// Register Custom User Defined Functions for Geospatial calculations
// Haversine distance in Kilometers
db.function('haversine_km', (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
});

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client', -- 'client', 'merchant_admin', 'driver', 'superadmin'
      avatar_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS delivery_zones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      base_fare REAL NOT NULL DEFAULT 4000.00,
      per_km_fare REAL NOT NULL DEFAULT 1200.00,
      min_order_amount REAL NOT NULL DEFAULT 10000.00,
      polygon_geojson TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      category TEXT NOT NULL, -- 'Carne a la Llanera', 'Comida Rápida', 'Farmacia', 'Supermercado', 'Licores', 'Desayunos & Café'
      logo_url TEXT,
      banner_url TEXT,
      address TEXT NOT NULL,
      zone_name TEXT DEFAULT 'Zona Centro',
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      is_open INTEGER DEFAULT 1,
      is_featured INTEGER DEFAULT 0,
      commission_rate REAL DEFAULT 12.0,
      rating REAL DEFAULT 4.8,
      prep_time_avg INTEGER DEFAULT 25,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS menu_categories (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      category_id TEXT REFERENCES menu_categories(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      image_url TEXT,
      is_available INTEGER DEFAULT 1,
      options_json TEXT DEFAULT '[]', -- modif: término de carne, salsas, bebida
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      vehicle_type TEXT NOT NULL DEFAULT 'moto', -- 'moto', 'bicicleta', 'carro'
      plate_number TEXT,
      national_id TEXT,
      lat REAL,
      lng REAL,
      heading REAL DEFAULT 0.0,
      speed REAL DEFAULT 0.0,
      is_online INTEGER DEFAULT 0,
      is_busy INTEGER DEFAULT 0,
      balance_cash_collected REAL DEFAULT 0.00,
      balance_earnings REAL DEFAULT 0.00,
      rating REAL DEFAULT 5.0,
      total_deliveries INTEGER DEFAULT 0,
      current_order_id TEXT,
      last_ping_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      client_id TEXT NOT NULL REFERENCES users(id),
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      merchant_id TEXT NOT NULL REFERENCES merchants(id),
      merchant_name TEXT NOT NULL,
      driver_id TEXT REFERENCES drivers(id),
      driver_name TEXT,
      driver_phone TEXT,
      status TEXT NOT NULL DEFAULT 'created', 
      -- 'created', 'confirmed', 'preparing', 'ready_for_pickup', 'driver_assigned', 'driver_at_merchant', 'on_the_way', 'delivered', 'cancelled'
      
      subtotal REAL NOT NULL,
      delivery_fee REAL NOT NULL,
      service_fee REAL DEFAULT 1000.00,
      tip_amount REAL DEFAULT 0.00,
      discount_amount REAL DEFAULT 0.00,
      total_amount REAL NOT NULL,
      
      payment_method TEXT NOT NULL DEFAULT 'cash', -- 'cash', 'nequi', 'daviplata', 'card_wompi'
      payment_status TEXT NOT NULL DEFAULT 'pending',
      cash_amount_to_pay_with REAL,
      cash_change_due REAL,
      
      delivery_address TEXT NOT NULL,
      delivery_reference TEXT,
      delivery_lat REAL NOT NULL,
      delivery_lng REAL NOT NULL,
      delivery_zone TEXT,
      
      otp_code TEXT, -- 4 digit PIN
      proof_photo_url TEXT,
      cancel_reason TEXT,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME,
      prepared_at DATETIME,
      picked_up_at DATETIME,
      delivered_at DATETIME,
      cancelled_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      selected_options_json TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS driver_wallet_ledger (
      id TEXT PRIMARY KEY,
      driver_id TEXT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
      order_id TEXT,
      transaction_type TEXT NOT NULL, -- 'order_earning', 'cash_collected', 'commission_deducted', 'payout'
      amount REAL NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_chat_messages (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL,
      sender_role TEXT NOT NULL, -- 'client', 'driver', 'merchant_admin', 'support'
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS driver_telemetry_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id TEXT NOT NULL,
      order_id TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      heading REAL,
      speed_kmh REAL,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Módulo LUPIN Mandados / Favores Express (Punto a Punto en Yopal)
    CREATE TABLE IF NOT EXISTS errands (
      id TEXT PRIMARY KEY,
      errand_number TEXT UNIQUE NOT NULL,
      client_id TEXT NOT NULL,
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      driver_id TEXT REFERENCES drivers(id),
      driver_name TEXT,
      title TEXT NOT NULL, -- 'Llevar llaves', 'Pagar recibo Enerca', 'Comprar medicina puntual'
      description TEXT NOT NULL,
      pickup_address TEXT NOT NULL,
      pickup_lat REAL NOT NULL,
      pickup_lng REAL NOT NULL,
      dropoff_address TEXT NOT NULL,
      dropoff_lat REAL NOT NULL,
      dropoff_lng REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'created', -- 'created', 'driver_assigned', 'in_progress', 'completed', 'cancelled'
      distance_km REAL NOT NULL,
      fare_amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      otp_code TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    -- Cupones y Descuentos de Fidelización
    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      discount_percent REAL NOT NULL DEFAULT 10.0,
      max_discount REAL DEFAULT 10000.0,
      min_order_amount REAL DEFAULT 20000.0,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 1. Reseñas Estructuradas con Críticas Constructivas y Compra Verificada
    CREATE TABLE IF NOT EXISTS business_reviews (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      order_id TEXT,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      positive_aspects TEXT,
      improvement_aspects TEXT,
      recommendation TEXT,
      is_verified_purchase INTEGER DEFAULT 0,
      status TEXT DEFAULT 'published' CHECK(status IN ('published', 'under_review', 'hidden', 'flagged')),
      helpful_votes INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (business_id) REFERENCES merchants(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- 2. Respuestas Oficiales del Comercio
    CREATE TABLE IF NOT EXISTS review_responses (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL UNIQUE,
      business_id TEXT NOT NULL,
      official_reply TEXT NOT NULL,
      responder_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (review_id) REFERENCES business_reviews(id),
      FOREIGN KEY (business_id) REFERENCES merchants(id)
    );

    -- 3. Reportes y Moderación Antifraude de Reseñas
    CREATE TABLE IF NOT EXISTS review_reports (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      reported_by TEXT NOT NULL,
      reason TEXT NOT NULL CHECK(reason IN ('offensive', 'spam', 'competitor_abuse', 'defamation', 'false_info')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'investigating', 'dismissed', 'action_taken')),
      moderator_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. Planes de Suscripción (B2C Cliente Premium y B2B Comercio)
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id TEXT PRIMARY KEY,
      audience TEXT NOT NULL CHECK(audience IN ('client', 'merchant')),
      name TEXT NOT NULL,
      tier TEXT NOT NULL CHECK(tier IN ('basic', 'pro', 'vip_premium')),
      price_cop INTEGER NOT NULL,
      billing_interval TEXT DEFAULT 'monthly',
      free_delivery_allowance INTEGER DEFAULT 0,
      max_delivery_subsidy_cop INTEGER DEFAULT 7000,
      min_order_for_free_delivery INTEGER DEFAULT 25000,
      benefits_json TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 5. Suscripciones Activas de Usuarios / Comercios
    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'past_due', 'cancelled', 'expired')),
      free_deliveries_quota INTEGER DEFAULT 0,
      free_deliveries_used INTEGER DEFAULT 0,
      current_period_start DATETIME DEFAULT CURRENT_TIMESTAMP,
      current_period_end DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
    );

    -- 6. Libro Mayor de Puntos de Fidelización (Points Ledger)
    CREATE TABLE IF NOT EXISTS loyalty_points (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      points_change INTEGER NOT NULL,
      reason TEXT NOT NULL,
      reference_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- 7. Promociones y Campañas Comerciales
    CREATE TABLE IF NOT EXISTS promotions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      banner_url TEXT,
      discount_percent REAL DEFAULT 0,
      discount_amount_fixed REAL DEFAULT 0,
      promo_type TEXT DEFAULT 'percentage' CHECK(promo_type IN ('percentage', 'fixed_amount', '2x1', 'free_shipping')),
      audience TEXT DEFAULT 'all' CHECK(audience IN ('all', 'vip_only', 'new_users')),
      is_vip_exclusive INTEGER DEFAULT 0,
      start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_date DATETIME NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    -- 8. Favoritos del Usuario
    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, merchant_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    -- 9. Logs de Auditoría y Seguridad
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 10. Pasarela de Pagos Digitales, Llaves Bre-B e Interoperabilidad Gratuita
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      subscription_id TEXT,
      user_id TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'bre_b', 'nequi', 'daviplata', 'transfiya', 'wompi_pse', 'wompi_card')),
      amount_cop INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'refunded', 'cancelled')),
      bre_b_key_type TEXT,
      bre_b_key_value TEXT,
      reference_code TEXT UNIQUE NOT NULL,
      approval_code TEXT,
      proof_photo_url TEXT,
      gateway_response_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- 11. Sistema de Webhooks e Integraciones Externas para Torre de Control SuperAdmin
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target_url TEXT NOT NULL,
      events_json TEXT NOT NULL,
      secret TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create Indexes for fast querying
    CREATE INDEX IF NOT EXISTS idx_merchants_category ON merchants(category);
    CREATE INDEX IF NOT EXISTS idx_products_merchant ON products(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
    CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders(driver_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_chat_order ON order_chat_messages(order_id);
    CREATE INDEX IF NOT EXISTS idx_errands_status ON errands(status);
    CREATE INDEX IF NOT EXISTS idx_reviews_business ON business_reviews(business_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_user ON business_reviews(user_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_status ON business_reviews(status);
    CREATE INDEX IF NOT EXISTS idx_subs_user ON user_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_promos_merchant ON promotions(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_promos_active ON promotions(is_active);
    CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(reference_code);
    CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
  `);
  
  console.log('✅ Base de datos SQLite inicializada exitosamente con soporte espacial Haversine.');
}

module.exports = {
  db,
  initDatabase
};
