# ---- Build stage -----------------------------------------------------------
FROM golang:1.25-alpine AS builder
WORKDIR /src

# Cache module downloads.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/palius-api .

# ---- Runtime stage ----------------------------------------------------------
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app

COPY --from=builder /out/palius-api /app/palius-api

ENV PORT=8080
ENV PALIUS_DB=/data/palius.db
EXPOSE 8080
VOLUME /data

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/api/v1/health || exit 1

CMD ["/app/palius-api"]
