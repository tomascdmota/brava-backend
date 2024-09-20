FROM node:22-alpine

RUN mkdir -p /home/node/app && chown -R node:node /home/node/app

WORKDIR  /home/node/app

COPY /build package.json /home/node/app/

USER node

RUN npm install


COPY --chown=node:node . .

EXPOSE 8080
CMD ["node", "index.js"]