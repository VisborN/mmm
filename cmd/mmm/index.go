package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/VisborN/mmm/src/model"
	"github.com/VisborN/mmm/src/proxy"
)

type Request = proxy.Request
type Response = proxy.Response

var jsonCorsHeaders = map[string]string{
	"Content-Type":                 "application/json",
	"Access-Control-Allow-Origin":  "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS",
	"Access-Control-Allow-Headers": "*",
}

var preflightHeaders = proxy.PreflightHeaders

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

	res, err := proxy.Forward(ctx, body)
	if err != nil {
		return &model.APIGatewayResponse{
			StatusCode: http.StatusBadGateway,
			Headers:    jsonCorsHeaders,
			Body:       fmt.Sprintf(`{"error": "failed to execute upstream request: %s"}`, err.Error()),
		}, nil
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
