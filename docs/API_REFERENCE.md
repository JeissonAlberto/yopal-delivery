# 📡 Referencia de API REST — LUPIN Express

> **Host Local:** `http://localhost:3000`  
> **Headers Globales:** `Content-Type: application/json`  
> **Autenticación:** `Authorization: Bearer <jwt_token>` (Para endpoints protegidos)  

---

## 1. Módulo de Autenticación (`/api/auth`)

### 1.1 Iniciar Sesión (Login)
* **Endpoint:** `POST /api/auth/login`
* **Público:** Sí
* **Request Body:**
```json
{
  "email": "ana@yopal.com",
  "password": "yopal2026"
}
```
* **Response `200 OK`:**
```json
{
  "message": "Inicio de sesión exitoso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "usr-client-01",
    "name": "Ana María Gómez",
    "email": "ana@yopal.com",
    "phone": "3157890123",
    "role": "client"
  }
}
```

### 1.2 Registrar Usuario (Cliente o Repartidor)
* **Endpoint:** `POST /api/auth/register`
* **Request Body (Cliente):**
```json
{
  "name": "Pedro Páramo",
  "email": "pedro@yopal.com",
  "phone": "3109998877",
  "password": "securepassword",
  "role": "client"
}
```
* **Request Body (Repartidor):**
```json
{
  "name": "Juan Montoya",
  "email": "juan.driver@yopal.com",
  "phone": "3118887766",
  "password": "securepassword",
  "role": "driver",
  "vehicle_type": "moto",
  "plate_number": "JKL-88B"
}
```

### 1.3 Obtener Perfil Actual
* **Endpoint:** `GET /api/auth/me`
* **Headers:** `Authorization: Bearer <token>`
* **Response `200 OK`:** Retorna el objeto `user` con datos vinculados de `driver` o `merchant` si aplica.

---

## 2. Módulo de Comercios & Menús (`/api/merchants`)

### 2.1 Listar Comercios en Yopal con Cálculo de Distancia
* **Endpoint:** `GET /api/merchants`
* **Query Params:**
  * `category` *(opcional)*: e.g. `Carne a la Llanera`, `Comida Rápida`, `Farmacia`.
  * `search` *(opcional)*: Término de búsqueda de texto.
  * `lat` & `lng` *(recomendado)*: Coordenadas del cliente en Yopal para calcular tarifa de envío y tiempo estimado.
* **Ejemplo:** `GET /api/merchants?lat=5.3480&lng=-72.4010&category=Carne%20a%20la%20Llanera`
* **Response `200 OK`:**
```json
{
  "merchants": [
    {
      "id": "mch-01",
      "name": "Mamona & Tradición Llanera",
      "slug": "mamona-tradicion-llanera",
      "category": "Carne a la Llanera",
      "address": "Carrera 20 # 10-34, Centro Yopal",
      "lat": 5.3392,
      "lng": -72.3970,
      "is_open": 1,
      "rating": 4.9,
      "distanceKm": 1.07,
      "deliveryFee": 4000,
      "estimatedTime": 27
    }
  ]
}
```

### 2.2 Detalle de Comercio y Platos
* **Endpoint:** `GET /api/merchants/:idOrSlug`
* **Response `200 OK`:** Retorna objeto `merchant` + lista de `products` con opciones JSON.

### 2.3 Conmutar Tienda Abierta / Cerrada
* **Endpoint:** `PATCH /api/merchants/:id/toggle-open`
* **Response `200 OK`:** `{ "success": true, "is_open": 1 }`

---

## 3. Módulo de Pedidos (`/api/orders`)

### 3.1 Crear Nuevo Pedido
* **Endpoint:** `POST /api/orders`
* **Request Body:**
```json
{
  "client_name": "Mateo Cárdenas",
  "client_phone": "3204567890",
  "merchant_id": "mch-01",
  "items": [
    { "product_id": "prd-mch-01-1", "quantity": 2 }
  ],
  "payment_method": "cash",
  "cash_amount_to_pay_with": 100000,
  "delivery_address": "Calle 24 # 25-18, Barrio La Campiña",
  "delivery_reference": "Frente al parque de La Campiña, portón blanco",
  "delivery_lat": 5.3480,
  "delivery_lng": -72.4010,
  "tip_amount": 2000,
  "discount_amount": 6400
}
```
* **Response `201 Created`:**
```json
{
  "message": "Pedido creado exitosamente",
  "order": {
    "id": "ord-8fa291b4",
    "order_number": "YPL-7314",
    "status": "created",
    "subtotal": 64000,
    "discount_amount": 6400,
    "delivery_fee": 4000,
    "service_fee": 1000,
    "tip_amount": 2000,
    "total_amount": 64600,
    "cash_amount_to_pay_with": 100000,
    "cash_change_due": 35400,
    "otp_code": "2746"
  }
}
```

### 3.2 Avanzar Estado de la Orden
* **Endpoint:** `PATCH /api/orders/:id/status`
* **Request Body:** `{ "status": "preparing" }`
* **Estados válidos:** `created`, `confirmed`, `preparing`, `ready_for_pickup`, `driver_assigned`, `driver_at_merchant`, `on_the_way`, `delivered`, `cancelled`.

### 3.3 Validar Entrega con Código PIN OTP
* **Endpoint:** `POST /api/orders/:id/verify-otp`
* **Request Body:** `{ "otp_code": "2746" }`
* **Response `200 OK`:**
```json
{
  "success": true,
  "message": "¡Entrega confirmada exitosamente mediante código OTP!"
}
```

---

## 4. Módulo de Repartidores & Telemetría (`/api/drivers`)

### 4.1 Listar Repartidores Activos
* **Endpoint:** `GET /api/drivers/active`
* **Response `200 OK`:** Lista de conductores con coordenadas actuales, rumbo, velocidad, estado `is_online`, `is_busy` y calificación.

### 4.2 Transmitir Posición GPS (Telemetría)
* **Endpoint:** `POST /api/drivers/:id/location`
* **Request Body:**
```json
{
  "lat": 5.3440,
  "lng": -72.3990,
  "heading": 45,
  "speed": 28,
  "order_id": "ord-8fa291b4"
}
```

### 4.3 Consultar Billetera y Movimientos
* **Endpoint:** `GET /api/drivers/:id`
* **Response `200 OK`:** Retorna balance de efectivo en mano, ganancias netas y libro de transacciones `ledger`.

---

## 5. Módulo de LUPIN Mandados Express (`/api/errands`)

### 5.1 Crear Mandado Punto a Punto
* **Endpoint:** `POST /api/errands`
* **Request Body:**
```json
{
  "client_name": "Laura Restrepo",
  "client_phone": "3145566778",
  "title": "Llevar llaves urgentes",
  "description": "Recoger llaves en Unicentro y llevar a Llano Lindo",
  "pickup_address": "Unicentro Yopal",
  "pickup_lat": 5.3470,
  "pickup_lng": -72.4045,
  "dropoff_address": "Calle 30 # 21-50, Llano Lindo",
  "dropoff_lat": 5.3140,
  "dropoff_lng": -72.3995,
  "payment_method": "cash"
}
```
* **Response `201 Created`:** Retorna el mandado con código `#MND-XXXX` y tarifa calculada.

---

## 6. Módulo de Cupones & Fidelización (`/api/coupons`)

### 6.1 Validar Código Promocional
* **Endpoint:** `POST /api/coupons/validate`
* **Request Body:** `{ "code": "LUPINLLANERO", "subtotal": 50000 }`
* **Response `200 OK`:**
```json
{
  "valid": true,
  "code": "LUPINLLANERO",
  "discount_percent": 10.0,
  "discount_amount": 5000,
  "description": "10% de descuento en tu primer pedido"
}
```

---

## 7. Módulo de Torre de Control & Finanzas (`/api/admin`)

### 7.1 Métricas Financieras en Tiempo Real
* **Endpoint:** `GET /api/admin/metrics`
* **Response `200 OK`:**
```json
{
  "metrics": {
    "todayOrders": 4,
    "todayGmv": 540500,
    "todayDeliveryFees": 16000,
    "todayPlatformProfit": 72860,
    "todayMerchantPayout": 475640,
    "todayErrands": 4,
    "activeOrders": 0,
    "onlineDrivers": 3,
    "availableDrivers": 3,
    "openMerchants": 5
  }
}
```
