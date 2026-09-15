# ESCAPE HATCH ONLY. Nothing deploys this image: the frontend is on Vercel, no
# ECR repository holds it, and no Compose file references it (file 38 req 5).
#
# It exists because requirement 3 names two conditions that would end the Vercel
# arrangement at short notice — a commercial trigger putting Hobby use in breach,
# or a paused project on a usage ceiling — and the cost of being ready is this
# file and about thirty minutes. `.github/workflows/ci.yml` builds it on every run
# so it cannot rot: an escape hatch that has never been built is not an escape
# hatch. CI's runner is x86 and that is fine and deliberate — the point is that
# the file still describes a buildable image, not that CI produces a deployable
# arm64 artefact.
#
# Build from the REPOSITORY ROOT:
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.kidlearn.net \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://kidlearn.net \
#     --build-arg MEDIA_ASSET_HOSTS=https://res.cloudinary.com \
#     -t kidlearn-web:<env>-<sha> .
#
# The dev image adds `--build-arg SITE_NOINDEX=true` and the container takes
# DEV_SITE_BASIC_AUTH as a RUNTIME variable — the two dev-only settings are not
# the same kind of thing, and the comment on the ARG block below says why.
#
# BEFORE RUNNING IT FOR REAL, the box must go back to t4g.medium — two Next.js
# servers do not fit in 2 GiB. The full procedure is in document/runbook.md.

FROM node:22-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Every workspace manifest: pnpm-workspace.yaml globs apps/* and packages/*, so a
# missing package.json is a missing lockfile importer and --frozen-lockfile
# rejects the whole install as an outdated lockfile.
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

FROM deps AS build
# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time, so they
# are build arguments and not runtime environment. An image built with
# production's API URL cannot be re-pointed at dev by restarting it with
# different variables — that is the failure mode worth stating out loud, because
# it looks like a CORS bug and would have a dev build writing to the production
# database. One image per environment, tagged <env>-<sha>.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG MEDIA_ASSET_HOSTS
# SITE_NOINDEX is a BUILD argument too, despite carrying no NEXT_PUBLIC_ prefix.
# `headers()` in next.config.ts is evaluated during `next build` and serialised
# into .next/routes-manifest.json — setting it on the running container does
# nothing at all. Verified by building both ways and reading the manifest.
ARG SITE_NOINDEX
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    MEDIA_ASSET_HOSTS=${MEDIA_ASSET_HOSTS} \
    SITE_NOINDEX=${SITE_NOINDEX} \
    NEXT_TELEMETRY_DISABLED=1
COPY . .
# Through Turbo, not a bare `next build`: apps/web imports @kidlearn/types, which
# compiles to dist/ and is resolved through its `exports` map. turbo.json's
# `dependsOn: ["^build"]` produces it first. This is the same reason the Vercel
# project's build command must go through Turbo rather than `next build`.
RUN pnpm turbo run build --filter=web

FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=4000 \
    # A containerised Next standalone server binds loopback by default, so
    # without this the container answers nothing from outside itself. Set here
    # rather than in the environment matrix: it is a property of containerising
    # the frontend, and nothing containerises it today.
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
# Traced from the monorepo root, so the emitted server.js sits at the path the
# app occupies in the workspace rather than at the tree root.
CMD ["node", "apps/web/server.js"]
