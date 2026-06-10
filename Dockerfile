FROM node:20-slim

# Install Chrome dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files and pnpm config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm@10.28.0 && pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript (also copies src/db/migrations → dist/db/migrations)
RUN pnpm build

# Run the bot
CMD ["node", "--max-old-space-size=384", "dist/index.js"]
