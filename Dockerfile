# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app

# 필요한 파일만 먼저 복사해서 캐시 최대활용
COPY package*.json ./
RUN npm ci

COPY . .
# 환경변수 주입 (배포 시 --build-arg로 덮어씀)
ARG VITE_BACKEND_ADDRESS=""
ENV VITE_BACKEND_ADDRESS=$VITE_BACKEND_ADDRESS

# Vite 빌드
RUN npm run build

# --- Run stage (Nginx) ---
FROM nginx:1.27-alpine
WORKDIR /usr/share/nginx/html

# Nginx 설정 교체 (SPA 라우팅용)
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

# 정적 파일 복사
COPY --from=builder /app/dist ./

# 헬스체크용 기본 페이지 그대로 사용
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
