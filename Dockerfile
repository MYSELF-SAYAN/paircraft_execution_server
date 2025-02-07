# Use an official Node.js image as the base
FROM node:20-alpine

# Install Python and dependencies
RUN apk add --no-cache python3 py3-pip

# Set working directory inside the container
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application files
COPY . .

# Expose the port the server runs on
EXPOSE 3000

# Run the server
CMD ["node", "index1.js"]
