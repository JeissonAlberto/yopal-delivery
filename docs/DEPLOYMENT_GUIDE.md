# 🚀 Guía de Despliegue en Producción — LUPIN Express

> **Guía técnica paso a paso para desplegar en un Servidor VPS Linux (Ubuntu 22.04 / 24.04 LTS o Proxmox VM)**  
> **Autor:** Ing. Jeisson Alberto Sarmiento  

---

## 1. Requisitos Previos del Servidor

* **Sistema Operativo:** Ubuntu 22.04 / 24.04 LTS o Debian 12.
* **Hardware Mínimo:** 2 vCPU, 4 GB RAM, 40 GB SSD.
* **Dominio apuntado:** `app.tudominio.com` (DNS tipo A hacia la IP pública del VPS).
* **Puertos Abiertos:** `80` (HTTP), `443` (HTTPS), `22` (SSH).

---

## 2. Opción A: Despliegue Automatizado con Docker Compose (Recomendado)

### 2.1 Clonar el Proyecto y Configurar Variables
```bash
git clone https://github.com/tu-usuario/yopal-delivery.git /opt/lupin-express
cd /opt/lupin-express
```

### 2.2 Crear el Archivo `.env` de Producción
```bash
cat << 'EOF' > .env
PORT=3000
NODE_ENV=production
JWT_SECRET=clave_secreta_super_segura_lupin_2026_casanare
DATABASE_URL=postgres://yopal_user:yopal_secure_pass_2026@db:5432/yopal_delivery_db
REDIS_URL=redis://redis:6379
EOF
```

### 2.3 Iniciar los Contenedores
```bash
docker compose up -d --build
```
Esto levantará:
* 🌐 `yopal_express_api` (Node.js Express + Socket.io en puerto 3000).
* 🐘 `yopal_express_postgis` (PostgreSQL 16 con PostGIS y esquema `schema_postgis.sql` importado).
* ⚡ `yopal_express_redis` (Redis 7 para telemetría y Pub/Sub).

---

## 3. Configuración de Nginx como Reverse Proxy con SSL (Let's Encrypt)

### 3.1 Instalar Nginx y Certbot
```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
```

### 3.2 Crear Archivo de Configuración de Nginx
```nginx
# /etc/nginx/sites-available/lupin-express
server {
    server_name delivery.tudominio.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Soporte WebSockets para Socket.io
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 3.3 Habilitar el Sitio y Emitir Certificado SSL
```bash
sudo ln -s /etc/nginx/sites-available/lupin-express /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d delivery.tudominio.com
```

---

## 4. Comandos Útiles de Mantenimiento

* **Ver Logs en Tiempo Real:**
  ```bash
  docker compose logs -f app
  ```
* **Realizar Backup de Base de Datos PostgreSQL:**
  ```bash
  docker compose exec db pg_dump -U yopal_user yopal_delivery_db > backup_$(date +%Y%m%d).sql
  ```
* **Reiniciar el Servicio:**
  ```bash
  docker compose restart app
  ```
