package proxy

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Request defines the payload expected by the MMM proxy.
type Request struct {
	Method            string              `json:"method"`
	Url               string              `json:"url"`
	Body              *string             `json:"body"`
	IsBase64Encoded   bool                `json:"isBase64Encoded,omitempty"`
	MultiValueHeaders map[string][]string `json:"multiValueHeaders,omitempty"`
	Impersonate       string              `json:"impersonate,omitempty"`
}

// Response defines the envelope returned by the proxy to match Yandex Cloud API Gateway.
type Response struct {
	StatusCode        int                 `json:"statusCode"`
	Body              string              `json:"body"`
	MultiValueHeaders map[string][]string `json:"multiValueHeaders,omitempty"`
}

// CORSHeaders represents standard CORS headers for proxy responses.
var CORSHeaders = map[string]string{
	"Access-Control-Allow-Origin":  "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS",
	"Access-Control-Allow-Headers": "*",
}

// PreflightHeaders represents CORS headers for preflight OPTIONS responses.
var PreflightHeaders = map[string]string{
	"Access-Control-Allow-Origin":  "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS",
	"Access-Control-Allow-Headers": "*",
	"Access-Control-Max-Age":       "86400",
}

// Forward executes the upstream HTTP request described by req.
func Forward(ctx context.Context, req *Request) (*Response, error) {
	if req.Url == "" {
		return nil, fmt.Errorf("missing url in request")
	}

	method := req.Method
	if method == "" {
		method = http.MethodGet
	}

	var upstreamRequestBody io.Reader
	if req.Body != nil {
		upstreamRequestBody = strings.NewReader(*req.Body)
		if req.IsBase64Encoded {
			upstreamRequestBody = base64.NewDecoder(base64.StdEncoding, upstreamRequestBody)
		}
	}

	upstreamRequest, err := http.NewRequestWithContext(ctx, method, req.Url, upstreamRequestBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create upstream request: %w", err)
	}

	upstreamRequest.Header = make(http.Header)
	for k, vs := range req.MultiValueHeaders {
		if strings.EqualFold(k, "Host") && len(vs) > 0 {
			upstreamRequest.Host = vs[0]
		}
		for _, v := range vs {
			upstreamRequest.Header.Add(k, v)
		}
	}

	var httpClient = http.DefaultClient
	if req.Impersonate != "" {
		tlsConfig := &tls.Config{
			MinVersion: tls.VersionTLS12,
			MaxVersion: tls.VersionTLS13,
			CipherSuites: []uint16{
				tls.TLS_AES_128_GCM_SHA256,
				tls.TLS_AES_256_GCM_SHA384,
				tls.TLS_CHACHA20_POLY1305_SHA256,
				tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
				tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
				tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
				tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
				tls.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256,
				tls.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256,
			},
		}
		transport := &http.Transport{
			TLSClientConfig:   tlsConfig,
			ForceAttemptHTTP2: true,
		}
		httpClient = &http.Client{
			Transport: transport,
		}
	}

	if strings.EqualFold(req.Impersonate, "chrome") {
		if upstreamRequest.Header.Get("User-Agent") == "" {
			upstreamRequest.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36")
		}
		if upstreamRequest.Header.Get("Sec-CH-UA") == "" {
			upstreamRequest.Header.Set("Sec-CH-UA", `"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"`)
		}
		if upstreamRequest.Header.Get("Sec-CH-UA-Mobile") == "" {
			upstreamRequest.Header.Set("Sec-CH-UA-Mobile", "?0")
		}
		if upstreamRequest.Header.Get("Sec-CH-UA-Platform") == "" {
			upstreamRequest.Header.Set("Sec-CH-UA-Platform", `"Windows"`)
		}
	}

	upstreamResponse, err := httpClient.Do(upstreamRequest)
	if err != nil {
		return nil, fmt.Errorf("failed to execute upstream request: %w", err)
	}
	defer upstreamResponse.Body.Close()

	upstreamResponseBody, err := io.ReadAll(upstreamResponse.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read upstream response body: %w", err)
	}

	return &Response{
		StatusCode:        upstreamResponse.StatusCode,
		Body:              string(upstreamResponseBody),
		MultiValueHeaders: upstreamResponse.Header,
	}, nil
}

// NewHandler creates an http.Handler implementing the MMM proxy endpoint.
// It is fully compatible with https://d5dli0ro6bbf30tqr35v.lievo6ut.apigw.yandexcloud.net/proxy.
func NewHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers for all responses
		for k, v := range CORSHeaders {
			w.Header().Set(k, v)
		}

		// Handle CORS preflight OPTIONS request
		if strings.EqualFold(r.Method, http.MethodOptions) {
			for k, v := range PreflightHeaders {
				w.Header().Set(k, v)
			}
			w.WriteHeader(http.StatusOK)
			return
		}

		// Friendly healthcheck/status on GET requests
		if strings.EqualFold(r.Method, http.MethodGet) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status":  "ok",
				"service": "mmm-proxy",
				"time":    time.Now().Format(time.RFC3339),
			})
			return
		}

		w.Header().Set("Content-Type", "application/json")

		if !strings.EqualFold(r.Method, http.MethodPost) {
			w.WriteHeader(http.StatusMethodNotAllowed)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": fmt.Sprintf("method %s not allowed, use POST", r.Method),
			})
			return
		}

		bodyBytes, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": fmt.Sprintf("failed to read request body: %s", err.Error()),
			})
			return
		}
		defer r.Body.Close()

		if len(bodyBytes) == 0 {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": "empty request body",
			})
			return
		}

		var proxyReq Request
		if err := json.Unmarshal(bodyBytes, &proxyReq); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": fmt.Sprintf("an error has occurred when parsing body: %s", err.Error()),
			})
			return
		}

		// Fallback: support APIGateway-wrapped request envelope if present
		if proxyReq.Url == "" {
			var apiGwReq struct {
				Body            string `json:"body"`
				IsBase64Encoded bool   `json:"isBase64Encoded"`
			}
			if err := json.Unmarshal(bodyBytes, &apiGwReq); err == nil && apiGwReq.Body != "" {
				raw := apiGwReq.Body
				if apiGwReq.IsBase64Encoded {
					if decoded, err := base64.StdEncoding.DecodeString(raw); err == nil {
						raw = string(decoded)
					}
				}
				_ = json.Unmarshal([]byte(raw), &proxyReq)
			}
		}

		if proxyReq.Url == "" {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": "missing url in request",
			})
			return
		}

		targetMethod := proxyReq.Method
		if targetMethod == "" {
			targetMethod = http.MethodGet
		}
		start := time.Now()
		fmt.Printf("[proxy] %s %s -> %s %s\n", r.Method, r.URL.Path, targetMethod, proxyReq.Url)

		// Create context with 60s timeout if context has no deadline
		ctx := r.Context()
		if _, hasDeadline := ctx.Deadline(); !hasDeadline {
			var cancel context.CancelFunc
			ctx, cancel = context.WithTimeout(ctx, 60*time.Second)
			defer cancel()
		}

		resp, err := Forward(ctx, &proxyReq)
		if err != nil {
			fmt.Printf("[proxy] error forwarding to %s: %v\n", proxyReq.Url, err)
			w.WriteHeader(http.StatusBadGateway)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": fmt.Sprintf("failed to execute upstream request: %s", err.Error()),
			})
			return
		}

		elapsed := time.Since(start)
		fmt.Printf("[proxy] completed %s %s in %v (upstream status %d)\n", targetMethod, proxyReq.Url, elapsed, resp.StatusCode)

		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			fmt.Printf("[proxy] error encoding response: %v\n", err)
		}
	})
}
