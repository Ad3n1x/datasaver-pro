# DataSaver Pro - Cloud Production Container
# Architected by Ad3n1x (https://github.com/Ad3n1x)

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy dependency definitions and app files
COPY package.json ./
COPY server.js ./
COPY lib/ ./lib/
COPY public/ ./public/
COPY extension/ ./extension/
COPY test/ ./test/

# Install dependencies (if any) and run tests
RUN node test/runTests.js

# Production environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose web server port
EXPOSE 3000

# Launch DataSaver Pro
CMD ["node", "server.js"]
