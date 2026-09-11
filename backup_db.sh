#!/bin/bash
# ==============================================================================
# LUPIN EXPRESS - SCRIPT DE BACKUP AUTOMATIZADO DE BASE DE DATOS
# Ejecutable manualmente o mediante Cronjob diario en el VPS
# Autor: Ing. Jeisson Alberto Sarmiento • LUPIN Express © 2026
# ==============================================================================

BACKUP_DIR="/var/backups/lupin-express"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/lupin_db_backup_${DATE}.sql.gz"
RETENTION_DAYS=14 # Mantener backups durante 14 días

mkdir -p ${BACKUP_DIR}

echo "📦 Iniciando backup de la base de datos LUPIN Express (${DATE})..."

# Si se usa Docker Compose con PostGIS
if docker ps | grep -q "yopal_express_postgis"; then
    docker exec -t yopal_express_postgis pg_dump -U lupin_admin lupin_delivery_db | gzip > ${BACKUP_FILE}
# Si se usa SQLite local
elif [ -f "/opt/lupin-express/yopal_delivery.sqlite" ]; then
    gzip -c /opt/lupin-express/yopal_delivery.sqlite > ${BACKUP_FILE}
fi

if [ -f "${BACKUP_FILE}" ]; then
    FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "✅ Backup completado exitosamente: ${BACKUP_FILE} (${FILE_SIZE})"
    
    # Limpiar backups antiguos mayores a RETENTION_DAYS
    find ${BACKUP_DIR} -type f -name "lupin_db_backup_*.sql.gz" -mtime +${RETENTION_DAYS} -exec rm -f {} \;
    echo "🧹 Backups mayores a ${RETENTION_DAYS} días depurados."
else
    echo "❌ Error al generar el archivo de backup."
    exit 1
fi
