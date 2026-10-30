FROM node:24-bookworm-slim
WORKDIR /app
COPY agent/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY scripts/npm-notices.mjs ./scripts/npm-notices.mjs
RUN mkdir -p licenses && node scripts/npm-notices.mjs /app /app/licenses/npm-notices.txt
COPY agent/src ./src
COPY LICENSE THIRD_PARTY_NOTICES.md ./licenses/
COPY LICENSES/ ./licenses/third-party/
USER node
ENV BIND_HOST=0.0.0.0 PORT=3001 INTERNAL_TOKEN_FILE=/run/workbench/internal-token
EXPOSE 3001
CMD ["node", "src/server.ts"]
