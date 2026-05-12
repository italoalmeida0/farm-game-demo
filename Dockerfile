FROM oven/bun:1-alpine

WORKDIR /app

COPY . .

EXPOSE 3456

CMD ["bun", "server.js"]