---
version: alpha
name: LUPIN Express Design System
description: Sistema de diseño estricto de 2 colores, física elástica y tipografía Plus Jakarta Sans de alto contraste WCAG AAA para comercio hiperlocal en Casanare.
colors:
  primary: "#EA580C"
  primary-hover: "#C2410C"
  secondary: "#10B981"
  secondary-hover: "#059669"
  dark-bg: "#090D16"
  dark-card: "#0F172A"
  dark-border: "#1E293B"
  light-bg: "#F8FAFC"
  light-card: "#FFFFFF"
  light-border: "#CBD5E1"
  text-light-main: "#090D16"
  text-light-muted: "#1E293B"
  text-dark-main: "#F8FAFC"
  text-dark-muted: "#94A3B8"
typography:
  h1:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "2rem"
    fontWeight: 900
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  h2:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  h3:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "1.125rem"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body-md:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
  badge-label:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "0.625rem"
    fontWeight: 900
    letterSpacing: "0.05em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "12px 20px"
---

## 1. Overview (Brand & Style)

**LUPIN Express** es la plataforma de comercio hiperlocal, reputación bayesiana y logística de última milla para Yopal, Casanare, Colombia. Diseñada bajo la filosofía **UI/UX Pro Max**: máxima simplicidad para el comensal, velocidad y resistencia para el motorizado, y control contable para el aliado.

---

## 2. Colors (Paleta Estricta de 2 Colores)

- **🟠 Naranja Primario (`#EA580C`):** Acciones clave, botones CTA, trazado de rutas, radar de pedidos y acento de marca.
- **🟢 Verde Esmeralda Secundario (`#10B981`):** Confirmaciones, verificación de entregas con PIN OTP, estados abiertos y saldo en billetera.
- **⚪ Modo Claro (High-Contrast WCAG AAA):** Fondo `#F8FAFC`, tarjetas `#FFFFFF`, texto principal `#090D16` y secundario `#1E293B` para legibilidad bajo luz solar de 35°C en Yopal.
- **⚫ Modo Noche (Deep Slate):** Fondo `#090D16`, tarjetas `#0F172A` y bordes `#1E293B`.

---

## 3. Typography (Plus Jakarta Sans)

- **Titulares:** `font-black` (peso 900) con interletrado condensado (`tracking-tight`).
- **Cuerpo:** `font-semibold` (peso 600) para máxima nitidez en pantallas de teléfonos en movimiento.
- **Etiquetas Semánticas:** `text-[10px] font-black uppercase tracking-wider`.

---

## 4. Layout & Spacing

- **Diseño Mobile-First:** Optimizado para pantallas de 375px a 430px (iPhone, Samsung Galaxy, Xiaomi) y responsive a tabletas y escritorios (1440px).
- **Áreas Táctiles Mínimas:** `44x44px` en todos los botones y selectores, garantizando operación con una sola mano o guantes de moto.

---

## 5. Elevation & Depth

- **Tarjetas Flotantes:** Sombra multicapa `0 4px 20px -2px rgba(15, 23, 42, 0.08)` con efecto hover lift `-translate-y-1`.
- **Cristalismo (Glassmorphism):** Cabeceras y barras fijas con `backdrop-blur-md bg-white/90 dark:bg-slate-900/90`.

---

## 6. Shapes & Physics

- **Curvas Físicas Fluidas:**
  - `--ease-spring: cubic-bezier(0.16, 1, 0.3, 1)` para modales y cajones desplegables.
  - Micro-prensado `active:scale-95` con respuesta táctil instantánea de 150ms.

---

## 7. Components

- **Buscador Universal en el Top:** Barra accesible en el primer segundo con limpieza en 1 toque `[ × ]`.
- **Selector de Barrios en 1 Toque:** Chips de acceso rápido (`La Campiña`, `Centro`, `Unicentro`, `Llano Lindo`, `Sirivana`).
- **Teclado OTP Gigante para Guantes:** Teclas de gran formato `[1..9, ⌫, 0, ✓]` para verificación de entregas.
- **Canasta Flotante Persistente:** Barra inferior con física de resorte mostrando el total en COP y botón directo de pago.

---

## 8. Do's and Don'ts

- ✅ **DO:** Utilizar siempre Pesos Colombianos (COP) redondeados a enteros sin decimales flotantes (`Math.round`).
- ✅ **DO:** Exigir PIN OTP y geovalla (< 250m) antes de marcar un pedido como entregado.
- ❌ **DON'T:** No usar texto gris claro o difuso sobre fondo blanco en Modo Claro.
- ❌ **DON'T:** No bloquear la pantalla del repartidor en ruta; mantener activa la API Screen Wake Lock.
