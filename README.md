# Prode Mundial Interno

Web app simple para un prode interno de empresa, construida con Next.js, TypeScript y estilos CSS livianos.

## Funcionalidades incluidas

- Pantalla de inicio con logo, nombre del torneo y acceso de participantes.
- Acceso con email y contrasena mediante Supabase Auth.
- Importacion de empleados autorizados desde CSV en el panel admin.
- Fixture agrupado por fecha.
- Pronosticos por partido con cantidad de goles de cada equipo.
- Bloqueo automatico de edicion un minuto antes del inicio del partido.
- Ranking general ordenado por puntos y desempate por aciertos.
- Panel administrador separado en `/admin`.
- Carga y edicion de resultados reales.
- Importacion semi automatizada de resultados por CSV.
- Edicion de partidos y visibilidad de fechas.
- Carga de fase de grupos del Mundial 2026 desde el admin.

## Stack

- Next.js App Router
- TypeScript
- CSS global simple
- Persistencia compartida en Supabase
- Listo para deploy en Vercel

## Instalacion

```bash
npm install
```

## Ejecucion local

```bash
npm run dev
```

Luego abrir:

```text
http://localhost:3000
```

El panel administrador esta en:

```text
http://localhost:3000/admin
```

## Variables de entorno

Copiar `.env.example` a `.env.local` y completar las credenciales:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=tu_publishable_key
NEXT_PUBLIC_ADMIN_PIN=admin123
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_solo_servidor
```

`SUPABASE_SERVICE_ROLE_KEY` se usa solo en rutas de servidor para crear empleados desde el CSV. No debe exponerse en el navegador ni llevar prefijo `NEXT_PUBLIC_`.

Por simplicidad de primera version, el PIN tambien se usa para ingresar al panel admin. Para uso productivo con datos reales conviene reemplazarlo por autenticacion corporativa y validaciones mas fuertes del lado servidor.

## Supabase

Crear las tablas desde el panel de Supabase:

1. Entrar al proyecto en Supabase.
2. Abrir **SQL Editor**.
3. Crear una query nueva.
4. Pegar el contenido de `supabase-schema.sql`.
5. Ejecutar **Run**.

Despues reiniciar el servidor local de Next.js para que lea `.env.local`.

Desde `/admin` se puede usar **Cargar fase de grupos Mundial 2026** para reemplazar los partidos actuales por el fixture de fase de grupos. Esta accion limpia resultados y pronosticos previos para evitar inconsistencias.

Tambien desde `/admin` se puede importar resultados pegando CSV:

```csv
local,visitante,goles_local,goles_visitante
Mexico,Sudafrica,2,1
Argentina,Argelia,1,1
```

Tambien se puede sincronizar desde una Google Sheet publicada como web/CSV usando el campo de URL en el admin.

Para importar empleados autorizados desde `/admin`, usar un CSV con estas columnas:

```csv
nombre,apellido,email,area,password
Ana,Martinez,ana@empresa.com,Marketing,ClaveTemporal123
Lucas,Pereyra,lucas@empresa.com,Producto,ClaveTemporal123
```

Tambien se aceptan archivos separados por punto y coma y columnas `contraseña`, `contrasena` o `clave` en lugar de `password`.

Para importar nuevos partidos desde Google Sheets, usar una hoja con estas columnas:

```csv
fecha,hora,fase,local,visitante,visible
2026-06-29,16:00,Octavos,Argentina,Dinamarca,true
```

## Logo

El proyecto incluye `public/logo.svg` como placeholder con el texto "Logo empresa".

Para usar el logo real:

1. Reemplazar `public/logo.svg` por el SVG de la empresa.
2. O agregar `public/logo.png`. El componente intenta usar PNG primero y cae automaticamente al SVG.

## Estructura de datos

Los tipos principales estan en `src/lib/types.ts`:

- `User`: participantes.
- `Match`: partidos.
- `Prediction`: pronosticos.
- `MatchResult`: resultados reales.
- `Standing`: puntajes calculados.

La logica de puntajes esta en `src/lib/scoring.ts`.

- Marcador exacto: 12 puntos.
- Resultado correcto no exacto: 5 puntos.
- Goles exactos de un equipo: 2 puntos por equipo.

## Deploy en Vercel

Ver la guia paso a paso en `DEPLOY.md`.

Vercel detecta Next.js automaticamente. No hace falta configuracion extra para esta version.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run typecheck
```

## Siguiente paso recomendado

Para una version productiva, reemplazar el PIN del administrador por autenticacion corporativa o una lista de emails administradores.
