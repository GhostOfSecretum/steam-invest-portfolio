FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

ENV NODE_OPTIONS=--max-old-space-size=1536

CMD ["node", "server/index.js"]
