package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/VisborN/mmm/src/model"
)

func TestHandler_OptionsCORS(t *testing.T) {
	req := &model.APIGatewayRequest{
		HttpMethod: "OPTIONS",
	}

	resp, err := Handler(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, resp.StatusCode)
	}

	if resp.Headers["Access-Control-Allow-Origin"] != "*" {
		t.Errorf("expected Access-Control-Allow-Origin: *, got %q", resp.Headers["Access-Control-Allow-Origin"])
	}
}

func TestHandler_ProxyGetSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Custom-Header", "test-val")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"message": "hello from upstream"}`))
	}))
	defer server.Close()

	proxyReq := Request{
		Method: "GET",
		Url:    server.URL + "/test",
	}
	bodyBytes, err := json.Marshal(proxyReq)
	if err != nil {
		t.Fatalf("failed to marshal proxyReq: %v", err)
	}

	req := &model.APIGatewayRequest{
		HttpMethod: "POST",
		Body:       string(bodyBytes),
	}

	resp, err := Handler(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, resp.StatusCode)
	}

	var proxyResp Response
	if err := json.Unmarshal([]byte(resp.Body), &proxyResp); err != nil {
		t.Fatalf("failed to unmarshal response body: %v", err)
	}

	if proxyResp.StatusCode != http.StatusOK {
		t.Errorf("expected upstream status 200, got %d", proxyResp.StatusCode)
	}

	if proxyResp.Body != `{"message": "hello from upstream"}` {
		t.Errorf("unexpected body: %s", proxyResp.Body)
	}

	if proxyResp.MultiValueHeaders["X-Custom-Header"][0] != "test-val" {
		t.Errorf("unexpected headers: %v", proxyResp.MultiValueHeaders)
	}
}

func TestHandler_ProxyPostWithBodyAndHeaders(t *testing.T) {
	var receivedBody string
	var receivedHeader string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		receivedBody = string(b)
		receivedHeader = r.Header.Get("X-Auth-Token")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"created": true}`))
	}))
	defer server.Close()

	payload := "req-data"
	proxyReq := Request{
		Method: "POST",
		Url:    server.URL + "/create",
		Body:   &payload,
		MultiValueHeaders: map[string][]string{
			"X-Auth-Token": {"secret-123"},
		},
	}
	bodyBytes, _ := json.Marshal(proxyReq)

	req := &model.APIGatewayRequest{
		RequestContext: model.RequestContext{
			Http: model.RequestContextHttp{
				Method: "POST",
			},
		},
		Body: string(bodyBytes),
	}

	resp, err := Handler(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if receivedBody != "req-data" {
		t.Errorf("expected upstream body 'req-data', got %q", receivedBody)
	}
	if receivedHeader != "secret-123" {
		t.Errorf("expected upstream header 'secret-123', got %q", receivedHeader)
	}

	var proxyResp Response
	if err := json.Unmarshal([]byte(resp.Body), &proxyResp); err != nil {
		t.Fatalf("failed to unmarshal response body: %v", err)
	}

	if proxyResp.StatusCode != http.StatusCreated {
		t.Errorf("expected upstream status %d, got %d", http.StatusCreated, proxyResp.StatusCode)
	}
}

func TestHandler_Base64Body(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer server.Close()

	proxyReq := Request{
		Method: "GET",
		Url:    server.URL,
	}
	bodyBytes, _ := json.Marshal(proxyReq)
	b64 := base64.StdEncoding.EncodeToString(bodyBytes)

	req := &model.APIGatewayRequest{
		IsBase64Encoded: true,
		Body:            b64,
	}

	resp, err := Handler(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, resp.StatusCode)
	}
}

func TestHandler_MissingUrl(t *testing.T) {
	req := &model.APIGatewayRequest{
		Body: `{"method": "GET"}`,
	}

	resp, err := Handler(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, resp.StatusCode)
	}
}
