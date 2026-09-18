# Node 24 is the LTS line CI already tests on. The digest makes every build use
# the exact same image; Dependabot moves it when the tag is rebuilt with fixes.
FROM node:24-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS base

FROM base AS pnpm-base
WORKDIR /app
RUN npm install -g pnpm@10.28.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM pnpm-base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM pnpm-base AS prod-deps
RUN pnpm install --frozen-lockfile --prod

# Only what the bot runs goes into the final image. The compiler, linter and
# test runner stay in the build stage, along with the advisories that come
# with them.
FROM base
WORKDIR /app
# package.json has to come along: its "type": "module" is what makes Node load
# dist/ as ES modules.
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Baileys talks to WhatsApp over a WebSocket, so this process is just Node.
# The cap is a ceiling, not a reservation: keeping it tight makes a leak fail
# fast and visibly instead of quietly inflating the GB-minute bill.
CMD ["node", "--max-old-space-size=256", "dist/index.js"]
