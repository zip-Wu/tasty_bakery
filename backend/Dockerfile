FROM node:22-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install && apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY . ./
ENV PORT=80
EXPOSE 80
CMD ["node", "app.js"]
