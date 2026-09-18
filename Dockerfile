# ---------------------------------------------------------------------------
# Servidor PokerSoul (mesas + contas dos jogadores)
#
#   docker build -t pokersoul-server .
#   docker run -p 3001:3001 -v pokersoul-data:/data pokersoul-server
#
# Os dados ficam em /data (monte um volume!). Configuração por variáveis de
# ambiente — veja server/index.ts ou a seção "Hospedar" do README.
# ---------------------------------------------------------------------------

# --- compila TypeScript → JavaScript (server/ + shared/) --------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.server.json ./
COPY scripts/build-server.mjs ./scripts/
COPY shared ./shared
COPY server ./server
RUN node scripts/build-server.mjs

# --- imagem final: só Node, o servidor compilado e o pacote ws --------------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data
WORKDIR /app

# o package.json gerado em dist-server/ traz só a dependência de runtime (ws)
COPY --from=build /app/dist-server ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# roda sem privilégios; /data é do usuário node para o volume poder ser escrito
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
