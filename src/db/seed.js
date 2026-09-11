const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db, initDatabase } = require('./database');

async function seedData(force = false) {
  initDatabase();

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0 && !force) {
    console.log('ℹ️ Base de datos ya contiene datos. Actualizando cupones, planes y verificando integridad...');
    ensureCoupons();
    ensureSubscriptionPlans();
    ensureReviewsAndResponses();
    return;
  }

  if (force) {
    console.log('🔄 Re-sembrando base de datos completa con datos auténticos de Yopal, Casanare...');
    db.prepare('DELETE FROM review_reports').run();
    db.prepare('DELETE FROM review_responses').run();
    db.prepare('DELETE FROM business_reviews').run();
    db.prepare('DELETE FROM promotions').run();
    db.prepare('DELETE FROM favorites').run();
    db.prepare('DELETE FROM audit_logs').run();
    db.prepare('DELETE FROM loyalty_points').run();
    db.prepare('DELETE FROM user_subscriptions').run();
    db.prepare('DELETE FROM subscription_plans').run();
    db.prepare('DELETE FROM order_items').run();
    db.prepare('DELETE FROM order_chat_messages').run();
    db.prepare('DELETE FROM driver_wallet_ledger').run();
    db.prepare('DELETE FROM driver_telemetry_history').run();
    db.prepare('DELETE FROM orders').run();
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM menu_categories').run();
    db.prepare('DELETE FROM errands').run();
    db.prepare('DELETE FROM coupons').run();
    db.prepare('DELETE FROM merchants').run();
    db.prepare('DELETE FROM drivers').run();
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM delivery_zones').run();
  }

  const passwordHash = await bcrypt.hash('yopal2026', 10);
  const adminPasswordHash = await bcrypt.hash('admin123', 10);

  // 1. Zonas de Entrega de Yopal con Polígonos de Cobertura
  const zones = [
    {
      id: 'zone-centro',
      name: 'Zona Centro / Parque Santander',
      description: 'Sector bancario, administrativo y comercial central (Cra 18 a 29, Cll 6 a 15)',
      base_fare: 4000,
      per_km_fare: 1200,
      min_order_amount: 10000
    },
    {
      id: 'zone-norte',
      name: 'Zona Norte / La Campiña / Unicentro',
      description: 'Sector residencial y comercial norte (La Campiña, Los Helechos, Unicentro, Cra 29)',
      base_fare: 4500,
      per_km_fare: 1300,
      min_order_amount: 12000
    },
    {
      id: 'zone-sur',
      name: 'Zona Sur / Llano Lindo / Los Progresos',
      description: 'Sector residencial sur, Villa Nelly, Los Progresos y salida a Morichal',
      base_fare: 5000,
      per_km_fare: 1400,
      min_order_amount: 15000
    },
    {
      id: 'zone-oriente',
      name: 'Zona Aeropuerto / Vereda El Morro / Sirivana',
      description: 'Sector suburbano, corredor gastronómico vía Sirivana y veredas cercanas',
      base_fare: 7000,
      per_km_fare: 1800,
      min_order_amount: 25000
    }
  ];

  const insertZone = db.prepare(`
    INSERT INTO delivery_zones (id, name, description, base_fare, per_km_fare, min_order_amount)
    VALUES (@id, @name, @description, @base_fare, @per_km_fare, @min_order_amount)
  `);
  zones.forEach(z => insertZone.run(z));

  // 2. Usuarios Base
  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, phone, password_hash, role, avatar_url)
    VALUES (@id, @name, @email, @phone, @password_hash, @role, @avatar_url)
  `);

  // Super Admin
  insertUser.run({
    id: 'usr-admin-01',
    name: 'SuperAdmin LUPIN Express',
    email: 'admin@yopalexpress.com',
    phone: '3101234567',
    password_hash: adminPasswordHash,
    role: 'superadmin',
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
  });

  // Clientes
  insertUser.run({
    id: 'usr-client-01',
    name: 'Ana María Gómez',
    email: 'ana@yopal.com',
    phone: '3157890123',
    password_hash: passwordHash,
    role: 'client',
    avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150'
  });

  insertUser.run({
    id: 'usr-client-02',
    name: 'Mateo Cárdenas',
    email: 'mateo@yopal.com',
    phone: '3204567890',
    password_hash: passwordHash,
    role: 'client',
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'
  });

  // Repartidores / Domiciliarios
  const driversData = [
    {
      id: 'drv-01',
      userId: 'usr-driver-01',
      name: 'Carlos "El Llanero" Rodríguez',
      email: 'carlos.driver@yopal.com',
      phone: '3123456781',
      vehicle: 'moto',
      plate: 'WXY-12E',
      lat: 5.3385,
      lng: -72.3962,
      earnings: 68000,
      cash: 115000,
      rating: 4.98,
      deliveries: 342
    },
    {
      id: 'drv-02',
      userId: 'usr-driver-02',
      name: 'Jhonatan Silva',
      email: 'jhonatan.driver@yopal.com',
      phone: '3123456782',
      vehicle: 'moto',
      plate: 'KJH-44F',
      lat: 5.3465,
      lng: -72.4040,
      earnings: 54000,
      cash: 82000,
      rating: 4.92,
      deliveries: 215
    },
    {
      id: 'drv-03',
      userId: 'usr-driver-03',
      name: 'Yeison Morales',
      email: 'yeison.driver@yopal.com',
      phone: '3123456783',
      vehicle: 'moto',
      plate: 'VBR-90C',
      lat: 5.3150,
      lng: -72.3980,
      earnings: 42000,
      cash: 45000,
      rating: 4.88,
      deliveries: 178
    }
  ];

  const insertDriver = db.prepare(`
    INSERT INTO drivers (id, user_id, name, phone, vehicle_type, plate_number, lat, lng, is_online, is_busy, balance_cash_collected, balance_earnings, rating, total_deliveries)
    VALUES (@id, @userId, @name, @phone, @vehicle, @plate, @lat, @lng, 1, 0, @cash, @earnings, @rating, @deliveries)
  `);

  driversData.forEach(d => {
    insertUser.run({
      id: d.userId,
      name: d.name,
      email: d.email,
      phone: d.phone,
      password_hash: passwordHash,
      role: 'driver',
      avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150'
    });
    insertDriver.run(d);
  });

  // 3. Comercios Auténticos de Yopal (Asaderos, Comida Rápida, Panaderías, Farmacias, Licores)
  const merchants = [
    {
      id: 'mch-01',
      name: 'Mamona & Tradición del Casanare',
      slug: 'mamona-tradicion-llanera',
      description: 'Carne a la llanera asada a fuego lento en fogón de leña, costillas criollas, chigüiro y plátano maduro con queso siete cueros.',
      category: 'Carne a la Llanera',
      logo_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=200',
      banner_url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
      address: 'Carrera 20 # 10-34, Centro Yopal',
      zone_name: 'Zona Centro / Parque Santander',
      lat: 5.3392,
      lng: -72.3970,
      is_open: 1,
      is_featured: 1,
      commission_rate: 12.0,
      rating: 4.95,
      prep_time_avg: 20,
      phone: '3114567890',
      products: [
        {
          name: 'Plato Mixto Llanero Especial (1 Libra)',
          description: 'Cortes seleccionados de ternera asada a la leña, costilla criolla y carne a la perra. Incluye yuca suave, plátano maduro con queso campesino y guacamole casanareño.',
          price: 32000,
          image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500',
          options: [
            { name: 'Término de la carne', choices: ['Bien asada (Típico Llanero)', 'Término medio jugosa', 'Tres cuartos'] },
            { name: 'Guarnición Extra', choices: ['Sin adición', 'Porción de Yuca al vapor (+$3.000)', 'Plátano asado con queso (+$3.500)', 'Guacamole criollo (+$2.500)'] }
          ]
        },
        {
          name: 'Costilla Criolla Ahumada (500g)',
          description: 'Costilla tierna sazonada con sal marina y macerada en hierbas de la sabana, dorada a fuego indirecto.',
          price: 28000,
          image_url: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=500',
          options: [
            { name: 'Bebida Acompañante', choices: ['Limonada de Panela bien fría', 'Gaseosa Postobón 400ml', 'Cerveza Águila Helada'] }
          ]
        },
        {
          name: 'Picada Llanera Familiar (4 Personas)',
          description: '1.5 kg de pura tradición: Mamona, lomo de cerdo criollo, chorizo campesino artesanal, chunchullo crocante, papa salada y ají de la casa.',
          price: 79000,
          image_url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500',
          options: []
        },
        {
          name: 'Cachama Frita del Río Cravo Sur',
          description: 'Cachama fresca crocante servida con patacones de plátano verde, arroz con coco y ensalada de aguacate.',
          price: 30000,
          image_url: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=500',
          options: []
        }
      ]
    },
    {
      id: 'mch-02',
      name: 'Asadero El Gavilán Llanero',
      slug: 'asadero-el-gavilan-llanero',
      description: 'El sabor tradicional de los hatos casanareños. Sancocho de gallina criolla campesina en leña y carne a la perra.',
      category: 'Carne a la Llanera',
      logo_url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=200',
      banner_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800',
      address: 'Calle 24 # 14-20, cerca a la Manga de Coleo, Yopal',
      zone_name: 'Zona Centro / Parque Santander',
      lat: 5.3420,
      lng: -72.3950,
      is_open: 1,
      is_featured: 1,
      commission_rate: 12.0,
      rating: 4.88,
      prep_time_avg: 22,
      phone: '3137788990',
      products: [
        {
          name: 'Sancocho de Gallina Criolla en Fogón de Leña',
          description: 'Sopa espesa con presa grande de gallina de campo, plátano verde, yuca, mazorca tierna, cilantro cimarrón y arroz blanco.',
          price: 26000,
          image_url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=500',
          options: []
        },
        {
          name: 'Carne a la Perra Tradicional (400g)',
          description: 'Carne desmechada de novillo envuelta en su propio cuero y asada durante horas a la brasa.',
          price: 34000,
          image_url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500',
          options: []
        }
      ]
    },
    {
      id: 'mch-03',
      name: 'Casanare Burger Co. (Artesanales)',
      slug: 'casanare-burger-co',
      description: 'Hamburguesas smash artesanales con carne 100% de novillo llanero, queso siete cueros fundido y pan brioche recién horneado.',
      category: 'Comida Rápida',
      logo_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200',
      banner_url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=800',
      address: 'CC Unicentro / Carrera 29 # 15-20, Yopal',
      zone_name: 'Zona Norte / La Campiña / Unicentro',
      lat: 5.3475,
      lng: -72.4045,
      is_open: 1,
      is_featured: 1,
      commission_rate: 15.0,
      rating: 4.92,
      prep_time_avg: 18,
      phone: '3148899001',
      products: [
        {
          name: 'Burger La Centauro Especial',
          description: '200g carne de res angus-cebú, doble queso campesino derretido, tocineta ahumada crujiente, cebolla caramelizada al ron y salsa especial de la casa.',
          price: 25000,
          image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500',
          options: [
            { name: 'Acompañamiento', choices: ['Papas a la francesa con paprika', 'Papas rústicas con queso', 'Yucas fritas crocantes'] }
          ]
        },
        {
          name: 'Monster Doble Smash BBQ Llanera',
          description: 'Doble smash de 130g cada una, cuádruple queso cheddar fundido, tocineta y salsa BBQ artesanal de panela y maracuyá.',
          price: 29500,
          image_url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=500',
          options: []
        },
        {
          name: 'Alitas BBQ y Maracuyá Criollo (12 Unid)',
          description: 'Alitas crocantes bañadas en salsa BBQ de reducción de maracuyá con bastones de apio fresco.',
          price: 27000,
          image_url: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=500',
          options: []
        }
      ]
    },
    {
      id: 'mch-04',
      name: 'Panadería & Pan de Arroz La Espiga',
      slug: 'panaderia-pan-de-arroz-la-espiga',
      description: 'El auténtico pan de arroz de Casanare caliente, tungos de plátano, buñuelos gigantes y café cerrero de la cordillera.',
      category: 'Panadería & Café',
      logo_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200',
      banner_url: 'https://images.unsplash.com/photo-1517433670267-08bbd4be890f?w=800',
      address: 'Carrera 19 # 11-15, Centro Yopal',
      zone_name: 'Zona Centro / Parque Santander',
      lat: 5.3380,
      lng: -72.3955,
      is_open: 1,
      is_featured: 0,
      commission_rate: 10.0,
      rating: 4.96,
      prep_time_avg: 12,
      phone: '3104433221',
      products: [
        {
          name: 'Paquete de Pan de Arroz Tradicional (Bolsa x 10)',
          description: 'Elaborado artesanalmente con arroz seleccionado y cuajada fresca del llano, crujiente y recién horneado.',
          price: 14000,
          image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500',
          options: []
        },
        {
          name: 'Tungos de Arroz y Plátano Maduro (4 Unidades)',
          description: 'Envueltos en hoja de plátano con masa de arroz, queso campesino y toque dulce de panela.',
          price: 12000,
          image_url: 'https://images.unsplash.com/photo-1517433670267-08bbd4be890f?w=500',
          options: []
        },
        {
          name: 'Café de Origen Casanareño Caliente (Termo 500ml)',
          description: 'Café cosechado en las estribaciones de la cordillera oriental de Casanare.',
          price: 8000,
          image_url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500',
          options: []
        }
      ]
    },
    {
      id: 'mch-05',
      name: 'Droguerías Copifam 24h Yopal',
      slug: 'droguerias-copifam-yopal',
      description: 'Farmacia 24 horas, medicamentos con fórmula médica, cuidado del bebé, analgésicos, sueros y primeros auxilios.',
      category: 'Farmacia',
      logo_url: 'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?w=200',
      banner_url: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800',
      address: 'Carrera 19 # 9-45, Centro Yopal',
      zone_name: 'Zona Centro / Parque Santander',
      lat: 5.3370,
      lng: -72.3950,
      is_open: 1,
      is_featured: 0,
      commission_rate: 10.0,
      rating: 4.90,
      prep_time_avg: 10,
      phone: '3109876543',
      products: [
        {
          name: 'Dolex Avanzado 500mg (Caja x 16)',
          description: 'Alivio rápido y eficaz de dolores de cabeza, fiebre y malestar general.',
          price: 14500,
          image_url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500',
          options: []
        },
        {
          name: 'Suero Oral Electrolit Fresa (625ml)',
          description: 'Solución rehidratante oral para el calor de Yopal y actividad física.',
          price: 9800,
          image_url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500',
          options: []
        }
      ]
    },
    {
      id: 'mch-06',
      name: 'Licores & Cervezas La Llanerita 24/7',
      slug: 'licores-la-llanerita-yopal',
      description: 'Aguardiente Llanero tapa azul frío, cervezas heladas a punto de nieve con hielo gratis para eventos.',
      category: 'Licores',
      logo_url: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?w=200',
      banner_url: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800',
      address: 'Carrera 23 # 12-10, Zona Rosa, Yopal',
      zone_name: 'Zona Centro / Parque Santander',
      lat: 5.3400,
      lng: -72.3925,
      is_open: 1,
      is_featured: 1,
      commission_rate: 14.0,
      rating: 4.94,
      prep_time_avg: 12,
      phone: '3156677889',
      products: [
        {
          name: 'Aguardiente Llanero Tapa Azul (Botella 750ml)',
          description: 'El auténtico aguardiente sin azúcar del Casanare con hielos de cortesía.',
          price: 45000,
          image_url: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?w=500',
          options: []
        },
        {
          name: 'Six-Pack Cerveza Corona Extra Helada',
          description: '6 botellas de 355ml a punto de nieve.',
          price: 28000,
          image_url: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=500',
          options: []
        }
      ]
    },
    {
      id: 'mch-07',
      name: 'Hotel Plaza Real Yopal',
      slug: 'hotel-plaza-real-yopal',
      description: 'Habitaciones ejecutivas con aire acondicionado inverter, piscina, wifi de alta velocidad y desayuno típico llanero incluido.',
      category: 'Hoteles & Hospedaje',
      logo_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200',
      banner_url: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800',
      address: 'Calle 9 # 21-35, Parque Santander, Yopal',
      zone_name: 'Zona Centro / Parque Santander',
      lat: 5.3469,
      lng: -72.3976,
      is_open: 1,
      is_featured: 1,
      commission_rate: 10.0,
      rating: 4.89,
      prep_time_avg: 15,
      phone: '3109988776',
      products: [
        {
          name: 'Noche Ejecutiva Sencilla (1 Huésped)',
          description: 'Cama doble, aire acondicionado, escritorio de trabajo, smart TV y desayuno tipo buffet.',
          price: 135000,
          image_url: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=500',
          options: []
        },
        {
          name: 'Suite Familiar Llanera (Hasta 4 Personas)',
          description: 'Dos ambientes con balcón hacia los cerros de Yopal, minibar y acceso a piscina.',
          price: 260000,
          image_url: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=500',
          options: []
        }
      ]
    },
    {
      id: 'mch-08',
      name: 'Ferretería El Tornillo & Madecentro Casanare',
      slug: 'ferreteria-el-tornillo-yopal',
      description: 'Materiales de construcción, herramientas eléctricas DeWalt, tornillería especializada, pinturas y plomería para hogar e industria.',
      category: 'Ferretería & Construcción',
      logo_url: 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=200',
      banner_url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800',
      address: 'Carrera 20 # 8-45, Centro Comercial Ferretero, Yopal',
      zone_name: 'Zona Centro / Parque Santander',
      lat: 5.3387,
      lng: -72.3957,
      is_open: 1,
      is_featured: 1,
      commission_rate: 8.0,
      rating: 4.91,
      prep_time_avg: 20,
      phone: '3114455667',
      products: [
        {
          name: 'Taladro Percutor Inalámbrico 20V + Maletín',
          description: 'Taladro percutor profesional con 2 baterías de litio, cargador rápido y set de brocas.',
          price: 245000,
          image_url: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=500',
          options: []
        },
        {
          name: 'Galón Pintura Tipo 1 Lavable Blanco Nieve',
          description: 'Pintura vinílica de alta cobertura para interiores y exteriores con acabado satinado.',
          price: 78000,
          image_url: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500',
          options: []
        }
      ]
    },
    {
      id: 'mch-09',
      name: 'Supermercado & Granero El Paraíso Yopal',
      slug: 'supermercado-el-paraiso-yopal',
      description: 'Frutas y verduras frescas del campo casanareño, carnes maduradas, abarrotes al por mayor y productos de canasta familiar.',
      category: 'Supermercados & Graneros',
      logo_url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200',
      banner_url: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800',
      address: 'Carrera 29 # 15-20 / CC Unicentro, Yopal',
      zone_name: 'Zona Norte / La Campiña / Unicentro',
      lat: 5.3475,
      lng: -72.4045,
      is_open: 1,
      is_featured: 1,
      commission_rate: 9.0,
      rating: 4.87,
      prep_time_avg: 25,
      phone: '3125566778',
      products: [
        {
          name: 'Mercado Canasta Familiar Básico Casanareño',
          description: 'Arroz 5kg, aceite 3L, frijol bola roja 1kg, panela 4 unidades, café 500g, azúcar 2.5kg y sal 1kg.',
          price: 88000,
          image_url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500',
          options: []
        },
        {
          name: 'Queso Siete Cueros Auténtico del Hato (1 Libra)',
          description: 'Queso hilado tradicional llanero elaborado con leche entera fresca no pasteurizada.',
          price: 18000,
          image_url: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=500',
          options: []
        }
      ]
    },
    {
      id: 'mch-10',
      name: 'TecnoLlanos & Mundo Móvil Yopal',
      slug: 'tecnollanos-mundo-movil-yopal',
      description: 'Accesorios para smartphones, cargadores rápidos certificados, audífonos bluetooth, servicio técnico y periféricos gamer.',
      category: 'Tecnología & Celulares',
      logo_url: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=200',
      banner_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800',
      address: 'Carrera 20 # 13-25, Centro, Yopal',
      zone_name: 'Zona Centro / Parque Santander',
      lat: 5.3395,
      lng: -72.3965,
      is_open: 1,
      is_featured: 1,
      commission_rate: 10.0,
      rating: 4.93,
      prep_time_avg: 15,
      phone: '3138899112',
      products: [
        {
          name: 'Cargador Rápido GaN 45W Type-C + Cable Trenzado',
          description: 'Cargador ultra compacto compatible con iPhone, Samsung y tablets con protección térmica.',
          price: 65000,
          image_url: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=500',
          options: []
        },
        {
          name: 'Audífonos Bluetooth con Cancelación de Ruido ENC',
          description: '30 horas de autonomía, estuche de carga inalámbrica y resistencia IPX5 al sudor.',
          price: 95000,
          image_url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=500',
          options: []
        }
      ]
    },
    {
      id: 'mch-11',
      name: 'Clínica Veterinaria & PetShop El Centauro',
      slug: 'veterinaria-el-centauro-yopal',
      description: 'Atención médica veterinaria para caninos y felinos, concentrados premium, desparasitantes y estética para mascotas en Yopal.',
      category: 'Salud, Mascotas & Veterinaria',
      logo_url: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=200',
      banner_url: 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?w=800',
      address: 'Calle 24 # 26-10, Barrio La Campiña, Yopal',
      zone_name: 'Zona Norte / La Campiña / Unicentro',
      lat: 5.3482,
      lng: -72.4010,
      is_open: 1,
      is_featured: 1,
      commission_rate: 10.0,
      rating: 4.96,
      prep_time_avg: 18,
      phone: '3147788223',
      products: [
        {
          name: 'Bulto Alimento Premium Perro Adulto (15kg) + Juguete',
          description: 'Nutrición balanceada con proteína real de pollo y arroz para pelaje brillante y digestión óptima.',
          price: 135000,
          image_url: 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=500',
          options: []
        },
        {
          name: 'Pastilla Antipulgas y Garrapatas NexGard Spectra (10-20kg)',
          description: 'Protección integral mensual contra pulgas, garrapatas y parásitos intestinales.',
          price: 52000,
          image_url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500',
          options: []
        }
      ]
    },
    {
      id: 'mch-12',
      name: 'Taller Motos & Repuestos La 24 Yopal',
      slug: 'motos-repuestos-la-24-yopal',
      description: 'Llantas, aceites Motul/Yamalube, kits de arrastre, frenos y mantenimiento express para motocicletas en Yopal.',
      category: 'Automotriz & Motos',
      logo_url: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=200',
      banner_url: 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=800',
      address: 'Calle 24 # 18-30, Corredor de Motos, Yopal',
      zone_name: 'Zona Centro / Parque Santander',
      lat: 5.3470,
      lng: -72.3990,
      is_open: 1,
      is_featured: 1,
      commission_rate: 8.0,
      rating: 4.90,
      prep_time_avg: 20,
      phone: '3159900334',
      products: [
        {
          name: 'Aceite Sintético Motul 7100 4T 10W40 (1 Litro)',
          description: 'Aceite 100% sintético con éster para protección de motor y embrague bajo altas temperaturas.',
          price: 48000,
          image_url: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=500',
          options: []
        },
        {
          name: 'Kit de Arrastre Reforzado Cadena Dorada O-Ring',
          description: 'Corona, piñón y cadena dorada reforzada para motos pulsar, fz y gixxer.',
          price: 110000,
          image_url: 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=500',
          options: []
        }
      ]
    }
  ];

  const insertMerchant = db.prepare(`
    INSERT INTO merchants (id, user_id, name, slug, description, category, logo_url, banner_url, address, zone_name, lat, lng, is_open, is_featured, commission_rate, rating, prep_time_avg, phone)
    VALUES (@id, @user_id, @name, @slug, @description, @category, @logo_url, @banner_url, @address, @zone_name, @lat, @lng, @is_open, @is_featured, @commission_rate, @rating, @prep_time_avg, @phone)
  `);

  const insertProduct = db.prepare(`
    INSERT INTO products (id, merchant_id, name, description, price, image_url, is_available, options_json)
    VALUES (@id, @merchant_id, @name, @description, @price, @image_url, @is_available, @options_json)
  `);

  merchants.forEach((m, idx) => {
    const merchantUserId = `usr-mch-0${idx + 1}`;
    insertUser.run({
      id: merchantUserId,
      name: `Gerente ${m.name}`,
      email: `${m.slug}@yopal.com`,
      phone: m.phone,
      password_hash: passwordHash,
      role: 'merchant_admin',
      avatar_url: m.logo_url
    });

    insertMerchant.run({
      ...m,
      user_id: merchantUserId
    });

    m.products.forEach((p, pIdx) => {
      insertProduct.run({
        id: `prd-${m.id}-${pIdx + 1}`,
        merchant_id: m.id,
        name: p.name,
        description: p.description,
        price: p.price,
        image_url: p.image_url,
        is_available: 1,
        options_json: JSON.stringify(p.options || [])
      });
    });
  });

  ensureCoupons();
  ensureSubscriptionPlans();
  ensureReviewsAndResponses();
  console.log('✅ Base de datos sembrada con 6 comercios icónicos, menú auténtico de Yopal, planes de suscripción y reseñas constructivas.');
}

function ensureSubscriptionPlans() {
  const insertPlan = db.prepare(`
    INSERT OR IGNORE INTO subscription_plans (
      id, audience, name, tier, price_cop, billing_interval,
      free_delivery_allowance, max_delivery_subsidy_cop, min_order_for_free_delivery,
      benefits_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Plan B2C Cliente Premium
  insertPlan.run(
    'plan-client-vip',
    'client',
    'Club LUPIN VIP (Cliente Premium)',
    'vip_premium',
    14900,
    'monthly',
    4,
    6000,
    25000,
    JSON.stringify([
      '4 Domicilios Gratis al mes en pedidos superiores a $25.000 COP',
      'Acceso exclusivo a cupones del 20% y 25% de descuento',
      'Atención prioritaria y soporte VIP por WhatsApp',
      '1.5x Puntos de Fidelización en cada pedido'
    ])
  );

  // Planes B2B Negocios
  insertPlan.run(
    'plan-merchant-basic',
    'merchant',
    'Plan Comercio Básico',
    'basic',
    0,
    'monthly',
    0,
    0,
    0,
    JSON.stringify([
      'Presencia en catálogo de comercios de Yopal',
      'Recepción de pedidos y KDS en cocina',
      'Recepción y respuesta a críticas constructivas',
      'Comisión estándar 12%'
    ])
  );

  insertPlan.run(
    'plan-merchant-pro',
    'merchant',
    'Plan Comercio Pro',
    'pro',
    49000,
    'monthly',
    0,
    0,
    0,
    JSON.stringify([
      'Comisión reducida al 10%',
      'Creación ilimitada de cupones y promociones flash',
      'Estadísticas y tendencias de ventas por hora',
      'Distintivo de Comercio Verificado'
    ])
  );

  insertPlan.run(
    'plan-merchant-vip',
    'merchant',
    'Plan Comercio VIP & Destacado',
    'vip_premium',
    99000,
    'monthly',
    0,
    0,
    0,
    JSON.stringify([
      'Comisión mínima del 8%',
      'Posicionamiento prioritario en sección Destacados',
      'Campañas de notificación push a miembros VIP',
      'Gerente de cuenta dedicado en Yopal'
    ])
  );

  // Sembrar suscripción VIP de prueba para usr-client-01
  db.prepare(`
    INSERT OR IGNORE INTO user_subscriptions (
      id, user_id, plan_id, status, free_deliveries_quota, free_deliveries_used, current_period_end
    ) VALUES (
      'sub-client-01', 'usr-client-01', 'plan-client-vip', 'active', 4, 0, datetime('now', '+30 days')
    )
  `).run();
}

function ensureReviewsAndResponses() {
  const insertReview = db.prepare(`
    INSERT OR IGNORE INTO business_reviews (
      id, business_id, user_id, user_name, rating,
      positive_aspects, improvement_aspects, recommendation,
      is_verified_purchase, status, helpful_votes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertReply = db.prepare(`
    INSERT OR IGNORE INTO review_responses (
      id, review_id, business_id, official_reply, responder_name
    ) VALUES (?, ?, ?, ?, ?)
  `);

  // Reseña 1 para Mamona & Tradición Llanera
  insertReview.run(
    'rev-01',
    'mch-01',
    'usr-client-01',
    'Cliente VIP Yopal',
    5,
    'La carne a la llanera llegó caliente, suave y con un término perfecto. La porción de yuca y plátano maduro con queso estaba abundante.',
    'El ají criollo llanero vino en un envase un poco pequeño para la porción de carne.',
    'Recomiendo agregar una opción en el menú para pedir porción extra de guacamole o ají llanero.',
    1,
    'published',
    12
  );

  insertReply.run(
    'rep-01',
    'rev-01',
    'mch-01',
    '¡Muchísimas gracias por su visita y recomendación, paisano! Ya hemos aumentado el tamaño de los recipientes de ají casero para todos los pedidos.',
    'Don Pedro (Asador Principal)'
  );

  // Reseña 2 para Casanare Burger Co.
  insertReview.run(
    'rev-02',
    'mch-03',
    'usr-client-01',
    'Cliente VIP Yopal',
    4,
    'La carne de novillo llanero tiene un sabor ahumado espectacular y el pan brioche es suave.',
    'Las papas a la francesa llegaron un poco tibias debido al tráfico en la Carrera 29.',
    'Sugeriría mejorar el sellado térmico de las bolsas de las papas para mantener el crocante.',
    1,
    'published',
    8
  );

  insertReply.run(
    'rep-02',
    'rev-02',
    'mch-03',
    'Gracias por su crítica constructiva. Implementamos nuevos empaques microperforados que conservan el calor sin ablandar las papas.',
    'Equipo de Cocina Casanare Burger'
  );
}

function ensureCoupons() {
  const insertCoupon = db.prepare(`
    INSERT OR IGNORE INTO coupons (id, code, discount_percent, max_discount, min_order_amount, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertCoupon.run('cpn-01', 'LUPINLLANERO', 10.0, 10000, 20000, '10% de descuento en tu primer pedido de carne llanera o comida rápida');
  insertCoupon.run('cpn-02', 'YOPAL2026', 15.0, 15000, 30000, '15% de descuento especial de lanzamiento en Casanare');
}

if (require.main === module) {
  const force = process.argv.includes('--force');
  seedData(force)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Error seeding DB:', err);
      process.exit(1);
    });
}

module.exports = { seedData };
