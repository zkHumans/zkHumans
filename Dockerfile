FROM node:18-slim

WORKDIR /app

COPY package*.json ./
COPY libs/prisma ./libs/prisma/

RUN chown -R node:node /app

USER node

RUN npm install

COPY --chown=node:node . .

RUN npm run production-build
