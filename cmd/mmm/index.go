package main

import (
	"context"
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

	upstreamResponse, err := http.DefaultClient.Do(upstreamRequest)
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
