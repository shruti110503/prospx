FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy source code
COPY . .

# Expose API port
EXPOSE 5000

CMD ["node", "server.js"]