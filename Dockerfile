FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY src/ ./src/
COPY public/ ./public/

# Create data directory
RUN mkdir -p /data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_FILE=/data/stats.json

EXPOSE 3000

CMD ["npm", "start"]
