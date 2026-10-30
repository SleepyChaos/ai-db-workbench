FROM node:24-bookworm-slim AS web-build
WORKDIR /build/web
COPY web/package*.json ./
RUN npm ci --ignore-scripts
COPY web/ ./
RUN npm run build
COPY scripts/npm-notices.mjs /build/npm-notices.mjs
RUN node /build/npm-notices.mjs /build/web /build/web-notices.txt

FROM rust:1.98-bookworm AS server-build
WORKDIR /build/server
COPY server/Cargo.toml server/Cargo.lock ./
COPY server/src ./src
RUN cargo build --release --locked
RUN mkdir -p /crate-licenses && find /usr/local/cargo/registry/src -type f \
    \( -iname 'license*' -o -iname 'copying*' -o -iname 'notice*' -o -iname 'copyright*' \) \
    -exec cp --parents '{}' /crate-licenses/ \;

FROM debian:bookworm-slim AS app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1000 workbench && useradd -u 1000 -g workbench workbench \
    && mkdir -p /app/web /data/sessions /run/workbench /app/licenses \
    && chown -R workbench:workbench /data /run/workbench
COPY --from=server-build /build/server/target/release/ai-db-workbench /app/server
COPY --from=web-build /build/web/dist /app/web
COPY LICENSE THIRD_PARTY_NOTICES.md /app/licenses/
COPY LICENSES/ /app/licenses/third-party/
COPY --from=web-build /build/web-notices.txt /app/licenses/web-notices.txt
COPY --from=server-build /crate-licenses/ /app/licenses/rust-crates/
USER workbench
WORKDIR /app
ENV BIND_ADDR=0.0.0.0:8080 STATIC_DIR=/app/web DATA_DIR=/data/sessions INTERNAL_TOKEN_FILE=/run/workbench/internal-token
EXPOSE 8080
CMD ["/app/server"]
