FROM node:20-slim

# Install Chrome dependencies for Puppeteer + build tools for native modules (sqlite3)
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
    python3 \
    make \
    g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm and dependencies (rebuild native modules)
RUN npm install -g pnpm && pnpm install --frozen-lockfile && pnpm rebuild sqlite3

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm build

# Create data directory for SQLite
RUN mkdir -p /app/data

# Run the bot
CMD ["node", "dist/index.js"]
