# Pinned by digest as well as exact version, like apps/server/Dockerfile;
# Dependabot moves both together.
FROM node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable
WORKDIR /repo

# Same reasoning as apps/server/Dockerfile: a server-only change no longer
# invalidates the install layer. Keep the version in step with pnpm-lock.yaml.
FROM base AS prune
RUN npm install -g turbo@2.9.18
COPY . .
RUN turbo prune web --docker

FROM base AS deps
COPY --from=prune /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile

FROM deps AS build

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG MEDIA_ASSET_HOSTS

ARG SITE_NOINDEX
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    MEDIA_ASSET_HOSTS=${MEDIA_ASSET_HOSTS} \
    SITE_NOINDEX=${SITE_NOINDEX} \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=prune /repo/out/full/ ./

RUN pnpm turbo run build --filter=web

FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=4000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# `output: "standalone"` in next.config.ts plus `outputFileTracingRoot` pointed at
# the repository root — without the latter the traced tree omits the two workspace
# packages. The standalone server does NOT copy `public/` or `.next/static`, which
# is why they are three separate COPYs rather than one.
#
# --chown, because COPY lands root-owned and the process below is `node`. Next
# creates `.next/cache` lazily at runtime, so without this every `next/image`
# request throws `EACCES: permission denied, mkdir '/app/apps/web/.next/cache'`
# into the log, the optimiser cache never persists, and each request re-fetches
# and re-encodes. Observed in the built image, not assumed.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public

# The cache directory itself, since the traced tree does not carry one and the
# parent is only writable by root until the chowns above take effect.
RUN mkdir -p /app/apps/web/.next/cache && chown -R node:node /app/apps/web/.next

USER node
EXPOSE 4000

CMD ["node", "apps/web/server.js"]
