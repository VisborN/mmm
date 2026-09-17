package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestForward_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Test-Header") != "foo" {
			t.Errorf("expected X-Test-Header: foo, got %q", r.Header.Get("X-Test-Header"))
		}
		w.Header().Set("X-Resp-Header", "bar")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"upstream": "success"}`))
	}))
	defer server.Close()

	req := &Request{
		Method: "GET",
		Url:    server.URL,
		MultiValueHeaders: map[string][]string{
			"X-Test-Header": {"foo"},
		},
	}

	resp, err := Forward(context.Background(), req)
	if err != nil {
		t.Fatalf("Forward failed: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}
	if resp.Body != `{"upstream": "success"}` {
		t.Errorf("unexpected body: %s", resp.Body)
	}
	if resp.MultiValueHeaders["X-Resp-Header"][0] != "bar" {
		t.Errorf("expected response header X-Resp-Header: bar, got %v", resp.MultiValueHeaders)
	}
}

func TestForward_MissingUrl(t *testing.T) {
	req := &Request{
		Method: "GET",
	}

	_, err := Forward(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for missing url, got nil")
	}
}

func TestNewHandler_OptionsPreflight(t *testing.T) {
	handler := NewHandler()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, "/proxy", nil)

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Errorf("missing Access-Control-Allow-Origin: *")
	}
	if rec.Header().Get("Access-Control-Allow-Methods") == "" {
		t.Errorf("missing Access-Control-Allow-Methods")
	}
}

func TestNewHandler_GetStatus(t *testing.T) {
	handler := NewHandler()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/proxy", nil)

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if rec.Header().Get("Content-Type") != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", rec.Header().Get("Content-Type"))
	}

	var statusResp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &statusResp); err != nil {
		t.Fatalf("failed to parse JSON: %v", err)
	}
	if statusResp["status"] != "ok" {
		t.Errorf("expected status: ok, got %v", statusResp["status"])
	}
}

func TestNewHandler_PostProxy(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if string(body) != "ping" {
			t.Errorf("expected body 'ping', got %q", string(body))
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("pong"))
	}))
	defer server.Close()

	payload := "ping"
	proxyReq := Request{
		Method: "POST",
		Url:    server.URL,
		Body:   &payload,
	}
	bodyJSON, _ := json.Marshal(proxyReq)

	handler := NewHandler()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/proxy", bytes.NewReader(bodyJSON))

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp Response
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response JSON: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected upstream status 200, got %d", resp.StatusCode)
	}
	if resp.Body != "pong" {
		t.Errorf("expected body 'pong', got %q", resp.Body)
	}
}
