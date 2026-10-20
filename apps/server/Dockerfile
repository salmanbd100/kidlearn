# Pinned by digest as well as exact version: a tag is mutable, and this image is
# what production runs. Dependabot (.github/dependabot.yml) moves both together.
FROM node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS base
# PNPM_HOME also sets the store to $PNPM_HOME/store, which is where the cache
# mounts below point.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

# Reduces the repository to `server` and the workspaces it depends on. Without
# it any change to apps/web — or its manifest — invalidated every layer below.
# Global rather than the lockfile's copy because nothing is installed yet; keep
# the version in step with `turbo` in pnpm-lock.yaml.
FROM base AS prune
RUN npm install -g turbo@2.11.7
COPY . .
RUN turbo prune server --docker

# out/json is manifests and the pruned lockfile only, so this layer survives
# every source change that does not touch a dependency.
FROM base AS deps
COPY --from=prune /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile

FROM deps AS build
COPY --from=prune /repo/out/full/ ./
RUN pnpm turbo run build --filter=server

# Only @kidlearn/db's own dependencies, not the server's or the root's. Its
# devDependencies stay because the Prisma CLI is one of them.
FROM build AS migrate-prune
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm deploy --filter=@kidlearn/db /prod/db

FROM base AS migrate
WORKDIR /app
# node-owned so Prisma can write beside the schema if it needs to; it never
# needs to write anywhere else, and the engines were fetched at install time.
COPY --from=migrate-prune --chown=node:node /prod/db ./
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

FROM build AS prune-runtime
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm deploy --filter=server --prod --config.node-linker=hoisted /prod/server

RUN cd /prod/server/node_modules/@kidlearn/db \
  && DATABASE_URL=postgresql://generate/placeholder \
     DIRECT_URL=postgresql://generate/placeholder \
     /repo/packages/db/node_modules/.bin/prisma generate

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prune-runtime /prod/server ./
USER node

CMD ["node", "dist/server.js"]
