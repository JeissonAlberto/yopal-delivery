-- ============================================================================
-- YOPAL EXPRESS - PLATAFORMA DE DELIVERY INTEGRAL
-- Esquema de Base de Datos PostgreSQL + Extensión PostGIS para Producción
-- Ubicación: Yopal, Casanare, Colombia (EPSG:4326 - WGS84)
-- ============================================================================

-- 1. Habilitar extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. Enumeradores de Estado y Tipos
CREATE TYPE user_role AS ENUM ('client', 'merchant_admin', 'driver', 'superadmin');
CREATE TYPE order_status AS ENUM (
    'created',              -- Pedido creado por el cliente
    'confirmed',            -- Confirmado por el comercio
    'preparing',            -- En cocina / preparación
    'ready_for_pickup',     -- Listo para que el repartidor lo recoja
    'driver_assigned',      -- Repartidor aceptó la orden
    'driver_at_merchant',   -- Repartidor llegó al restaurante
    'on_the_way',           -- Repartidor recogió el pedido y va hacia el cliente
    'delivered',            -- Pedido entregado satisfactoriamente
    'cancelled'             -- Cancelado por cliente, comercio o admin
);
CREATE TYPE payment_method AS ENUM ('cash', 'nequi', 'daviplata', 'card_wompi', 'pse');
CREATE TYPE payment_status AS ENUM ('pending', 'approved', 'rejected', 'refunded');
CREATE TYPE vehicle_type AS ENUM ('moto', 'bicicleta', 'carro');
CREATE TYPE wallet_tx_type AS ENUM ('order_earning', 'cash_collected', 'commission_deducted', 'payout', 'recharge');

-- 3. Tabla de Usuarios
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'client',
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Zonas de Cobertura y Tarifas en Yopal
CREATE TABLE delivery_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    base_fare NUMERIC(10, 2) NOT NULL DEFAULT 4000.00,       -- Tarifa base (ej: $4.000 COP en zona urbana)
    per_km_fare NUMERIC(10, 2) NOT NULL DEFAULT 1200.00,     -- Recargo por km adicional
    min_order_amount NUMERIC(10, 2) NOT NULL DEFAULT 10000.00,
    boundary_geom GEOMETRY(Polygon, 4326),                   -- Polígono PostGIS delimitador de la zona
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_delivery_zones_geom ON delivery_zones USING GIST (boundary_geom);

-- 5. Comercios / Restaurantes Aliados
CREATE TABLE merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,                          -- 'Carne a la Llanera', 'Comida Rápida', 'Farmacia', etc.
    logo_url TEXT,
    banner_url TEXT,
    address VARCHAR(255) NOT NULL,
    zone_id UUID REFERENCES delivery_zones(id),
    location_geom GEOMETRY(Point, 4326) NOT NULL,            -- Coordenada exacta en Yopal (Lon, Lat)
    is_open BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    commission_rate NUMERIC(5, 2) DEFAULT 12.00,             -- % comisión (ej. 12% para Yopal)
    rating NUMERIC(3, 2) DEFAULT 4.8,
    prep_time_avg INT DEFAULT 25,                            -- Minutos promedio de preparación
    phone VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_merchants_geom ON merchants USING GIST (location_geom);

-- 6. Categorías de Menú y Productos
CREATE TABLE menu_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES menu_categories(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    image_url TEXT,
    is_available BOOLEAN DEFAULT TRUE,
    options_json JSONB DEFAULT '[]'::jsonb,                  -- Guarniciones: Yuca, plátano, salsas, término de carne
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Repartidores / Domiciliarios
CREATE TABLE drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_type vehicle_type NOT NULL DEFAULT 'moto',
    plate_number VARCHAR(15),
    national_id VARCHAR(20),
    current_location GEOMETRY(Point, 4326),
    heading NUMERIC(5, 2) DEFAULT 0.0,
    speed NUMERIC(5, 2) DEFAULT 0.0,
    is_online BOOLEAN DEFAULT FALSE,
    is_busy BOOLEAN DEFAULT FALSE,
    balance_cash_collected NUMERIC(12, 2) DEFAULT 0.00,      -- Efectivo que lleva recaudado de clientes
    balance_earnings NUMERIC(12, 2) DEFAULT 0.00,            -- Ganancias netas acumuladas a pagar
    rating NUMERIC(3, 2) DEFAULT 5.0,
    total_deliveries INT DEFAULT 0,
    last_ping_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_drivers_geom ON drivers USING GIST (current_location);

-- 8. Pedidos (Órdenes)
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(20) UNIQUE NOT NULL,                -- Ej: YPL-2026-0001
    client_id UUID NOT NULL REFERENCES users(id),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    driver_id UUID REFERENCES drivers(id),
    status order_status NOT NULL DEFAULT 'created',
    
    subtotal NUMERIC(10, 2) NOT NULL,
    delivery_fee NUMERIC(10, 2) NOT NULL,
    service_fee NUMERIC(10, 2) DEFAULT 1000.00,
    tip_amount NUMERIC(10, 2) DEFAULT 0.00,
    discount_amount NUMERIC(10, 2) DEFAULT 0.00,
    total_amount NUMERIC(10, 2) NOT NULL,
    
    payment_method payment_method NOT NULL DEFAULT 'cash',
    payment_status payment_status NOT NULL DEFAULT 'pending',
    cash_amount_to_pay_with NUMERIC(10, 2),                  -- Cliente paga con billete de $50.000
    cash_change_due NUMERIC(10, 2),                          -- Repartidor debe llevar vueltas de $15.000
    
    delivery_address VARCHAR(255) NOT NULL,
    delivery_reference TEXT,                                 -- Ej: Casa esquinera reja blanca junto a la panadería
    delivery_location GEOMETRY(Point, 4326) NOT NULL,        -- Coordenadas cliente en Yopal
    delivery_zone_id UUID REFERENCES delivery_zones(id),
    
    otp_code VARCHAR(6),                                     -- Código OTP de 4-6 dígitos para entrega segura
    proof_photo_url TEXT,
    cancel_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    prepared_at TIMESTAMP WITH TIME ZONE,
    picked_up_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_orders_delivery_geom ON orders USING GIST (delivery_location);
CREATE INDEX idx_orders_status ON orders(status);

-- 9. Ítems del Pedido
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    product_name VARCHAR(200) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL,
    selected_options_json JSONB DEFAULT '[]'::jsonb
);

-- 10. Billetera y Liquidaciones de Domiciliarios
CREATE TABLE driver_wallet_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id),
    transaction_type wallet_tx_type NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Mensajes de Chat en Vivo
CREATE TABLE order_chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    sender_role user_role NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. Historial de Telemetría GPS de Repartidores
CREATE TABLE driver_telemetry_history (
    id BIGSERIAL PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id),
    location_geom GEOMETRY(Point, 4326) NOT NULL,
    heading NUMERIC(5, 2),
    speed_kmh NUMERIC(5, 2),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_driver_telemetry_geom ON driver_telemetry_history USING GIST (location_geom);
