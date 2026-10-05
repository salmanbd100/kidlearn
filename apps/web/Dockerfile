FROM node:22-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/i18n/package.json packages/i18n/
COPY packages/tokens/package.json packages/tokens/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

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

COPY . .

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
