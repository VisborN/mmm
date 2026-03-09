package main

import (
    "fmt"
    "net/http"
    "os"
)

func main() {
    portStr := os.Getenv("PORT")
    fmt.Printf("App listening at port %s\n", portStr)
    http.Handle("/hello", hwHandler{})
    http.ListenAndServe(":"+portStr, nil)
}

type hwHandler struct{}

func (hwHandler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
    ip := request.Header.Get("X-Forwarded-For")
    fmt.Printf("Request from %s\n", ip)
    writer.WriteHeader(200)
    _, _ = writer.Write([]byte("Hello!"))
}
