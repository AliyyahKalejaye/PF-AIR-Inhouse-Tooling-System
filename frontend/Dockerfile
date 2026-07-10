# Used for local docker-compose dev only — production frontend hosting is
# Cloudflare Pages (static/edge build), not this Dockerfile.
FROM node:22-slim

WORKDIR /app
COPY package.json ./
RUN npm install

COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
