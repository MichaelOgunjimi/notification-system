# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build Next.js app
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Create non-root user
RUN addgroup -g 1000 appuser && \
    adduser -u 1000 -G appuser -s /bin/sh -D appuser

# Copy only necessary files from builder
COPY --from=builder --chown=appuser:appuser /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=appuser:appuser /app/.next /app/.next
COPY --from=builder --chown=appuser:appuser /app/public /app/public

# Install production dependencies only
RUN npm ci --only=production

# Switch to non-root user
USER appuser

EXPOSE 3000

ENV NODE_ENV=production

# Start Next.js in production mode
CMD ["npm", "start"]
