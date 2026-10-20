FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY bin ./bin
RUN chmod +x ./bin/mcp-server.js
ENTRYPOINT ["node", "bin/mcp-server.js"]
