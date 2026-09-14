package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/VisborN/mmm/src/proxy"
)

func main() {
	defaultPort := os.Getenv("PORT")
	if defaultPort == "" {
		defaultPort = "8081"
	}

	port := flag.String("port", defaultPort, "Port to listen on (default: 8081 or PORT env var)")
	flag.StringVar(port, "p", defaultPort, "Port to listen on (shorthand)")
	flag.Parse()

	handler := proxy.NewHandler()

	mux := http.NewServeMux()
	mux.Handle("/proxy", handler)
	mux.Handle("/", handler)

	addr := ":" + *port
	srv := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  70 * time.Second,
		WriteTimeout: 70 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		fmt.Println("=================================================================")
		fmt.Printf("🚀 MMM Local Proxy Server listening on http://localhost:%s\n", *port)
		fmt.Println("=================================================================")
		fmt.Printf("Proxy endpoint: http://localhost:%s/proxy\n", *port)
		fmt.Println("Compatible with: https://d5dli0ro6bbf30tqr35v.lievo6ut.apigw.yandexcloud.net/proxy")
		fmt.Println("CORS: enabled for all origins (*)")
		fmt.Println()
		fmt.Println("To use this local proxy in the MMM Web App:")
		fmt.Printf("  1. Open Settings -> Yandex Serverless Proxy\n")
		fmt.Printf("  2. Set endpoint to: http://localhost:%s/proxy\n", *port)
		fmt.Printf("  3. Click 'Проверить прокси'\n")
		fmt.Println("=================================================================")

		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-stop
	fmt.Println("\nShutting down MMM Proxy Server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}
	fmt.Println("Server gracefully stopped.")
}
