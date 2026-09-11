# 🛵 LUPIN Express — Plataforma de Delivery Integral para Yopal, Casanare

> **Desarrollador & Diseñador de Arquitectura:** Ing. Jeisson Alberto Sarmiento  
> **Empresa:** LUPIN Express © 2026 • Yopal, Casanare, Colombia.  
> **Versión:** 2.0 Pro Enterprise (UI/UX Pro Max Edition)  

Sistema integral de comercio electrónico, logística y entrega a domicilio estilo **Rappi / Uber Eats**, adaptado a las características geográficas, comerciales y de pago del municipio de **Yopal, Casanare, Colombia**.

---

## 📚 Índice de Documentación Técnica

* 🏗️ [**Arquitectura del Sistema & WebSockets (docs/ARCHITECTURE.md)**](docs/ARCHITECTURE.md): Diagrama general, protocolo Socket.io, motor geoespacial Haversine y modelo entidad-relación.
* 📡 [**Referencia de API REST (docs/API_REFERENCE.md)**](docs/API_REFERENCE.md): Especificación de todos los endpoints, payloads JSON, códigos HTTP y autenticación JWT.
* 💰 [**Modelo de Negocio & Unit Economics (docs/BUSINESS_MODEL_YOPAL.md)**](docs/BUSINESS_MODEL_YOPAL.md): Comisiones de aliados, tarifas por zonas en Yopal, control de caja de efectivo y liquidaciones Nequi.
* 🌐 [**Guía de Selección y Despliegue en VPS (docs/VPS_SETUP_GUIDE.md)**](docs/VPS_SETUP_GUIDE.md): Comparativa de los mejores VPS para Colombia (Hetzner, Oracle, DigitalOcean), script de 1 clic y SSL.
* 🚀 [**Guía de Despliegue en Producción (docs/DEPLOYMENT_GUIDE.md)**](docs/DEPLOYMENT_GUIDE.md): Despliegue con Docker Compose, PostgreSQL 16 + PostGIS, Redis y Nginx SSL con Let's Encrypt.
* 📖 [**Manual de Operación y Usuario (docs/USER_MANUAL.md)**](docs/USER_MANUAL.md): Guía paso a paso para Clientes, Cocinas, Repartidores y Administradores.

---

## 🌐 Portales y Aplicaciones en Vivo

Una vez iniciado el servidor (`npm start` o `node src/server.js`), accede a:

| Aplicación / Portal | URL Local | Descripción |
| :--- | :--- | :--- |
| 🎛️ **Hub Central de Portales** | [http://localhost:3000](http://localhost:3000) | Portada principal y selector de acceso rápido. |
| 🔐 **Login & Registro Multirrol** | [http://localhost:3000/auth/](http://localhost:3000/auth/) | Autenticación para Clientes, Repartidores y Admins. |
| 📱 **App Cliente (PWA Mobile)** | [http://localhost:3000/client/](http://localhost:3000/client/) | Catálogo de carnes llaneras, pin en mapa, checkout y tracking vivo con chat. |
| 🏬 **Portal Comercio / Cocina (KDS)** | [http://localhost:3000/merchant/](http://localhost:3000/merchant/) | Alerta sonora de comandas, Kanban de cocina y control de menú. |
| 🛵 **App Repartidor / Domiciliario** | [http://localhost:3000/driver/](http://localhost:3000/driver/) | Radar de ofertas, GPS en vivo, entrega con PIN OTP y control de caja. |
| 🛡️ **Torre de Control & NOC Super Admin** | [http://localhost:3000/admin/](http://localhost:3000/admin/) | Mapa satelital en vivo de Yopal, despacho manual y unit economics. |

---

## 🧪 Pruebas Automatizadas

El proyecto cuenta con 3 suites de pruebas automatizadas:

```bash
# 1. Probar Autenticación y JWT (13 pruebas)
node test_auth_full.js

# 2. Probar Ciclo de Vida de Pedidos y OTP (14 pruebas)
node test_order_lifecycle.js

# 3. Probar Suite Integral E2E con Cupones y Mandados (8 pruebas)
node test_e2e_flow.js
```

---

## 🐳 Despliegue Rápido con Docker Compose

```bash
docker compose up -d --build
```
Levanta el backend Node.js 22, PostgreSQL 16 con PostGIS y Redis 7 de forma autónoma.
