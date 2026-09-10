package main

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/VisborN/mmm/src/model"
)

type Request struct {
	Method            string              `json:"method"`
	Url               string              `json:"url"`
	Body              *string             `json:"body"`
	IsBase64Encoded   bool                `json:"isBase64Encoded,omitempty"`
	MultiValueHeaders map[string][]string `json:"multiValueHeaders,omitempty"`
	Impersonate       string              `json:"impersonate,omitempty"`
}

type Response struct {
	StatusCode        int                 `json:"statusCode"`
	Body              string              `json:"body"`
	MultiValueHeaders map[string][]string `json:"multiValueHeaders,omitempty"`
}

var jsonCorsHeaders = map[string]string{
	"Content-Type":                 "application/json",
	"Access-Control-Allow-Origin":  "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS",
	"Access-Control-Allow-Headers": "*",
}

var preflightHeaders = map[string]string{
	"Access-Control-Allow-Origin":  "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS",
	"Access-Control-Allow-Headers": "*",
	"Access-Control-Max-Age":       "86400",
}

func Handler(ctx context.Context, req *model.APIGatewayRequest) (*model.APIGatewayResponse, error) {
	method := req.Method()
	if strings.EqualFold(method, http.MethodOptions) {
		return &model.APIGatewayResponse{
			StatusCode: http.StatusOK,
			Headers:    preflightHeaders,
		}, nil
	}

	if req.IsBase64Encoded {
		res, err := base64.StdEncoding.DecodeString(req.Body)
		if err != nil {
			return &model.APIGatewayResponse{
				StatusCode: http.StatusBadRequest,
				Headers:    jsonCorsHeaders,
				Body:       fmt.Sprintf(`{"error": "failed to decode base64 body: %s"}`, err.Error()),
			}, nil
		}
		req.Body = string(res)
	}

	body := &Request{}
	if err := json.Unmarshal([]byte(req.Body), body); err != nil {
		return &model.APIGatewayResponse{
			StatusCode: http.StatusBadRequest,
			Headers:    jsonCorsHeaders,
			Body:       fmt.Sprintf(`{"error": "an error has occurred when parsing body: %s"}`, err.Error()),
		}, nil
	}

	if body.Url == "" {
		return &model.APIGatewayResponse{
			StatusCode: http.StatusBadRequest,
			Headers:    jsonCorsHeaders,
			Body:       `{"error": "missing url in request"}`,
		}, nil
	}

	if body.Method == "" {
		body.Method = http.MethodGet
	}

	// The log will show the name of the HTTP method used to make the request as well as the path and target URL
	fmt.Println(method, req.RawPath, body.Method, body.Url)

	var upstreamRequestBody io.Reader
	if body.Body != nil {
		upstreamRequestBody = strings.NewReader(*body.Body)
		if body.IsBase64Encoded {
			upstreamRequestBody = base64.NewDecoder(base64.StdEncoding, upstreamRequestBody)
		}
	}

	upstreamRequest, err := http.NewRequestWithContext(ctx, body.Method, body.Url, upstreamRequestBody)
	if err != nil {
		return &model.APIGatewayResponse{
			StatusCode: http.StatusBadRequest,
			Headers:    jsonCorsHeaders,
			Body:       fmt.Sprintf(`{"error": "failed to create upstream request: %s"}`, err.Error()),
		}, nil
	}

	upstreamRequest.Header = make(http.Header)
	for k, vs := range body.MultiValueHeaders {
		for _, v := range vs {
			upstreamRequest.Header.Add(k, v)
		}
	}

	var httpClient = http.DefaultClient
	if body.Impersonate != "" {
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

	if strings.EqualFold(body.Impersonate, "chrome") {
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
		return &model.APIGatewayResponse{
			StatusCode: http.StatusBadGateway,
			Headers:    jsonCorsHeaders,
			Body:       fmt.Sprintf(`{"error": "failed to execute upstream request: %s"}`, err.Error()),
		}, nil
	}
	defer upstreamResponse.Body.Close()

	upstreamResponseBody, err := io.ReadAll(upstreamResponse.Body)
	if err != nil {
		return &model.APIGatewayResponse{
			StatusCode: http.StatusBadGateway,
			Headers:    jsonCorsHeaders,
			Body:       fmt.Sprintf(`{"error": "failed to read upstream response body: %s"}`, err.Error()),
		}, nil
	}

	res := Response{
		StatusCode:        upstreamResponse.StatusCode,
		Body:              string(upstreamResponseBody),
		MultiValueHeaders: upstreamResponse.Header,
	}

	resBody, err := json.Marshal(res)
	if err != nil {
		return &model.APIGatewayResponse{
			StatusCode: http.StatusInternalServerError,
			Headers:    jsonCorsHeaders,
			Body:       fmt.Sprintf(`{"error": "failed to marshal response: %s"}`, err.Error()),
		}, nil
	}

	return &model.APIGatewayResponse{
		StatusCode: http.StatusOK,
		Headers:    jsonCorsHeaders,
		Body:       string(resBody),
	}, nil
}
