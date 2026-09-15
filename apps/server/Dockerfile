# Build from the REPOSITORY ROOT, not from apps/server:
#   docker build -f apps/server/Dockerfile --target runner  -t kidlearn-api .
#   docker build -f apps/server/Dockerfile --target migrate -t kidlearn-migrate .
#
# pnpm workspaces need the lockfile and every workspace manifest, so a context
# rooted at one app cannot resolve. Both targets share every layer up to `build`,
# so the migrate image costs build seconds rather than minutes.
#
# `linux/arm64` in the deployed environments — the box is a Graviton t4g. CI
# builds this on x86 and that is fine: the point of that build is that the file
# still describes a buildable image (file 38 req 5), not a deployable artefact.
#
# NOT Alpine. Prisma's query engine links against glibc and OpenSSL 3; musl means
# chasing a `linux-musl-arm64-openssl-3.0.x` binaryTargets entry for no meaningful
# size win. Generating the Prisma client in the same base image and architecture
# as the runtime makes `native` resolve with no binaryTargets at all — confirmed:
# the engine in the built image is libquery_engine-linux-arm64-openssl-3.0.x.
#
# (File 38 also names `argon2` as a native-module risk here. It is not a
# dependency — `grep argon2 pnpm-lock.yaml` finds nothing — so no build-essential
# stage is needed. Left recorded so the question is not re-opened.)
FROM node:22-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# node:22-bookworm-slim ships libssl3 but not the `openssl` package, and Prisma
# sniffs for the binary rather than the library. Without this it prints
# "failed to detect the libssl/openssl version" and silently DEFAULTS TO
# openssl-1.1.x — the wrong query engine for a bookworm runtime. Observed, not
# assumed: it is in the build log of the first image built from this file.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Every workspace manifest, not only the ones apps/server needs.
# pnpm-workspace.yaml globs apps/* and packages/*, so a missing package.json is a
# missing lockfile importer and --frozen-lockfile rejects the whole install as an
# outdated lockfile. Two lines against a first-build failure.
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Through Turbo, not two hand-written `--filter` calls. `apps/server` imports
# @kidlearn/types as well as @kidlearn/db, and both compile to dist/ resolved
# through an `exports` map; turbo.json's `dependsOn: ["^build"]` already knows
# that order and a hand-written list silently rots when a dependency is added.
# An earlier draft here built only @kidlearn/db and passed — because a stale
# packages/types/dist was riding in from the host. Excluding dist from the build
# context is what exposed it.
RUN pnpm turbo run build --filter=server

# Migrations only. Keeps the prisma CLI — a devDependency of packages/db, and so
# correctly absent from the runtime image below, which is the whole reason this is
# a second image rather than a second container off one.
#
# `migrate deploy` applies committed migrations and never generates one. Never
# `migrate dev` against a deployed database. Migrations are forward-only: a bad
# one is fixed by a new forward migration, never by editing an applied one.
FROM build AS migrate
WORKDIR /repo/packages/db
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM build AS prune
# `--config.node-linker=hoisted` is not cosmetic. Under the default isolated
# linker pnpm 9's `deploy` copies the whole virtual store rather than only
# `server`'s production closure: the resulting tree carried both @next/swc
# binaries, rolldown, sharp and esbuild — 609 MB of apps/web's toolchain in an
# image that never runs it. Hoisted resolves the same closure flat, at 255 MB,
# and still carries the generated Prisma client. Measured, both ways.
#
# `--legacy`, which the pnpm docs mention for this, does not exist in pnpm 9.15.
RUN pnpm deploy --filter=server --prod --config.node-linker=hoisted /prod/server

# `pnpm deploy` resolves @prisma/client fresh from the store, and the store copy
# carries no generated client — the one produced in the `build` stage lives in
# /repo's virtual store and does not travel. Without this the container starts and
# dies on `@prisma/client did not initialize yet`, which reads like a missing build
# step and is really a missing copy. Generating here rather than copying files
# around means the engine is matched to this image's glibc and OpenSSL.
#
# The CLI is packages/db's devDependency, so it exists in this stage and not in
# the runtime image. The datasource URLs are placeholders: `generate` parses the
# schema and never connects, but it does refuse to run on an unset env var.
RUN cd /prod/server/node_modules/@kidlearn/db \
  && DATABASE_URL=postgresql://generate/placeholder \
     DIRECT_URL=postgresql://generate/placeholder \
     /repo/packages/db/node_modules/.bin/prisma generate

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prune /prod/server ./
USER node
# `dist/server.js`, NOT `dist/index.js`: the entry is src/server.ts, and
# apps/server/package.json's `main` and `start` both name dist/server.js. There
# is no src/index.ts — a stale dist/index.js from before the module
# reorganisation survives a casual `ls dist/` and then fails only inside the
# container, as an immediate `Cannot find module`.
#
# NOT `pnpm start`, which reads the manifest and so cannot disagree with it —
# tried, and it is worse. The deployed /app/package.json is apps/server's, which
# carries no `packageManager` field, so corepack DOWNLOADS A PNPM BINARY over the
# network on every container start and then tries to reinstall into a tree owned
# by root while running as `node`. Observed: "Downloading the pnpm 12.4.1 binary"
# followed by ERR_PNPM_PACKAGE_MANAGER_REMOVE_MODULES_DIR. A container that needs
# the registry to boot is not a container that survives a registry outage.
CMD ["node", "dist/server.js"]
