FROM node:22-slim
WORKDIR /usr/src/app

# 安装 CA 证书（必须在 npm install 之前，确保 HTTPS 请求正常）
RUN apt-get update && apt-get install -y ca-certificates && update-ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install
COPY . ./

ENV PORT=80
ENV NODE_OPTIONS=--use-openssl-ca
EXPOSE 80
CMD ["node", "app.js"]
