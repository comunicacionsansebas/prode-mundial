# Deploy en Vercel

Esta guia deja publicada la app del Prode Mundial en Vercel.

## 1. Validar localmente

Desde la carpeta del proyecto:

```powershell
cd "C:\Users\rrodr\Documents\New project"
npm.cmd install
npm.cmd run build
```

Si `npm.cmd run build` termina sin errores, la app esta lista para subir.

## 2. Subir el proyecto a GitHub

Crear un repositorio nuevo en GitHub, por ejemplo:

```text
prode-mundial
```

Luego, desde la carpeta del proyecto:

```powershell
git init
git add .
git commit -m "Primera version del prode mundial"
git branch -M main
git remote add origin URL_DEL_REPOSITORIO
git push -u origin main
```

`URL_DEL_REPOSITORIO` es la URL que GitHub muestra al crear el repo.

## 3. Crear proyecto en Vercel

1. Entrar a https://vercel.com
2. Click en **Add New...**
3. Click en **Project**
4. Importar el repositorio `prode-mundial`
5. Framework Preset: **Next.js**
6. Build Command: dejar por defecto
7. Output Directory: dejar por defecto

## 4. Configurar variables de entorno

En Vercel, antes de hacer deploy, abrir **Environment Variables** y cargar:

```env
NEXT_PUBLIC_SUPABASE_URL=https://riwhjghdnnsbynkwxumr.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_XA08zyLNx-9f_8Rsg7pO6Q_8r9oQJap
NEXT_PUBLIC_ADMIN_PIN=admin123
```

Recomendacion: cambiar `NEXT_PUBLIC_ADMIN_PIN` por un PIN interno antes de compartir la URL.

## 5. Deploy

Click en **Deploy**.

Cuando termine, Vercel va a mostrar una URL del estilo:

```text
https://prode-mundial.vercel.app
```

## 6. Probar en produccion

Abrir la URL de Vercel y revisar:

1. Registro de participante.
2. Carga de pronosticos con goles.
3. Ranking.
4. Admin con PIN.
5. Sincronizacion de resultados desde Google Sheets.
6. Sincronizacion de nuevos partidos desde Google Sheets.

## 7. Cambios futuros

Cada vez que se cambie el codigo:

```powershell
git add .
git commit -m "Descripcion del cambio"
git push
```

Vercel va a desplegar automaticamente la nueva version.
