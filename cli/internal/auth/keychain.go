package auth

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/zalando/go-keyring"
)

const keychainKey = "tokens"

// Keychain manages secure token storage
type Keychain struct {
	service string
}

// NewKeychain creates a new keychain manager
func NewKeychain(service string) *Keychain {
	return &Keychain{
		service: service,
	}
}

// StoreTokens securely stores authentication tokens
func (k *Keychain) StoreTokens(tokens AuthTokens) error {
	data, err := json.Marshal(tokens)
	if err != nil {
		return fmt.Errorf("failed to marshal tokens: %w", err)
	}

	err = keyring.Set(k.service, keychainKey, string(data))
	if err != nil {
		return fmt.Errorf("failed to store tokens in keychain: %w", err)
	}

	return nil
}

// LoadTokens retrieves tokens from secure storage
func (k *Keychain) LoadTokens() (*AuthTokens, error) {
	data, err := keyring.Get(k.service, keychainKey)
	if err != nil {
		// Check if it's a "not found" error
		if errors.Is(err, keyring.ErrNotFound) || err.Error() == "secret not found in keyring" {
			return nil, errors.New("tokens not found in keychain")
		}
		return nil, fmt.Errorf("failed to retrieve tokens from keychain: %w", err)
	}

	var tokens AuthTokens
	if err := json.Unmarshal([]byte(data), &tokens); err != nil {
		return nil, fmt.Errorf("failed to unmarshal tokens: %w", err)
	}

	return &tokens, nil
}

// ClearTokens removes tokens from secure storage
func (k *Keychain) ClearTokens() error {
	err := keyring.Delete(k.service, keychainKey)
	if err != nil {
		// Ignore "not found" errors
		if errors.Is(err, keyring.ErrNotFound) || err.Error() == "secret not found in keyring" {
			return nil
		}
		return fmt.Errorf("failed to clear tokens from keychain: %w", err)
	}

	return nil
}

// LoadAndRefreshTokens loads tokens and auto-refreshes if expired
// Returns valid tokens or an error if refresh fails
func (k *Keychain) LoadAndRefreshTokens(apiKey string) (*AuthTokens, error) {
	tokens, err := k.LoadTokens()
	if err != nil {
		return nil, err
	}

	// Check if token is expired or about to expire (within 5 minutes)
	if time.Now().After(tokens.ExpiresAt.Add(-5 * time.Minute)) {
		// Token is expired or about to expire, refresh it
		authClient := NewClient(apiKey, "https://securetoken.googleapis.com")
		newTokens, err := authClient.RefreshToken(tokens.RefreshToken)
		if err != nil {
			return nil, fmt.Errorf("token expired and refresh failed: %w", err)
		}

		// Preserve user info from old tokens
		newTokens.ClientID = tokens.ClientID
		newTokens.UserID = tokens.UserID
		newTokens.Email = tokens.Email
		newTokens.Role = tokens.Role
		// Preserve tenant info
		newTokens.TenantID = tokens.TenantID
		newTokens.Memberships = tokens.Memberships

		// Save refreshed tokens
		if err := k.StoreTokens(*newTokens); err != nil {
			// Log but don't fail - we still have valid tokens
			fmt.Printf("Warning: could not save refreshed tokens: %v\n", err)
		}

		return newTokens, nil
	}

	return tokens, nil
}
