FROM golang:latest AS build

WORKDIR /app
ADD cmd .
ADD go.mod .
ADD go.sum .
ADD src .
RUN GOARCH=amd64 go build -a -tags netgo -ldflags '-w -extldflags "-static"' -o server-app ./cmd/server

FROM scratch
COPY --from=build /app/server-app /server-app

ENTRYPOINT ["/server-app"]
