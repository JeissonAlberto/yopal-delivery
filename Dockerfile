# ============================================================================
# Dockerfile - Yopal Express Backend & Static Portals
# ============================================================================
FROM node:22-alpine

WORKDIR /app

# Instalar dependencias de compilación para paquetes nativos
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "src/server.js"]
