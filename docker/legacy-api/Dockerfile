FROM node:20-slim

WORKDIR /usr/src/app

COPY . .

RUN npm install

RUN npm run build

# Descompacta o banco de dados do src para o dist
RUN gunzip -c src/infrastructure/users.db.gz > dist/infrastructure/users.db

EXPOSE 3001

CMD [ "npm", "start" ]
