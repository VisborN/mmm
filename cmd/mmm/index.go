package main

import (
	"context"
)

type Response struct {
	StatusCode int         `json:"statusCode"`
	Body       interface{} `json:"body"`
}

func Handler(ctx context.Context) (*Response, error) {
	return &Response{
		StatusCode: 200,
		Body:       "Hello, world! second",
	}, nil
}
