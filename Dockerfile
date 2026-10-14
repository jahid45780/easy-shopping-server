# syntax=docker/dockerfile:1

# ── Build stage: install all deps and compile TypeScript ──────────────
FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_ENV=development
COPY package*.json ./
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm ci --include=dev    # force devDependencies (typescript) even if NODE_ENV=production is injected
COPY . .
RUN npm run build          # tsc -> ./dist

# ── Runtime stage: production dependencies only ───────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# Uploaded images are written here at runtime and served from /uploads.
# ⚠️ Mount a PERSISTENT volume at /app/uploads in Coolify, otherwise every
#    rebuild/redeploy wipes all previously-uploaded images.
RUN mkdir -p /app/uploads

EXPOSE 5000
CMD ["node", "dist/src/server.js"]
