# 📱 GUÍA DE EXPORTACIÓN & DESPLIEGUE ANDROID (APK & PWA)
## LUPIN Express & LUPIN Repartidor • Yopal, Casanare, Colombia

Esta guía detalla los 2 métodos para que tanto la **App del Cliente** como la **App del Repartidor** funcionen en cualquier celular Android (Samsung, Xiaomi, Motorola, etc.).

---

## ⚡ OPCIÓN 1: Instalación PWA (Progressive Web App) — Inmediata y Sin Costo

Ambas aplicaciones están configuradas como **PWA certificadas**:

1. **App Cliente:** Abre Chrome en tu celular y entra a `https://tudominio.com/client/`.
   * Toca el menú de 3 puntos en Chrome y selecciona **"Instalar aplicación"** o **"Añadir a pantalla de inicio"**.
2. **App Repartidor:** Entra a `https://tudominio.com/driver/`.
   * Selecciona **"Instalar aplicación"**. La app se abrirá en pantalla completa sin barra de navegación de Chrome, con icono oficial y soporte de vibración en bolsillo.

---

## 📦 OPCIÓN 2: Generar APK Nativo con Capacitor & Android Studio

Para generar un archivo instalable `.apk` o subirlo a la Google Play Store:

### 1. Requisitos Previos en tu Computador
* **Node.js 20+**
* **Android Studio** (con SDK Android 13/14 y Java JDK 17)

### 2. Pasos para Compilar la App del Cliente (`com.lupinexpress.client`)
```bash
# 1. Instalar Capacitor CLI
npm install @capacitor/core @capacitor/cli @capacitor/android

# 2. Inicializar proyecto Android
npx cap add android

# 3. Sincronizar archivos y abrir en Android Studio
npx cap sync android
npx cap open android
```
En Android Studio:
* Menú **Build** ➔ **Build Bundle(s) / APK(s)** ➔ **Build APK(s)**.
* Tu archivo `.apk` quedará listo en `android/app/build/outputs/apk/debug/app-debug.apk`.

---

### 3. Pasos para Compilar la App del Repartidor (`com.lupinexpress.driver`)
```bash
# Sincronizar usando la configuración de repartidor
npx cap sync android --config capacitor.driver.config.json
npx cap open android
```

---

## 🛡️ Capacidades Nativas de Android Integradas:
* **Vibración Háptica:** `navigator.vibrate([200, 100, 200])` para alertar al repartidor de nuevos pedidos.
* **Pantalla Siempre Encendida (Wake Lock):** Evita que la pantalla se apague mientras el motorizado conduce en Yopal.
* **Telemetría GPS de Alta Precisión:** `watchPosition` a 60 FPS hacia la Torre de Control y Cliente.
* **Pasarela Llave Bre-B del Banco de la República:** Pagos inmediatos gratuitos e interoperables.
