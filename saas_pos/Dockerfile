# Stage 1: Build frontends
FROM node:20-alpine AS frontend
WORKDIR /app

ARG VITE_TURNSTILE_SITE_KEY=""
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY

COPY web/admin/package.json web/admin/package-lock.json* web/admin/
RUN cd web/admin && npm install
COPY web/admin/ web/admin/
RUN cd web/admin && npm run build

COPY web/tenant/package.json web/tenant/package-lock.json* web/tenant/
RUN cd web/tenant && npm install
COPY web/tenant/ web/tenant/
RUN cd web/tenant && npm run build

COPY web/landing/package.json web/landing/package-lock.json* web/landing/
RUN cd web/landing && npm install
COPY web/landing/ web/landing/
RUN cd web/landing && npm run build

# Stage 2: Build Go binary
FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -ldflags="-s -w" -o server ./cmd/server

# Stage 3: Runtime (Go API + uploads only)
FROM alpine:3.19 AS app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder /app/server .
RUN mkdir -p /app/uploads && chown -R appuser:appgroup /app
USER appuser
EXPOSE 3000
CMD ["./server"]

# Stage 4: Caddy with frontend static files
FROM caddy:2-alpine AS caddy
COPY --from=frontend /app/web/admin/dist /srv/admin
COPY --from=frontend /app/web/tenant/dist /srv/tenant
COPY --from=frontend /app/web/landing/dist /srv/landing
