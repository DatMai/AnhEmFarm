FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
RUN npm ci && npm --prefix server ci
COPY . .
RUN npm run build && npm --prefix server run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server/node_modules ./server/node_modules
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/server/prisma ./server/prisma
COPY --from=build --chown=node:node /app/server/prisma.config.ts ./server/prisma.config.ts
COPY --from=build --chown=node:node /app/server/package.json ./server/package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-ssr ./dist-ssr
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
WORKDIR /app/server
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
