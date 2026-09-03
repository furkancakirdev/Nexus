FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ARG BUILD_ID
ARG BUILD_VERSION
ARG BUILD_COMMIT
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4318 \
    BUILD_ID=${BUILD_ID} \
    NEXUS_BUILD_VERSION=${BUILD_VERSION} \
    NEXUS_BUILD_COMMIT=${BUILD_COMMIT}
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 4318
CMD ["node", "server/index.mjs"]
