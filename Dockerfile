FROM dhi.io/bun:1

WORKDIR /app

COPY . .

EXPOSE 3456

CMD ["bun", "server.js"]