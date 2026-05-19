FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
ARG VITE_API_URL=/api/v1
ARG VITE_WS_URL=/ws
ENV VITE_API_URL=$VITE_API_URL VITE_WS_URL=$VITE_WS_URL

RUN npm run build

# ── Production image ─────────────────────────────────────────
FROM nginx:alpine AS final

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://localhost:3000 || exit 1

CMD ["nginx", "-g", "daemon off;"]
