# Build stage
FROM docker.1ms.run/library/node:22-alpine AS builder

WORKDIR /app

# 设置 Node.js 内存限制和优化选项（针对2核2G服务器）
# 限制内存使用，避免 OOM
ENV NODE_OPTIONS="--max-old-space-size=1536 --max-semi-space-size=128"
# 限制并发任务数，减少内存占用
ENV UV_THREADPOOL_SIZE=2

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm with specific version for stability
RUN npm install -g pnpm@10.4.1 && \
    # 使用更少的并发安装，减少内存占用
    pnpm config set network-concurrency 1 && \
    pnpm config set child-concurrency 1 && \
    pnpm install --no-frozen-lockfile --prefer-offline

# Copy source code
COPY . .

# Build the application with memory and concurrency limits
# 设置环境变量限制构建时的资源使用
ENV NODE_ENV=production
ENV VITE_MAX_WORKERS=1
RUN pnpm run build

# Production stage
FROM docker.1ms.run/library/node:22-alpine

WORKDIR /app

# 生产环境也设置内存限制
ENV NODE_OPTIONS="--max-old-space-size=512"

# Copy package files from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./

# Copy node_modules from builder (includes all dependencies needed for runtime)
COPY --from=builder /app/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["node", "dist/index.js"]
