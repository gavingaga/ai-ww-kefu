.PHONY: build test run lint vet clean docker

PKG := ./...
BIN := bin/gateway-ws

build:
	@mkdir -p bin
	go build -trimpath -o $(BIN) ./cmd/gateway-ws

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
