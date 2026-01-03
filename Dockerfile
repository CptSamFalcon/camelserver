FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy server file
COPY game-server.js ./

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "game-server.js"]
