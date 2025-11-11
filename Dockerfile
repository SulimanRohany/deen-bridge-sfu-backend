# Multi-stage build for production-ready SFU backend
FROM node:20-alpine AS base

# Install system dependencies for mediasoup
RUN apk add --no-cache \
    python3 \
    py3-pip \
    make \
    g++ \
    linux-headers \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install --omit=dev && npm cache clean --force

# Build stage
FROM base AS build

# Install all dependencies (including dev dependencies)
RUN npm install

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install system dependencies for mediasoup
RUN apk add --no-cache \
    python3 \
    py3-pip \
    make \
    g++ \
    linux-headers \
    && rm -rf /var/cache/apk/*

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S sfu -u 1001

# Set working directory
WORKDIR /app

# Copy built application and dependencies
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/migrations ./migrations
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./

# Copy mediasoup worker binary from build stage
COPY --from=build /app/node_modules/mediasoup/worker/out/Release/mediasoup-worker /app/mediasoup-worker

# Create necessary directories
RUN mkdir -p /app/logs && \
    chown -R sfu:nodejs /app

# Switch to non-root user
USER sfu


# Expose ports
EXPOSE 3000 3001 9090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/healthz', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Set environment variables
ENV NODE_ENV=production
ENV MEDIASOUP_WORKER_BIN=/app/mediasoup-worker

# Start the application
CMD ["node", "dist/index.js"]
