package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/askkaya/cli/internal/api"
)

func TestQuery_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/query" {
			t.Errorf("Expected path /api/query, got %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("Expected POST method, got %s", r.Method)
		}

		// Check required headers
		authHeader := r.Header.Get("Authorization")
		if authHeader != "Bearer test-token" {
			t.Errorf("Expected Authorization header 'Bearer test-token', got '%s'", authHeader)
		}

		clientID := r.Header.Get("X-Client-ID")
		if clientID == "" {
			t.Error("Expected X-Client-ID header to be set")
		}

		var req map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("Failed to decode request body: %v", err)
		}

		if req["question"] != "How do I reset my password?" {
			t.Errorf("Expected question in request body, got: %v", req["question"])
		}

		resp := api.QueryResponse{
			Text:       "To reset your password, visit the settings page...",
			Confidence: 0.95,
			Sources: []string{
				"https://docs.example.com/password-reset",
				"https://kb.example.com/account-settings",
			},
			Escalated: false,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := api.NewClient(server.URL, "test-token", "test-client-id")
	response, err := client.Query("How do I reset my password?")

	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}

	if response.Text != "To reset your password, visit the settings page..." {
		t.Errorf("Unexpected response text: %s", response.Text)
	}
	if response.Confidence != 0.95 {
		t.Errorf("Expected confidence 0.95, got %f", response.Confidence)
	}
	if len(response.Sources) != 2 {
		t.Errorf("Expected 2 sources, got %d", len(response.Sources))
	}
	if response.Escalated {
		t.Error("Expected Escalated to be false")
	}
}

func TestQuery_EscalatedResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := api.QueryResponse{
			Text:       "I don't have enough information. Escalating to human support.",
			Confidence: 0.3,
			Sources:    []string{},
			Escalated:  true,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := api.NewClient(server.URL, "test-token", "test-client-id")
	response, err := client.Query("Very complex question")

	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}

	if !response.Escalated {
		t.Error("Expected Escalated to be true")
	}
	if response.Confidence >= 0.5 {
		t.Errorf("Expected low confidence for escalated query, got %f", response.Confidence)
	}
}

func TestHealthCheck_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/health" {
			t.Errorf("Expected path /api/health, got %s", r.URL.Path)
		}
		if r.Method != http.MethodGet {
			t.Errorf("Expected GET method, got %s", r.Method)
		}

		resp := map[string]interface{}{
			"status": "healthy",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := api.NewClient(server.URL, "test-token", "test-client-id")
	err := client.HealthCheck()

	if err != nil {
		t.Fatalf("HealthCheck failed: %v", err)
	}
}

func TestHealthCheck_Unhealthy(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		resp := map[string]interface{}{
			"status": "unhealthy",
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := api.NewClient(server.URL, "test-token", "test-client-id")
	err := client.HealthCheck()

	if err == nil {
		t.Fatal("Expected error for unhealthy service, got nil")
	}
}

func TestQuery_AutoRefreshOn401(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		if callCount == 1 {
			// First call returns 401
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}
		// Second call (after refresh) succeeds
		resp := api.QueryResponse{
			Text:       "Success after refresh",
			Confidence: 0.9,
			Sources:    []string{"source1"},
			Escalated:  false,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	// Create a mock token refresher
	refreshCalled := false
	refreshFunc := func() (string, error) {
		refreshCalled = true
		return "new-token", nil
	}

	client := api.NewClient(server.URL, "old-token", "test-client-id")
	client.SetTokenRefresher(refreshFunc)

	response, err := client.Query("test question")

	if err != nil {
		t.Fatalf("Query should succeed after token refresh, got error: %v", err)
	}

	if !refreshCalled {
		t.Error("Expected token refresh to be called on 401")
	}

	if callCount != 2 {
		t.Errorf("Expected 2 HTTP calls (original + retry), got %d", callCount)
	}

	if response.Text != "Success after refresh" {
		t.Errorf("Unexpected response after refresh: %s", response.Text)
	}
}

func TestQuery_BillingSuspendedError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		resp := map[string]interface{}{
			"error": "billing_suspended",
			"message": "Your account has been suspended due to billing issues",
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := api.NewClient(server.URL, "test-token", "test-client-id")
	_, err := client.Query("test question")

	if err == nil {
		t.Fatal("Expected error for billing suspended, got nil")
	}

	// Check that it's a structured billing error
	if err.Error() != "billing suspended: Your account has been suspended due to billing issues" {
		t.Errorf("Expected billing suspended error, got: %v", err)
	}
}

func TestQuery_NetworkTimeout(t *testing.T) {
	// Create a server that delays response
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(15 * time.Second) // Longer than default 10s timeout
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := api.NewClient(server.URL, "test-token", "test-client-id")
	
	// Set a short timeout for testing
	client.SetTimeout(100 * time.Millisecond)

	_, err := client.Query("test question")

	if err == nil {
		t.Fatal("Expected timeout error, got nil")
	}

	// Check that it's a timeout error
	if err.Error() != "request timeout" && err.Error() != "context deadline exceeded" {
		t.Logf("Got error (acceptable): %v", err)
	}
}

func TestQuery_DefaultTimeout(t *testing.T) {
	client := api.NewClient("http://example.com", "test-token", "test-client-id")
	
	timeout := client.GetTimeout()
	if timeout != 10*time.Second {
		t.Errorf("Expected default timeout 10s, got %v", timeout)
	}
}

func TestNewClient_SetsHeaders(t *testing.T) {
	headersCaptured := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "Bearer my-token" && 
		   r.Header.Get("X-Client-ID") == "my-client-id" {
			headersCaptured = true
		}
		resp := api.QueryResponse{Text: "ok", Confidence: 1.0, Sources: []string{}, Escalated: false}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := api.NewClient(server.URL, "my-token", "my-client-id")
	client.Query("test")

	if !headersCaptured {
		t.Error("Expected Authorization and X-Client-ID headers to be set")
	}
}
