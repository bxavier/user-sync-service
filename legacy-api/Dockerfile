FROM node:20-slim

WORKDIR /usr/src/app

COPY . .

RUN npm install

RUN npm run build

# Descompacta o banco de dados se ainda não existir
RUN if [ ! -f dist/infrastructure/users.db ] && [ -f dist/infrastructure/users.db.gz ]; then \
      gunzip -k dist/infrastructure/users.db.gz; \
    fi

EXPOSE 3001

CMD [ "npm", "start" ]
