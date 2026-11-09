FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts/patch-meshcore-decoder.js ./scripts/patch-meshcore-decoder.js

RUN npm ci --omit=dev --no-audit --fund=false

COPY server.js ./
COPY lib ./lib
COPY public ./public
COPY regions ./regions
COPY region-scopes.example.yml ./
COPY README.md HOWTO.md ENVIRONMENT.md AGENTS.md CHANGES.md LICENSE ./

ENV NODE_ENV=production
EXPOSE 3090

CMD ["node", "server.js"]
