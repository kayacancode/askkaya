package auth_test

import (
	"testing"
	"time"

	"github.com/askkaya/cli/internal/auth"
	"github.com/zalando/go-keyring"
)

const testService = "askkaya-test"

func TestStoreTokens_Success(t *testing.T) {
	// Use test service to avoid polluting real keychain
	keyring.MockInit()
	
	keychain := auth.NewKeychain(testService)
	tokens := auth.AuthTokens{
		IDToken:      "test-id-token",
		RefreshToken: "test-refresh-token",
		ExpiresIn:    3600,
		ExpiresAt:    time.Now().Add(1 * time.Hour),
	}

	err := keychain.StoreTokens(tokens)
	if err != nil {
		t.Fatalf("StoreTokens failed: %v", err)
	}

	// Verify it was stored by retrieving it
	stored, err := keyring.Get(testService, "tokens")
	if err != nil {
		t.Fatalf("Failed to retrieve from keyring: %v", err)
	}

	if stored == "" {
		t.Error("Expected non-empty stored data")
	}
}

func TestLoadTokens_Success(t *testing.T) {
	keyring.MockInit()
	
	keychain := auth.NewKeychain(testService)
	
	// First store some tokens
	originalTokens := auth.AuthTokens{
		IDToken:      "stored-id-token",
		RefreshToken: "stored-refresh-token",
		ExpiresIn:    3600,
		ExpiresAt:    time.Now().Add(1 * time.Hour),
	}
	
	err := keychain.StoreTokens(originalTokens)
	if err != nil {
		t.Fatalf("Failed to store tokens: %v", err)
	}

	// Now load them back
	loadedTokens, err := keychain.LoadTokens()
	if err != nil {
		t.Fatalf("LoadTokens failed: %v", err)
	}

	if loadedTokens.IDToken != originalTokens.IDToken {
		t.Errorf("Expected IDToken '%s', got '%s'", originalTokens.IDToken, loadedTokens.IDToken)
	}
	if loadedTokens.RefreshToken != originalTokens.RefreshToken {
		t.Errorf("Expected RefreshToken '%s', got '%s'", originalTokens.RefreshToken, loadedTokens.RefreshToken)
	}
	if loadedTokens.ExpiresIn != originalTokens.ExpiresIn {
		t.Errorf("Expected ExpiresIn %d, got %d", originalTokens.ExpiresIn, loadedTokens.ExpiresIn)
	}
}

func TestLoadTokens_NotFound(t *testing.T) {
	keyring.MockInit()
	
	keychain := auth.NewKeychain("askkaya-nonexistent-test")

	_, err := keychain.LoadTokens()
	if err == nil {
		t.Fatal("Expected error when tokens not found, got nil")
	}

	// Should return a descriptive error
	expectedMsg := "tokens not found in keychain"
	if err.Error() != expectedMsg {
		t.Errorf("Expected error '%s', got '%s'", expectedMsg, err.Error())
	}
}

func TestClearTokens_Success(t *testing.T) {
	keyring.MockInit()
	
	keychain := auth.NewKeychain(testService)
	
	// Store tokens first
	tokens := auth.AuthTokens{
		IDToken:      "to-be-deleted",
		RefreshToken: "refresh-to-be-deleted",
		ExpiresIn:    3600,
		ExpiresAt:    time.Now().Add(1 * time.Hour),
	}
	
	err := keychain.StoreTokens(tokens)
	if err != nil {
		t.Fatalf("Failed to store tokens: %v", err)
	}

	// Clear them
	err = keychain.ClearTokens()
	if err != nil {
		t.Fatalf("ClearTokens failed: %v", err)
	}

	// Verify they're gone
	_, err = keychain.LoadTokens()
	if err == nil {
		t.Fatal("Expected error after clearing tokens, got nil")
	}
}

func TestClearTokens_NoTokensToDelete(t *testing.T) {
	keyring.MockInit()
	
	keychain := auth.NewKeychain("askkaya-empty-test")

	// Should not error when clearing non-existent tokens
	err := keychain.ClearTokens()
	if err != nil {
		t.Errorf("ClearTokens should not fail when no tokens exist, got: %v", err)
	}
}

func TestKeychain_UsesCorrectService(t *testing.T) {
	keyring.MockInit()
	
	keychain := auth.NewKeychain("askkaya")
	
	tokens := auth.AuthTokens{
		IDToken:      "service-test-token",
		RefreshToken: "service-test-refresh",
		ExpiresIn:    3600,
		ExpiresAt:    time.Now().Add(1 * time.Hour),
	}
	
	err := keychain.StoreTokens(tokens)
	if err != nil {
		t.Fatalf("Failed to store tokens: %v", err)
	}

	// Try to retrieve with the correct service name
	_, err = keyring.Get("askkaya", "tokens")
	if err != nil {
		t.Error("Expected tokens to be stored under service 'askkaya'")
	}

	// Try to retrieve with wrong service name (should fail)
	_, err = keyring.Get("wrong-service", "tokens")
	if err == nil {
		t.Error("Should not be able to retrieve tokens with wrong service name")
	}
}
