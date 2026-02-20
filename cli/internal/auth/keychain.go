package auth

import (
	"encoding/json"
	"errors"
	"fmt"

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
