FROM golang:1.26-alpine AS build

WORKDIR /app

# 1. Copy go.mod and sum first to leverage Docker caching for dependencies
COPY go.mod go.sum ./
RUN go mod download

# 2. Copy the rest of the source code (maintaining directory structure)
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -a -tags netgo -ldflags '-w -extldflags "-static"' -o server-app ./cmd/server

FROM scratch
COPY --from=build /app/server-app /server-app

ENTRYPOINT ["/server-app"]
