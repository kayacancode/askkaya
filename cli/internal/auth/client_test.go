package auth_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/askkaya/cli/internal/auth"
)

func TestSignIn_Success(t *testing.T) {
	// Mock Firebase Auth REST API
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/accounts:signInWithPassword" {
			t.Errorf("Expected path /v1/accounts:signInWithPassword, got %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("Expected POST method, got %s", r.Method)
		}
		if apiKey := r.URL.Query().Get("key"); apiKey == "" {
			t.Error("Expected API key in query params")
		}

		var req map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("Failed to decode request body: %v", err)
		}

		if req["email"] != "test@example.com" || req["password"] != "password123" {
			t.Error("Invalid email or password in request")
		}

		resp := map[string]interface{}{
			"idToken":      "mock-id-token",
			"refreshToken": "mock-refresh-token",
			"expiresIn":    "3600",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := auth.NewClient("test-api-key", server.URL)
	tokens, err := client.SignIn("test@example.com", "password123")

	if err != nil {
		t.Fatalf("SignIn failed: %v", err)
	}

	if tokens.IDToken != "mock-id-token" {
		t.Errorf("Expected IDToken 'mock-id-token', got '%s'", tokens.IDToken)
	}
	if tokens.RefreshToken != "mock-refresh-token" {
		t.Errorf("Expected RefreshToken 'mock-refresh-token', got '%s'", tokens.RefreshToken)
	}
	if tokens.ExpiresIn != 3600 {
		t.Errorf("Expected ExpiresIn 3600, got %d", tokens.ExpiresIn)
	}
	if tokens.ExpiresAt.IsZero() {
		t.Error("Expected ExpiresAt to be set")
	}
	if time.Until(tokens.ExpiresAt) > 3600*time.Second {
		t.Error("ExpiresAt should be approximately 3600 seconds in the future")
	}
}

func TestSignIn_InvalidCredentials(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		resp := map[string]interface{}{
			"error": map[string]interface{}{
				"code":    400,
				"message": "INVALID_PASSWORD",
			},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := auth.NewClient("test-api-key", server.URL)
	_, err := client.SignIn("test@example.com", "wrongpassword")

	if err == nil {
		t.Fatal("Expected error for invalid credentials, got nil")
	}

	if err.Error() != "invalid credentials: INVALID_PASSWORD" {
		t.Errorf("Expected descriptive error, got: %v", err)
	}
}

func TestSignIn_NetworkError(t *testing.T) {
	// Use invalid URL to simulate network error
	client := auth.NewClient("test-api-key", "http://invalid-host-that-does-not-exist:9999")
	_, err := client.SignIn("test@example.com", "password123")

	if err == nil {
		t.Fatal("Expected network error, got nil")
	}
}

func TestRefreshToken_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/token" {
			t.Errorf("Expected path /v1/token, got %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("Expected POST method, got %s", r.Method)
		}
		if apiKey := r.URL.Query().Get("key"); apiKey == "" {
			t.Error("Expected API key in query params")
		}

		var req map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("Failed to decode request body: %v", err)
		}

		if req["grant_type"] != "refresh_token" {
			t.Error("Expected grant_type 'refresh_token'")
		}
		if req["refresh_token"] != "old-refresh-token" {
			t.Error("Invalid refresh token in request")
		}

		resp := map[string]interface{}{
			"id_token":      "new-id-token",
			"refresh_token": "new-refresh-token",
			"expires_in":    "3600",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := auth.NewClient("test-api-key", server.URL)
	tokens, err := client.RefreshToken("old-refresh-token")

	if err != nil {
		t.Fatalf("RefreshToken failed: %v", err)
	}

	if tokens.IDToken != "new-id-token" {
		t.Errorf("Expected IDToken 'new-id-token', got '%s'", tokens.IDToken)
	}
	if tokens.RefreshToken != "new-refresh-token" {
		t.Errorf("Expected RefreshToken 'new-refresh-token', got '%s'", tokens.RefreshToken)
	}
}

func TestGetCurrentToken_ValidToken(t *testing.T) {
	client := auth.NewClient("test-api-key", "http://example.com")
	
	// Set a valid token that expires in the future
	futureTime := time.Now().Add(1 * time.Hour)
	tokens := auth.AuthTokens{
		IDToken:      "valid-token",
		RefreshToken: "refresh-token",
		ExpiresIn:    3600,
		ExpiresAt:    futureTime,
	}
	client.SetTokens(tokens)

	token, err := client.GetCurrentToken()
	if err != nil {
		t.Fatalf("GetCurrentToken failed: %v", err)
	}

	if token != "valid-token" {
		t.Errorf("Expected token 'valid-token', got '%s'", token)
	}
}

func TestGetCurrentToken_ExpiredToken_RefreshesAutomatically(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]interface{}{
			"id_token":      "refreshed-token",
			"refresh_token": "new-refresh-token",
			"expires_in":    "3600",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := auth.NewClient("test-api-key", server.URL)
	
	// Set an expired token
	pastTime := time.Now().Add(-1 * time.Hour)
	tokens := auth.AuthTokens{
		IDToken:      "expired-token",
		RefreshToken: "refresh-token",
		ExpiresIn:    3600,
		ExpiresAt:    pastTime,
	}
	client.SetTokens(tokens)

	token, err := client.GetCurrentToken()
	if err != nil {
		t.Fatalf("GetCurrentToken failed: %v", err)
	}

	if token != "refreshed-token" {
		t.Errorf("Expected refreshed token 'refreshed-token', got '%s'", token)
	}
}

func TestGetCurrentToken_NoToken(t *testing.T) {
	client := auth.NewClient("test-api-key", "http://example.com")

	_, err := client.GetCurrentToken()
	if err == nil {
		t.Fatal("Expected error when no token is set, got nil")
	}

	if err.Error() != "no token available" {
		t.Errorf("Expected 'no token available' error, got: %v", err)
	}
}
