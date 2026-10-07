FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund --no-audit
COPY index.js ./
RUN addgroup -S app && adduser -S app -G app
USER app
CMD ["node", "index.js"]
