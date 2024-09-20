FROM node:22-alpine

# Create and set the working directory
RUN mkdir -p /home/node/app && chown -R node:node /home/node/app
WORKDIR /home/node/app

# Copy package.json and install dependencies
COPY package.json /home/node/app/
RUN npm install

# Copy TypeScript files
COPY . /home/node/app/

# Compile TypeScript code
RUN npm run build

# Copy any remaining files (if necessary)
COPY --chown=node:node . .

# Expose the port your app will run on
EXPOSE 4001
# Start the server
CMD ["node", "build/index.js"] 
