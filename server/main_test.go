package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/VisborN/mmm/src/proxy"
)

func TestLocalProxyServer_OptionsAndProxy(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Custom", "123")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"upstream": "ok"}`))
	}))
	defer upstream.Close()

	handler := proxy.NewHandler()

	// 1. Test OPTIONS /proxy
	optReq := httptest.NewRequest(http.MethodOptions, "/proxy", nil)
	optRec := httptest.NewRecorder()
	handler.ServeHTTP(optRec, optReq)
	if optRec.Code != http.StatusOK {
		t.Fatalf("expected 200 for OPTIONS, got %d", optRec.Code)
	}
	if optRec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("expected CORS origin *")
	}

	// 2. Test POST /proxy
	proxyReq := proxy.Request{
		Method: "GET",
		Url:    upstream.URL,
	}
	reqBytes, _ := json.Marshal(proxyReq)
	postReq := httptest.NewRequest(http.MethodPost, "/proxy", bytes.NewReader(reqBytes))
	postRec := httptest.NewRecorder()
	handler.ServeHTTP(postRec, postReq)

	if postRec.Code != http.StatusOK {
		t.Fatalf("expected 200 for POST, got %d: %s", postRec.Code, postRec.Body.String())
	}

	var resp proxy.Response
	if err := json.Unmarshal(postRec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200 upstream, got %d", resp.StatusCode)
	}
	if resp.Body != `{"upstream": "ok"}` {
		t.Errorf("unexpected body: %s", resp.Body)
	}
	if resp.MultiValueHeaders["X-Custom"][0] != "123" {
		t.Errorf("missing header X-Custom")
	}
}
