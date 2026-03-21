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

func Handler(ctx context.Context, req *model.APIGatewayRequest) (*model.APIGatewayResponse, error) {
	if req.IsBase64Encoded {
		res, err := base64.StdEncoding.DecodeString(req.Body)
		if err != nil {
			return nil, fmt.Errorf("failed to decode base64 body: %w", err)
		}
		req.Body = string(res)
	}
	body := &Request{}
	if err := json.Unmarshal([]byte(req.Body), &req); err != nil {
		return nil, fmt.Errorf("an error has occurred when parsing body: %w", err)
	}

	// The log will show the name of the HTTP method used to make the request as well as the path
	fmt.Println(req.RequestContext.Http.Method, req.RawPath)

	var upstreamRequestBody io.Reader
	if body.Body != nil {
		upstreamRequestBody = strings.NewReader(*body.Body)
		if body.IsBase64Encoded {
			upstreamRequestBody = base64.NewDecoder(base64.StdEncoding, upstreamRequestBody)
		}
	}
	upstreamRequest, err := http.NewRequestWithContext(ctx, body.Method, body.Url, upstreamRequestBody)
	if err != nil {
		return nil, fmt.Errorf("failed to to create upstream request: %w", err)
	}
	upstreamRequest.Header = body.MultiValueHeaders

	upstreamResponse, err := http.DefaultClient.Do(upstreamRequest)
	if err != nil {
		return nil, fmt.Errorf("failed to to do upstream request: %w", err)
	}
	defer upstreamResponse.Body.Close()

	upstreamResponseBody, err := io.ReadAll(upstreamResponse.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read upstream response body: %w", err)
	}
	res := Response{
		StatusCode:        upstreamResponse.StatusCode,
		Body:              string(upstreamResponseBody),
		MultiValueHeaders: upstreamResponse.Header,
	}

	resBody, err := json.Marshal(res)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal Response: %w", err)
	}

	// Response body.
	return &model.APIGatewayResponse{
		StatusCode: 200,
		Body:       string(resBody),
	}, nil
}
