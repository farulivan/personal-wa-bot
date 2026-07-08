FROM node:20-slim

ARG TARGETARCH
# Keep in sync with the Chrome version puppeteer-core expects (see the
# "Could not find Chrome (ver. X)" message puppeteer prints, or
# puppeteer-core's revisions.js). Bump alongside whatsapp-web.js updates.
ARG CHROME_VERSION=143.0.7499.192

# Chromium runtime libraries (shared by Chrome for Testing and distro chromium)
RUN apt-get update && apt-get install -y \
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
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Browser. Debian's chromium package tracks the latest release, so an image
# rebuild can silently jump several majors past what puppeteer-core supports —
# that broke the browser launch in production. On amd64 (the deploy target)
# install a pinned Chrome for Testing instead. There is no linux-arm64 CfT
# build, so local arm64 dev images keep distro chromium as a fallback.
RUN if [ "$TARGETARCH" = "amd64" ]; then \
    npx --yes @puppeteer/browsers install "chrome@${CHROME_VERSION}" --path /opt/chrome \
    && ln -s "$(find /opt/chrome -type f -name chrome -path '*chrome-linux64*')" /usr/bin/chromium \
    && npm cache clean --force; \
    else \
    apt-get update && apt-get install -y chromium --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*; \
    fi

# Fail the build loudly if the browser is missing or cannot execute
RUN /usr/bin/chromium --version

# Set Puppeteer to use the pinned browser
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
