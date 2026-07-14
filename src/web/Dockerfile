FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

ARG VITE_API_URL=http://localhost:3000
ARG VITE_SCANNER_URL=http://localhost:5174
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SCANNER_URL=$VITE_SCANNER_URL

RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
