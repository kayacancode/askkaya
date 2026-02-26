package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// QueryResponse represents the response from a query
type QueryResponse struct {
	Text       string   `json:"text"`
	Confidence float64  `json:"confidence"`
	Sources    []string `json:"sources"`
	Escalated  bool     `json:"escalated"`
}

// ImageInput represents an image to include with a query
type ImageInput struct {
	Data      string `json:"data"`      // base64 encoded image data
	MediaType string `json:"mediaType"` // image/jpeg, image/png, image/gif, image/webp
}

// APIClient is a Firebase Functions HTTP client
type APIClient struct {
	BaseURL      string
	token        string
	clientID     string
	HTTPClient   *http.Client
	refreshFunc  func() (string, error)
	timeout      time.Duration
}

// NewClient creates a new API client
func NewClient(baseURL, token, clientID string) *APIClient {
	return &APIClient{
		BaseURL:    baseURL,
		token:      token,
		clientID:   clientID,
		HTTPClient: &http.Client{},
		timeout:    60 * time.Second, // RAG + LLM can take time, especially on cold starts
	}
}

// SetTokenRefresher sets the token refresh function
func (c *APIClient) SetTokenRefresher(refreshFunc func() (string, error)) {
	c.refreshFunc = refreshFunc
}

// SetTimeout sets the HTTP client timeout
func (c *APIClient) SetTimeout(timeout time.Duration) {
	c.timeout = timeout
}

// GetTimeout returns the current timeout
func (c *APIClient) GetTimeout() time.Duration {
	return c.timeout
}

// Query sends a query to the API
func (c *APIClient) Query(question string) (QueryResponse, error) {
	return c.QueryWithImage(question, nil)
}

// QueryWithImage sends a query with an optional image to the API
func (c *APIClient) QueryWithImage(question string, image *ImageInput) (QueryResponse, error) {
	var response QueryResponse

	// Try the request with current token
	err := c.doQuery(question, image, &response)
	if err != nil {
		// Check if it's a 401 error and we have a refresh function
		if strings.Contains(err.Error(), "unauthorized") && c.refreshFunc != nil {
			// Try to refresh the token
			newToken, refreshErr := c.refreshFunc()
			if refreshErr != nil {
				return response, fmt.Errorf("failed to refresh token: %w", refreshErr)
			}

			// Update the token
			c.token = newToken

			// Retry the request
			err = c.doQuery(question, image, &response)
			if err != nil {
				return response, err
			}
		} else {
			return response, err
		}
	}

	return response, nil
}

// doQuery performs the actual query request
func (c *APIClient) doQuery(question string, image *ImageInput, response *QueryResponse) error {
	url := fmt.Sprintf("%s/queryApi", c.BaseURL)

	reqBody := map[string]interface{}{
		"question": question,
	}

	// Include image if provided
	if image != nil {
		reqBody["image"] = map[string]string{
			"data":      image.Data,
			"mediaType": image.MediaType,
		}
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.token))
	req.Header.Set("X-Client-ID", c.clientID)

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		// Check if it's a timeout error
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("request timeout")
		}
		return fmt.Errorf("network error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return fmt.Errorf("unauthorized")
	}

	if resp.StatusCode == http.StatusForbidden {
		var errorResp struct {
			Error   string `json:"error"`
			Message string `json:"message"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&errorResp); err == nil {
			if errorResp.Error == "billing_suspended" {
				return fmt.Errorf("billing suspended: %s", errorResp.Message)
			}
			if errorResp.Error == "api_key_required" {
				return fmt.Errorf("api_key_required: %s", errorResp.Message)
			}
		}
		return fmt.Errorf("forbidden: %d", resp.StatusCode)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("request failed with status %d", resp.StatusCode)
	}

	if err := json.NewDecoder(resp.Body).Decode(response); err != nil {
		return fmt.Errorf("failed to decode response: %w", err)
	}

	return nil
}

// HealthCheck checks API connectivity
func (c *APIClient) HealthCheck() error {
	url := fmt.Sprintf("%s/healthApi", c.BaseURL)

	ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("network error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health check failed with status %d", resp.StatusCode)
	}

	return nil
}
