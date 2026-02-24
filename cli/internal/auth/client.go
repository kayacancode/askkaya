package auth

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

// AuthTokens represents Firebase authentication tokens
type AuthTokens struct {
	IDToken      string
	RefreshToken string
	ExpiresIn    int
	ExpiresAt    time.Time
	ClientID     string // User's associated client ID
	UserID       string // Firebase user ID
	Email        string // User's email
}

// AuthClient is a Firebase Auth REST client
type AuthClient struct {
	APIKey     string
	BaseURL    string
	HTTPClient *http.Client
	tokens     *AuthTokens
}

// NewClient creates a new Firebase Auth client
func NewClient(apiKey, baseURL string) *AuthClient {
	return &AuthClient{
		APIKey:     apiKey,
		BaseURL:    baseURL,
		HTTPClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// SignIn authenticates with email and password
func (c *AuthClient) SignIn(email, password string) (*AuthTokens, error) {
	url := fmt.Sprintf("%s/v1/accounts:signInWithPassword?key=%s", c.BaseURL, c.APIKey)

	reqBody := map[string]interface{}{
		"email":             email,
		"password":          password,
		"returnSecureToken": true,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := c.HTTPClient.Post(url, "application/json", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("network error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errorResp struct {
			Error struct {
				Code    int    `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&errorResp); err == nil {
			return nil, fmt.Errorf("invalid credentials: %s", errorResp.Error.Message)
		}
		return nil, fmt.Errorf("authentication failed with status %d", resp.StatusCode)
	}

	var result struct {
		IDToken      string `json:"idToken"`
		RefreshToken string `json:"refreshToken"`
		ExpiresIn    string `json:"expiresIn"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	expiresIn, err := strconv.Atoi(result.ExpiresIn)
	if err != nil {
		return nil, fmt.Errorf("invalid expiresIn value: %w", err)
	}

	tokens := &AuthTokens{
		IDToken:      result.IDToken,
		RefreshToken: result.RefreshToken,
		ExpiresIn:    expiresIn,
		ExpiresAt:    time.Now().Add(time.Duration(expiresIn) * time.Second),
	}

	c.tokens = tokens
	return tokens, nil
}

// RefreshToken refreshes the authentication token
func (c *AuthClient) RefreshToken(refreshToken string) (*AuthTokens, error) {
	url := fmt.Sprintf("%s/v1/token?key=%s", c.BaseURL, c.APIKey)

	reqBody := map[string]interface{}{
		"grant_type":    "refresh_token",
		"refresh_token": refreshToken,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := c.HTTPClient.Post(url, "application/json", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("network error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token refresh failed with status %d", resp.StatusCode)
	}

	var result struct {
		IDToken      string `json:"id_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    string `json:"expires_in"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	expiresIn, err := strconv.Atoi(result.ExpiresIn)
	if err != nil {
		return nil, fmt.Errorf("invalid expiresIn value: %w", err)
	}

	tokens := &AuthTokens{
		IDToken:      result.IDToken,
		RefreshToken: result.RefreshToken,
		ExpiresIn:    expiresIn,
		ExpiresAt:    time.Now().Add(time.Duration(expiresIn) * time.Second),
	}

	c.tokens = tokens
	return tokens, nil
}

// SetTokens sets the current tokens
func (c *AuthClient) SetTokens(tokens AuthTokens) {
	c.tokens = &tokens
}

// GetCurrentToken returns the current valid token, refreshing if needed
func (c *AuthClient) GetCurrentToken() (string, error) {
	if c.tokens == nil {
		return "", errors.New("no token available")
	}

	// Check if token is expired or about to expire (within 5 minutes)
	if time.Now().After(c.tokens.ExpiresAt.Add(-5 * time.Minute)) {
		// Token is expired or about to expire, refresh it
		newTokens, err := c.RefreshToken(c.tokens.RefreshToken)
		if err != nil {
			return "", fmt.Errorf("failed to refresh token: %w", err)
		}
		c.tokens = newTokens
	}

	return c.tokens.IDToken, nil
}
