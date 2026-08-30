FROM node:20-alpine AS builder

WORKDIR /repo

ARG BACKEND_URL=http://api:8000
ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
ARG NEXT_PUBLIC_DOCS_URL=http://localhost:3001
ENV BACKEND_URL=$BACKEND_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/docs/package.json apps/docs/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/typescript-config/*.json packages/typescript-config/
RUN npm ci

COPY apps/web apps/web
RUN npm run build --workspace @beaco/web

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=development
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
