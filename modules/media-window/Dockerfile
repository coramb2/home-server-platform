FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY index.js ./
COPY src ./src
USER node
CMD ["node", "index.js"]
