FROM node:22-slim
WORKDIR /usr/src/app

# 生产环境优化
ENV NODE_ENV=production

# 安装 CA 证书（必须在 npm ci 之前，确保 HTTPS 请求正常）
RUN apt-get update && apt-get install -y ca-certificates && update-ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production
COPY . ./

ENV PORT=80
ENV NODE_OPTIONS=--use-openssl-ca
EXPOSE 80
CMD ["node", "app.js"]
