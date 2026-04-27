# syntax=docker/dockerfile:1.7
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags "-s -w" \
    -o /out/gateway-ws ./cmd/gateway-ws

FROM gcr.io/distroless/static:nonroot
WORKDIR /app
COPY --from=build /out/gateway-ws /app/gateway-ws
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/gateway-ws"]
