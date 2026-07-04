BINARY  = envman
PKG     = ./cmd/envman
VERSION = $(shell cat ../package.json | grep '"version"' | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
LDFLAGS = -ldflags "-s -w -X main.VERSION=$(VERSION)"
OUTDIR  = ../dist/cli

.PHONY: all build clean linux-x64 linux-arm64 darwin-x64 darwin-arm64 windows-x64

all: linux-x64 linux-arm64 darwin-x64 darwin-arm64 windows-x64

$(OUTDIR):
	mkdir -p $(OUTDIR)

linux-x64: $(OUTDIR)
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o $(OUTDIR)/$(BINARY)-linux-x64 $(PKG)
	gzip -c $(OUTDIR)/$(BINARY)-linux-x64 > $(OUTDIR)/$(BINARY)-linux-x64.gz

linux-arm64: $(OUTDIR)
	GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o $(OUTDIR)/$(BINARY)-linux-arm64 $(PKG)
	gzip -c $(OUTDIR)/$(BINARY)-linux-arm64 > $(OUTDIR)/$(BINARY)-linux-arm64.gz

darwin-x64: $(OUTDIR)
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o $(OUTDIR)/$(BINARY)-darwin-x64 $(PKG)
	gzip -c $(OUTDIR)/$(BINARY)-darwin-x64 > $(OUTDIR)/$(BINARY)-darwin-x64.gz

darwin-arm64: $(OUTDIR)
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $(OUTDIR)/$(BINARY)-darwin-arm64 $(PKG)
	gzip -c $(OUTDIR)/$(BINARY)-darwin-arm64 > $(OUTDIR)/$(BINARY)-darwin-arm64.gz

windows-x64: $(OUTDIR)
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o $(OUTDIR)/$(BINARY)-windows-x64.exe $(PKG)
	gzip -c $(OUTDIR)/$(BINARY)-windows-x64.exe > $(OUTDIR)/$(BINARY)-windows-x64.gz

build: darwin-arm64

clean:
	rm -f envman-test $(OUTDIR)/$(BINARY)-*
