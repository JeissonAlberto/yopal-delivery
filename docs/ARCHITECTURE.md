# 🏗️ Arquitectura Técnica del Sistema — LUPIN Express

> **Plataforma de Logística, Comercio Electrónico y Domicilios en Tiempo Real**  
> **Ubicación:** Yopal, Casanare, Colombia  
> **Autor & Diseñador de Arquitectura:** Ing. Jeisson Alberto Sarmiento  
> **Versión:** 2.0 Pro Enterprise  

---

## 1. Diagrama de Arquitectura General

```
                                  ┌─────────────────────────────────────────┐
                                  │      CLIENTES & INTERFACES (PWA)        │
                                  │  - App Cliente (/client/)               │
                                  │  - Portal Aliado / Cocina (/merchant/)  │
                                  │  - App Domiciliario (/driver/)          │
                                  │  - Torre de Control NOC (/admin/)       │
                                  │  - Portal Login / Registro (/auth/)     │
                                  └────────────────────┬────────────────────┘
                                                       │
                                        HTTPS / WSS    │ REST / WebSockets
                                                       ▼
                                  ┌─────────────────────────────────────────┐
                                  │       CAPA DE ACCESO & SEGURIDAD        │
                                  │  - JWT Authentication Middleware        │
                                  │  - Rate Limiting & CORS Shield          │
                                  │  - Static Asset Caching (Service Worker)│
                                  └────────────────────┬────────────────────┘
                                                       │
                                                       ▼
                                  ┌─────────────────────────────────────────┐
                                  │           CORE BACKEND API              │
                                  │  - Express.js Engine (Node.js 22 LTS)   │
                                  │  - Socket.io Real-Time Event Broker     │
                                  │  - Order Dispatch & Routing Service     │
                                  │  - Geo / Haversine Spatial Calculator   │
                                  │  - Settlement & Unit Economics Ledger   │
                                  └────────────┬───────────────┬────────────┘
                                               │               │
                      ┌────────────────────────┘               └────────────────────────┐
                      ▼                                                                 ▼
        ┌───────────────────────────┐                                     ┌───────────────────────────┐
        │   CAPA DE PERSISTENCIA    │                                     │     CACHE & PUB/SUB       │
        │ - SQLite (Desarrollo)     │                                     │ - Redis 7 (Producción)    │
        │ - PostgreSQL 16 + PostGIS │                                     │ - Telemetría GPS en vivo  │
        │   (Producción EPSG:4326)  │                                     │ - Sincronización de salas │
        └───────────────────────────┘                                     └───────────────────────────┘
```

---

## 2. Componentes del Ecosistema

### 2.1 Backend & APIs REST
* **Framework:** Express.js sobre Node.js 22 LTS (Arquitectura modular basada en micro-servicios desacoplados).
* **Módulos de Negocio:**
  * `auth`: Emisión y validación de tokens JWT (`HS256`) con perfiles de usuario (`client`, `driver`, `merchant_admin`, `superadmin`).
  * `merchants`: Catálogos, horarios de atención, tiempos estimados de preparación y geolocalización de aliados.
  * `products`: Gestión de platos, opciones/adicionales y conmutadores de disponibilidad en cocina.
  * `orders`: Máquina de estados finita del pedido, cálculo de recargos por zona, vueltas de efectivo y PIN OTP.
  * `drivers`: Telemetría GPS continua, control de caja de efectivo, liquidación de saldo y gamificación.
  * `zones`: Motor de zonificación de Yopal con polígonos y tarifas base + km adicional.
  * `errands`: Módulo de mandados punto a punto (*LUPIN Mandados Express*).
  * `coupons`: Motor de fidelización con descuentos porcentuales y topes máximos en pesos colombianos.
  * `admin`: Métricas en vivo (GMV, ganancia de plataforma, pasivos a restaurantes).

---

## 3. Protocolo de Eventos en Tiempo Real (WebSockets / Socket.io)

El sistema opera bajo un modelo **Event-Driven** mediante salas dinámicas (*Rooms*):

| Evento | Emisor | Destinatario / Sala | Payload | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `join:order` | Cliente / Repartidor | `order:{orderId}` | `orderId` | Suscribe al socket al canal privado de la orden. |
| `join:merchant` | Tablet Cocina | `merchant:{merchantId}` | `merchantId` | Suscribe al restaurante para alertas sonoras. |
| `join:driver` | App Domiciliario | `driver:{driverId}` | `driverId` | Suscribe al repartidor para ofertas de radar. |
| `join:admin` | Torre de Control | `admin_channel` | - | Suscribe al NOC para monitoreo satelital global. |
| `driver:update_location` | App Repartidor | Servidor | `{ driverId, orderId, lat, lng, heading, speed }` | Transmite telemetría GPS cada 1-3 segundos. |
| `driver:location_changed` | Servidor | `order:{orderId}` | `{ driverId, lat, lng, heading }` | Mueve el icono de la moto en el mapa del cliente. |
| `order:new` | Servidor | `merchant:{merchantId}` | `{ order, sound }` | Dispara el timbre de nueva comanda en la cocina. |
| `order:assigned` | Servidor | `driver:{driverId}` | `{ orderId, deliveryFee, ... }` | Dispara el radar de oferta entrante en el móvil. |
| `order:status_update` | Servidor | Global / Order | `{ orderId, status }` | Actualiza la barra de progreso en todas las apps. |
| `chat:send_message` | Cliente / Repartidor | Servidor | `{ orderId, senderRole, message }` | Envía mensaje instantáneo en el chat del pedido. |
| `chat:new_message` | Servidor | `order:{orderId}` | `{ id, senderRole, message, createdAt }` | Entrega el mensaje al destinatario en pantalla. |

---

## 4. Motor Geoespacial y Algorítmico (Yopal, Casanare)

### 4.1 Fórmula Haversine (Distancia Ortodrómica)
Implementada como **UDF (User Defined Function)** en SQLite y nativa en PostGIS:

$$d = 2r \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$

* $r = 6371\text{ km}$ (Radio medio de la Tierra).
* $\phi_1, \phi_2$: Latitudes de origen y destino.
* $\lambda_1, \lambda_2$: Longitudes de origen y destino.

### 4.2 Zonificación y Tarifas en Yopal
```
               [ ZONA NORTE / LA CAMPIÑA / UNICENTRO ]
               Lat > 5.3450 | Tarifa: $4.500 COP
                             ▲
                             │
[ ZONA CENTRO / PARQUE SANTANDER ] ──► [ ZONA ORIENTE / AEROPUERTO / SIRIVANA ]
Lat: 5.3250 - 5.3450 | Tarifa: $4.000 COP        Lng > -72.3850 | Tarifa: $7.000 COP
                             │
                             ▼
               [ ZONA SUR / LLANO LINDO / LOS PROGRESOS ]
               Lat < 5.3250 | Tarifa: $5.000 COP
```

### 4.3 Algoritmo de Despacho Automático Inteligente
1. Al momento en que la cocina marca el pedido como `ready_for_pickup` (o `confirmed`), el sistema ejecuta `findNearestAvailableDrivers(merchantLat, merchantLng)`.
2. Filtra repartidores con `is_online = 1`, `is_busy = 0` y coordenadas activas.
3. Ordena por distancia euclidiana/haversine ascendente.
4. Asigna el pedido al repartidor óptimo y emite el evento `order:assigned` con sonido de radar.

---

## 5. Modelo de Datos Relacional (PostgreSQL + PostGIS / SQLite)

```
┌──────────────┐       ┌────────────────┐       ┌──────────────┐
│    users     │1     *│   merchants    │1     *│   products   │
├──────────────┤───────├────────────────┤───────├──────────────┤
│ id (PK)      │       │ id (PK)        │       │ id (PK)      │
│ name         │       │ user_id (FK)   │       │ merchant_id  │
│ email        │       │ name, slug     │       │ name, price  │
│ role         │       │ lat, lng       │       │ is_available │
└──────┬───────┘       └───────┬────────┘       └──────────────┘
       │1                      │1
       │*                      │*
┌──────┴───────────────────────┴────────┐       ┌──────────────┐
│                orders                 │1     *│ order_items  │
├───────────────────────────────────────┤───────├──────────────┤
│ id (PK), order_number                 │       │ id (PK)      │
│ client_id (FK), merchant_id (FK)      │       │ order_id (FK)│
│ driver_id (FK)                        │       │ product_name │
│ status, subtotal, delivery_fee, total │       │ quantity     │
│ payment_method, cash_change_due       │       │ unit_price   │
│ delivery_address, lat, lng            │       └──────────────┘
│ otp_code (PIN de 4 dígitos)           │
└──────┬────────────────────────────────┘
       │*
       │1
┌──────┴───────────────┐       ┌────────────────────────┐
│       drivers        │1     *│ driver_wallet_ledger   │
├──────────────────────┤───────├────────────────────────┤
│ id (PK), user_id(FK) │       │ id (PK), driver_id (FK)│
│ vehicle_type, plate  │       │ transaction_type       │
│ lat, lng, is_online  │       │ amount, description    │
│ balance_cash, rating │       │ created_at             │
└──────────────────────┘       └────────────────────────┘
```
