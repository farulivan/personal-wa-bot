FROM node:20-slim

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm@10.28.0 && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Baileys talks to WhatsApp over a WebSocket, so this process is just Node.
# The cap is a ceiling, not a reservation: keeping it tight makes a leak fail
# fast and visibly instead of quietly inflating the GB-minute bill.
CMD ["node", "--max-old-space-size=256", "dist/index.js"]
