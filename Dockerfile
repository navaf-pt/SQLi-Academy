# syntax=docker/dockerfile:1

# ---------- build stage ----------
# Vite + TypeScript compile the app into a static bundle. Dev dependencies are
# needed here, so NODE_ENV is deliberately left unset until the runtime stage.
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifests first so the dependency layer is cached independently of source.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# `npm run build` runs `tsc --noEmit` before Vite, so a type error fails the image.
RUN npm run build

# ---------- runtime stage ----------
# nginx serves the static files. There is no Node process, no database and no
# environment variables at runtime: every lab executes SQLite in the browser.
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

STOPSIGNAL SIGQUIT

CMD ["nginx", "-g", "daemon off;"]
