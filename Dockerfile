FROM dhi.io/bun

WORKDIR /app

COPY . .

EXPOSE 3456

CMD ["bun", "server.js"]