package model

// APIGatewayRequest API Gateway v1 request body
type APIGatewayRequest struct {
	Version        string   `json:"version"`
	OperationID    string   `json:"operationId"`
	RawPath        string   `json:"rawPath"`        // path without query string
	RawQueryString string   `json:"rawQueryString"` // query string in "parameter1=value1&parameter2=value2" format
	Cookies        []string `json:"cookies"`        // array of strings, each representing a cookie file in "name=value" format

	PathParameters map[string]string `json:"pathParameters"`

	Headers map[string]string `json:"headers"` // dictionary with comma-separated HTTP header string values

	QueryStringParameters map[string]string `json:"queryStringParameters"` // dictionary of comma-separated queryString parameters

	Parameters           map[string]string   `json:"parameters"`           // dictionary of request parameter values as described in the OpenAPI spec
	MultiValueParameters map[string][]string `json:"multiValueParameters"` // dictionary with request parameter value lists as described in the OpenAPI spec

	Body            string `json:"body"`
	IsBase64Encoded bool   `json:"isBase64Encoded,omitempty"`

	RequestContext RequestContext `json:"requestContext"`
}

type RequestContext struct {
	Authorizer        any                `json:"authorizer"`
	Http              RequestContextHttp `json:"http"`
	RequestId         string             `json:"requestId"`
	TimeEpoch         int64              `json:"timeEpoch"` // epoch in milliseconds
	ApiGatewayContext ApiGatewayContext  `json:"apiGateway"`
}

type RequestContextHttp struct {
	Method    string `json:"method"`
	Path      string `json:"path"`
	SourceIp  string `json:"sourceIp"`
	UserAgent string `json:"userAgent"`
}

type ApiGatewayContext struct {
	OperationContext any            `json:"operationContext"`
	OperationToken   OperationToken `json:"operationToken"`
}

type OperationToken struct {
	TokenType   string `json:"token_type"`
	AccessToken string `json:"access_token"`
	ExpiresIn   any    `json:"expires_in"`
}

// APIGatewayResponse API Gateway v1 response body
type APIGatewayResponse struct {
	StatusCode        int                 `json:"statusCode"`
	Cookies           []string            `json:"cookies,omitempty"`
	Headers           map[string]string   `json:"headers,omitempty"`
	MultiValueHeaders map[string][]string `json:"multiValueHeaders,omitempty"`
	Body              string              `json:"body"`
	IsBase64Encoded   bool                `json:"isBase64Encoded"`
}
