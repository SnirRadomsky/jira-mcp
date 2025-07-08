FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Set the environment to production
ENV NODE_ENV=production

# Make the entry point script executable
COPY ./docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Use the entry point script to keep the container running
ENTRYPOINT ["/docker-entrypoint.sh"]