FROM node:22-alpine

WORKDIR /app

ARG BACKEND_BASE_URL=http://backend:8000
ENV NODE_ENV=production \
    BACKEND_BASE_URL=${BACKEND_BASE_URL}

COPY package.json package-lock.json ./
RUN npm ci

COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY next.config.ts ./next.config.ts
COPY next-env.d.ts ./next-env.d.ts
COPY tsconfig.json ./tsconfig.json

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3000"]
