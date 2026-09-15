# 📱 GUÍA DE COMPILACIÓN NATIVA DE APKS ANDROID (STUDIO & CLI)
## LUPIN Express & LUPIN Repartidor • Yopal, Casanare, Colombia

El repositorio cuenta con **2 proyectos nativos completos de Android Studio**:

1. 🍔 **`android/`** -> **LUPIN Express (App del Cliente)** — `com.lupinexpress.client`
2. 🛵 **`android-driver/`** -> **LUPIN Repartidor (App del Motorizado)** — `com.lupinexpress.driver`

---

### 🛠️ Estructura de Proyectos Nativos

```
yopal-delivery/
├── android/                   <--- Proyecto Android Nativo App Cliente
│   ├── build.gradle
│   ├── settings.gradle
│   └── app/
│       ├── build.gradle       (SDK 34, Android 14/15)
│       └── src/main/
│           ├── AndroidManifest.xml
│           └── java/com/lupinexpress/client/MainActivity.java
│
├── android-driver/            <--- Proyecto Android Nativo App Repartidor
│   ├── build.gradle
│   ├── settings.gradle
│   └── app/
│       ├── build.gradle       (SDK 34, Android 14/15)
│       └── src/main/
│           ├── AndroidManifest.xml (WAKE_LOCK, VIBRATE, GPS Background)
│           └── java/com/lupinexpress/driver/MainActivity.java (FLAG_KEEP_SCREEN_ON)
```

---

### 🔨 Opción A: Compilar en Android Studio (1 Clic)

1. Abre **Android Studio**.
2. Selecciona **Open** y escoge la carpeta `android/` (para el Cliente) o `android-driver/` (para el Repartidor).
3. En el menú superior, ve a:  
   👉 **Build** ➔ **Build Bundle(s) / APK(s)** ➔ **Build APK(s)**.
4. El archivo generado quedará en:  
   `android/app/build/outputs/apk/debug/app-debug.apk`  
   `android-driver/app/build/outputs/apk/debug/app-debug.apk`

---

### ☁️ Opción B: Compilación Automática en la Nube de GitHub Actions

El repositorio compila los binarios automáticamente con cada cambio:

1. Entra a tu repositorio:  
   👉 **[https://github.com/JeissonAlberto/yopal-delivery/actions](https://github.com/JeissonAlberto/yopal-delivery/actions)**
2. Selecciona **"Build Native Android APKs (Cliente & Repartidor)"**.
3. Haz clic en **"Run workflow"**.
4. Descarga los paquetes generados en la sección **Artifacts**.

---

### ⚡ Capacidades Nativas Especializadas:

* 🛵 **Motorizado / Moto:**
  * `FLAG_KEEP_SCREEN_ON`: La pantalla **no se apaga** mientras conduce la moto en Yopal con el soporte de manubrio.
  * `Vibrator Hardware Bridge`: Hace vibrar el teléfono en el bolsillo cuando entra una nueva alerta de pedido.
  * `High-Accuracy GPS WatchPosition`: Rastreo satelital con bajo consumo de batería.
* 🍔 **Cliente:**
  * Aceleración por hardware para mapas Leaflet a 60 FPS.
  * Soporte nativo de WebSockets y almacenamiento local persistente de canasta y PIN OTP.
