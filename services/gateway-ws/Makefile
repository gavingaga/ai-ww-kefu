.PHONY: build build-redis test run lint vet clean docker

PKG := ./...
BIN := bin/gateway-ws

build:
	@mkdir -p bin
	go build -trimpath -o $(BIN) ./cmd/gateway-ws

# 接入 Redis Registry(生产构建)。
# 注意:启用前需 `go get github.com/redis/go-redis/v9`。
build-redis:
	@mkdir -p bin
	go build -trimpath -tags redis -o $(BIN) ./cmd/gateway-ws

test:
	go test -race -count=1 $(PKG)

vet:
	go vet $(PKG)

lint:
	golangci-lint run || true

run: build
	./$(BIN)

docker:
	docker build -t ai-kefu/gateway-ws:dev .

clean:
	rm -rf bin
