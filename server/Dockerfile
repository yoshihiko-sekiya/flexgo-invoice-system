# Multi-stage build for API server with Japanese font support
FROM node:20-slim AS base

# Install system dependencies and Japanese fonts
RUN apt-get update && apt-get install -y \
    # Japanese fonts
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    # Puppeteer dependencies
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libasound2 \
    libgtk-3-0 \
    # Additional utilities
    ca-certificates \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock* ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY server/ ./server/
COPY src/templates/ ./src/templates/

# Install tsx for TypeScript execution
RUN npm install -g tsx

# Create non-root user for security
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
RUN chown -R appuser:appgroup /app
USER appuser

# Set environment variables
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Expose port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8787/api/health || exit 1

# Start the server
CMD ["tsx", "server/index.ts"]

# Build info
LABEL maintainer="Mentor Lite API"
LABEL description="PDF generation API server with Japanese font support"
LABEL version="1.0.0"