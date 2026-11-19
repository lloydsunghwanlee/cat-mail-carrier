FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data TRUST_PROXY=1
COPY package.json ./
COPY index.html sw.js manifest.webmanifest robots.txt ./
COPY css ./css
COPY js ./js
COPY icons ./icons
COPY server ./server
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/app.mjs"]
