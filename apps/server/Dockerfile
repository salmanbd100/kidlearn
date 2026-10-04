FROM node:22-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .

RUN pnpm turbo run build --filter=server

FROM build AS migrate
WORKDIR /repo/packages/db
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM build AS prune

RUN pnpm deploy --filter=server --prod --config.node-linker=hoisted /prod/server

RUN cd /prod/server/node_modules/@kidlearn/db \
  && DATABASE_URL=postgresql://generate/placeholder \
     DIRECT_URL=postgresql://generate/placeholder \
     /repo/packages/db/node_modules/.bin/prisma generate

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prune /prod/server ./
USER node

CMD ["node", "dist/server.js"]
