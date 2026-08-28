FROM node:20-alpine AS builder

WORKDIR /repo

ARG NEXT_PUBLIC_WEB_URL=http://localhost:3000
ENV NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/docs/package.json apps/docs/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/typescript-config/*.json packages/typescript-config/
RUN npm ci

COPY apps/docs apps/docs
RUN npm run build --workspace @beaco/docs

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

COPY --from=builder /repo/apps/docs/.next/standalone ./
COPY --from=builder /repo/apps/docs/.next/static ./apps/docs/.next/static

EXPOSE 3001

CMD ["node", "apps/docs/server.js"]
