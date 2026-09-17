# Node 24 is the LTS line CI already tests on. The digest makes every build use
# the exact same image; Dependabot moves it when the tag is rebuilt with fixes.
FROM node:24-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm@10.28.0 && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Baileys talks to WhatsApp over a WebSocket, so this process is just Node.
# The cap is a ceiling, not a reservation: keeping it tight makes a leak fail
# fast and visibly instead of quietly inflating the GB-minute bill.
CMD ["node", "--max-old-space-size=256", "dist/index.js"]
