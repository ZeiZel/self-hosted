BINARY := selfhost
PKG := ./cmd/selfhost
PREFIX ?= /usr/local/bin
VERSION ?= $(shell git describe --tags --always 2>/dev/null || echo dev)

.PHONY: all build install uninstall test vet fmt clean run

all: build

build: ## Build the static binary (no cgo)
	CGO_ENABLED=0 go build -ldflags "-s -w" -o $(BINARY) $(PKG)

install: build ## Build and symlink into PREFIX
	install -m 0755 $(BINARY) $(PREFIX)/$(BINARY)

uninstall:
	rm -f $(PREFIX)/$(BINARY)

test: ## Run unit tests
	go test ./...

vet:
	go vet ./...

fmt:
	gofmt -w .

clean:
	rm -f $(BINARY)

run: build ## Build and show help
	./$(BINARY) --help
