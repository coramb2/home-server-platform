# caddy/Dockerfile - front door for the home server platform & app screens

# Stage 1:Build the app screens into plain files a browser can read
FROM node:22-alpine AS shell
WORKDIR /app
# Install dependencies first to leverage Docker cache
COPY apps/shell/package*.json ./
RUN npm ci --no-audit --no-fund
# Copy the rest of the app screens source code and build it
COPY apps/shell/ ./
# The PUBLIC push key gets baked into app screens at build time.
# public by design :)
ARG VITE_VAPID_PUBLIC_KEY
ENV VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
RUN npm run build

# Stage 2: Build the Caddy server with the app screens built in
FROM caddy:2.8.0-alpine
COPY caddy/Caddyfile.pilot /etc/caddy/Caddyfile
COPY --from=shell /app/build /srv/shell
# Run as non-root user for security
RUN addgroup -g 1001 -S web \
    && adduser -u 1001 -S -G web -H web \
    && mkdir -p /data /config \
    && chown -R web:web /data /config
USER web