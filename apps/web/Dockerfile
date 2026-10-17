# syntax=docker/dockerfile:1.7
# Node.js 24.22.0 LTS on Debian 13 (trixie), pinned by digest (D-25 / PHASE1_VERSION_VERIFICATION.md).
FROM node:24.22.0-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315 AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json .npmrc ./
# Optional BuildKit secret `ca_bundle` for networks that intercept TLS (never baked into the image).
RUN --mount=type=secret,id=ca_bundle,required=false \
    if [ -s /run/secrets/ca_bundle ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_bundle; fi; \
    npm ci --ignore-scripts

# ---- development image (source is bind-mounted by Compose) ----
FROM base AS dev
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
RUN mkdir -p .next && chown node:node .next
USER node
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---- production build ----
FROM deps AS build
COPY . .
RUN npm run build

FROM base AS prod
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/design-system').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
