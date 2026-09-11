# 🌐 Guía Completa de Selección y Despliegue en VPS — LUPIN Express

> **Guía práctica paso a paso para adquirir un VPS y poner en producción la plataforma en Yopal, Casanare.**  
> **Autor:** Ing. Jeisson Alberto Sarmiento • LUPIN Express © 2026  

---

## 🏆 1. Comparativa de los Mejores Proveedores de VPS para Colombia

Para una plataforma de delivery en tiempo real con WebSockets y rastreo GPS continuo, la **latencia de red** y el **rendimiento de disco (NVMe)** son críticos.

| Proveedor | Ubicación Recomendada | Latencia a Colombia | Especificaciones Mínimas | Precio Aprox. | Ventajas Clave |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Hetzner Cloud** ⭐ *(Recomendado #1)* | **Ashburn, VA (EE.UU. Este)** | **~50 - 55 ms** | 3 vCPU AMD, 4 GB RAM, 80 GB NVMe | **~$6.50 USD / mes** (~$26.000 COP) | Mejor relación precio/potencia del mercado, discos NVMe ultrarrápidos. |
| **2. Oracle Cloud Free Tier** ⭐ *(Recomendado $0)* | **Bogotá (Colombia) o Ashburn** | **~15 ms (Bogotá) / 50 ms** | 4 OCPU ARM Ampere, 24 GB RAM, 200 GB | **$0 USD / mes (Gratis de por vida)** | Potencia masiva sin costo mensual en capa gratuita Always Free. |
| **3. DigitalOcean** | **Miami, FL (EE.UU.)** | **~45 ms** | 2 vCPU, 2-4 GB RAM, 60 GB SSD | **~$12.00 USD / mes** (~$48.000 COP) | Enrutamiento directo por fibra submarina Barranquilla-Miami. |
| **4. Hostinger VPS** | **EE.UU. Este** | **~55 ms** | 4 vCPU, 8 GB RAM, 100 GB NVMe | **~$6.99 USD / mes** (~$28.000 COP) | Permite pagar con métodos locales colombianos (PSE, Nequi, Efecty). |

---

## 🚀 2. Pasos para Comprar y Aprovisionar el VPS

1. **Crear cuenta en el proveedor elegido** (ej: [Hetzner Cloud](https://www.hetzner.com/cloud) o [DigitalOcean](https://www.digitalocean.com)).
2. **Crear un nuevo Servidor / Droplet:**
   * **Sistema Operativo:** `Ubuntu 24.04 LTS` o `Ubuntu 22.04 LTS`.
   * **Ubicación del Datacenter:** `Ashburn, VA` o `Miami, FL` (nunca elijas Europa o Asia por latencia).
   * **Tipo de Autenticación:** Clave SSH o Contraseña segura de root.
3. Copia la **dirección IP pública** asignada a tu servidor (ej: `198.51.100.25`).

---

## 💻 3. Conexión SSH desde tu Equipo (Windows / Git Bash)

Abre tu terminal Git Bash o PowerShell en tu PC y conéctate:

```bash
ssh root@198.51.100.25
```
*(Reemplaza `198.51.100.25` por la IP real de tu VPS e ingresa tu contraseña o clave SSH)*.

---

## 📦 4. Subir el Código al VPS y Desplegar en 1 Solo Paso

### Opción A: Subir los archivos directamente desde tu PC (vía SCP / Rsync)
En la terminal de tu equipo local (desde la carpeta `C:\Users\nocav\yopal-delivery`):

```bash
# Subir todo el proyecto comprimido al VPS
tar -czf lupin-express.tar.gz --exclude=node_modules --exclude=.git .
scp lupin-express.tar.gz root@198.51.100.25:/root/
```

Luego, dentro del VPS por SSH:

```bash
mkdir -p /opt/lupin-express
tar -xzf /root/lupin-express.tar.gz -C /opt/lupin-express
cd /opt/lupin-express
chmod +x deploy_vps.sh backup_db.sh
sudo bash deploy_vps.sh
```

### Opción B: Si tienes el repositorio en GitHub
Dentro del VPS por SSH:

```bash
git clone https://github.com/tu-usuario/yopal-delivery.git /opt/lupin-express
cd /opt/lupin-express
chmod +x deploy_vps.sh backup_db.sh
sudo bash deploy_vps.sh
```

El script `deploy_vps.sh` se encargará automáticamente de:
1. Actualizar el sistema e instalar utilidades esenciales.
2. Configurar el Firewall UFW (puertos 22, 80 y 443).
3. Instalar la última versión de Docker Engine y Docker Compose.
4. Generar claves secretas seguras para JWT y PostgreSQL.
5. Construir y levantar los 3 contenedores (**Node.js API**, **PostgreSQL 16 + PostGIS**, **Redis 7**).

---

## 🔒 5. Configurar tu Dominio y Certificado SSL HTTPS Gratuito

1. **Apuntar tu Dominio en tu proveedor DNS (Cloudflare, GoDaddy, Namecheap):**
   * Tipo `A` ➔ Nombre `delivery` ➔ Valor: `198.51.100.25` (IP de tu VPS).
2. **Instalar Nginx y Certbot en el VPS:**
   ```bash
   sudo apt install -y nginx certbot python3-certbot-nginx
   sudo cp /opt/lupin-express/nginx/lupin-express.conf /etc/nginx/sites-available/lupin-express
   ```
3. **Editar el dominio en la configuración:**
   ```bash
   sudo nano /etc/nginx/sites-available/lupin-express
   # Cambia 'delivery.tudominio.com' por tu dominio real
   ```
4. **Habilitar y generar certificado SSL:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/lupin-express /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d delivery.tudominio.com
   ```

---

## 🔄 6. Programar Backups Diarios Automáticos (Cronjob)

En el VPS, abre el programador de tareas:

```bash
sudo crontab -e
```
Agrega la siguiente línea al final para respaldar la base de datos todas las noches a las 2:00 AM:

```cron
0 2 * * * /opt/lupin-express/backup_db.sh >> /var/log/lupin_backup.log 2>&1
```

---

## 🛠️ Comandos de Monitoreo del Servidor

* **Ver estado de los contenedores:**
  ```bash
  docker compose -f /opt/lupin-express/docker-compose.prod.yml ps
  ```
* **Ver logs del backend en vivo:**
  ```bash
  docker compose -f /opt/lupin-express/docker-compose.prod.yml logs -f app
  ```
* **Reiniciar la aplicación:**
  ```bash
  docker compose -f /opt/lupin-express/docker-compose.prod.yml restart app
  ```
