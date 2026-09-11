#!/bin/bash
# ==============================================================================
# LUPIN EXPRESS - SCRIPT DE DESPLIEGUE AUTOMÁTICO EN VPS LINUX
# Compatible con: Ubuntu 22.04 / 24.04 LTS y Debian 12
# Autor: Ing. Jeisson Alberto Sarmiento • LUPIN Express © 2026
# ==============================================================================

set -e

# Colores para salida de consola
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}========================================================================${NC}"
echo -e "${GREEN}🚀 INICIANDO INSTALACIÓN & DESPLIEGUE DE LUPIN EXPRESS EN VPS${NC}"
echo -e "${BLUE}   Ciudad: Yopal, Casanare, Colombia • Plataforma de Delivery 2026${NC}"
echo -e "${BLUE}========================================================================${NC}\n"

# 1. Verificar si se ejecuta como root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}❌ Por favor ejecuta este script como root (usa: sudo bash deploy_vps.sh)${NC}"
  exit 1
fi

# 2. Actualización del Sistema Operativo
echo -e "${YELLOW}[1/6] Actualizando repositorios y paquetes del sistema...${NC}"
apt update -y && apt upgrade -y
apt install -y curl wget git ufw htop net-tools ca-certificates gnupg lsb-release

# 3. Configuración del Firewall UFW (Seguridad)
echo -e "${YELLOW}[2/6] Configurando Firewall UFW (Puertos 22 SSH, 80 HTTP, 443 HTTPS)...${NC}"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 4. Instalación de Docker y Docker Compose
echo -e "${YELLOW}[3/6] Instalando Docker Engine y Docker Compose...${NC}"
if ! command -v docker &> /dev/null; then
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt update -y
    apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    echo -e "${GREEN}✅ Docker instalado exitosamente.${NC}"
else
    echo -e "${GREEN}✅ Docker ya se encuentra instalado.${NC}"
fi

# 5. Directorio de la Aplicación
APP_DIR="/opt/lupin-express"
echo -e "${YELLOW}[4/6] Configurando directorio de la aplicación en ${APP_DIR}...${NC}"
mkdir -p ${APP_DIR}

# Si el script se ejecuta dentro de la carpeta del proyecto, copiar los archivos
if [ -f "package.json" ]; then
    cp -ru . ${APP_DIR}/
fi

cd ${APP_DIR}

# Crear archivo .env si no existe
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Generando archivo .env con credenciales seguras...${NC}"
    JWT_SECRET_GEN=$(openssl rand -hex 32)
    DB_PASS_GEN=$(openssl rand -hex 16)
    cat << EOF > .env
PORT=3000
NODE_ENV=production
JWT_SECRET=${JWT_SECRET_GEN}
DATABASE_URL=postgres://lupin_admin:${DB_PASS_GEN}@db:5432/lupin_delivery_db
REDIS_URL=redis://redis:6379
EOF
    echo -e "${GREEN}✅ Archivo .env generado con JWT_SECRET seguro.${NC}"
fi

# 6. Construir y Levantar Contenedores Docker
echo -e "${YELLOW}[5/6] Construyendo contenedores (Node.js API + PostGIS + Redis)...${NC}"
docker compose -f docker-compose.prod.yml down --remove-orphans || true
docker compose -f docker-compose.prod.yml up -d --build

# 7. Verificación de Salud
echo -e "${YELLOW}[6/6] Verificando estado de los servicios...${NC}"
sleep 5

if docker compose -f docker-compose.prod.yml ps | grep -q "Up"; then
    echo -e "\n${GREEN}========================================================================${NC}"
    echo -e "${GREEN}🎉 ¡LUPIN EXPRESS SE DESPLEGÓ EXITOSAMENTE EN TU VPS!${NC}"
    echo -e "${GREEN}========================================================================${NC}"
    echo -e "🌐 Acceso HTTP Directo: http://$(curl -s ifconfig.me):3000"
    echo -e "📱 App Cliente:         http://$(curl -s ifconfig.me):3000/client/"
    echo -e "🏬 Portal Comercio:     http://$(curl -s ifconfig.me):3000/merchant/"
    echo -e "🛵 App Repartidor:      http://$(curl -s ifconfig.me):3000/driver/"
    echo -e "🛡️ Torre de Control:    http://$(curl -s ifconfig.me):3000/admin/"
    echo -e "🔐 Login / Registro:    http://$(curl -s ifconfig.me):3000/auth/"
    echo -e "\n${BLUE}Para configurar tu dominio y certificado SSL Let's Encrypt gratuito:${NC}"
    echo -e "👉 Sigue la guía en: ${APP_DIR}/docs/VPS_SETUP_GUIDE.md"
    echo -e "${GREEN}========================================================================${NC}\n"
else
    echo -e "${RED}⚠️ Hubo un detalle al iniciar los contenedores. Revisa con: docker compose logs${NC}"
fi
