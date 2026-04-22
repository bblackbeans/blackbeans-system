FROM node:22-alpine

WORKDIR /app

COPY blackbeans-web/package*.json /app/
RUN npm install

COPY blackbeans-web /app

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]
