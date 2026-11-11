FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/sim/package.json packages/sim/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
RUN bun install --frozen-lockfile
COPY packages packages
RUN bun run build

FROM oven/bun:1.4-slim
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/sim packages/sim
COPY --from=build /app/packages/server packages/server
COPY --from=build /app/packages/client/dist packages/client/dist
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["bun", "packages/server/src/index.ts"]
