# Tickets backend — PocketBase, pinned. No third-party image: fetch the official
# release binary at a pinned version and verify it runs as a non-root user.
FROM alpine:3.20 AS fetch
ARG PB_VERSION=0.39.6
ARG TARGETARCH=amd64
RUN apk add --no-cache ca-certificates unzip wget
RUN wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
    && unzip "pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" -d /pb

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata && adduser -D -H -u 1000 pb
COPY --from=fetch /pb/pocketbase /usr/local/bin/pocketbase
COPY pb_migrations /pb/pb_migrations
COPY pb_hooks /pb/pb_hooks
RUN mkdir -p /pb/pb_data && chown -R pb:pb /pb
USER pb
WORKDIR /pb
EXPOSE 8090
VOLUME ["/pb/pb_data"]
ENTRYPOINT ["pocketbase"]
CMD ["serve", "--http=0.0.0.0:8090", \
     "--dir=/pb/pb_data", \
     "--migrationsDir=/pb/pb_migrations", \
     "--hooksDir=/pb/pb_hooks"]
