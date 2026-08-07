# ---- 빌드 단계 ----------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# 의존성 캐시: package 파일만 먼저 복사
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 백엔드 주소는 빌드 시점에 번들에 박힌다 (Vite 특성).
#   docker build --build-arg VITE_API_BASE=https://api.example.com .
ARG VITE_API_BASE
ENV VITE_API_BASE=$VITE_API_BASE

# 지리 데이터(약 25MB)는 저장소에 없으므로 빌드 중에 받는다.
# 이미지에 넣지 않고 CDN 에 올릴 거라면 이 줄을 빼면 된다.
RUN npm run fetch-data

RUN npm run build

# ---- 실행 단계 ----------------------------------------------
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
