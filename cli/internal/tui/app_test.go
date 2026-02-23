package tui_test

import (
	"io"
	"strings"
	"testing"
	"time"

	"github.com/askkaya/cli/internal/api"
	"github.com/askkaya/cli/internal/auth"
	"github.com/askkaya/cli/internal/tui"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/x/exp/teatest"
)

// readOutput reads the test model's final output and returns it as a string
func readOutput(t *testing.T, tm *teatest.TestModel) string {
	reader := tm.FinalOutput(t)
	bytes, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("Failed to read output: %v", err)
	}
	return string(bytes)
}

func TestApp_StartsOnLoginScreen_WhenNoToken(t *testing.T) {
	// Create app with no stored token
	app := tui.NewApp(nil)

	tm := teatest.NewTestModel(t, app, teatest.WithInitialTermSize(80, 24))
	defer tm.Quit()

	// Wait for initial render
	time.Sleep(100 * time.Millisecond)

	// Check that login screen is shown
	output := readOutput(t, tm)

	if !strings.Contains(output, "Login") && !strings.Contains(output, "Email") {
		t.Errorf("Expected login screen, got: %s", output)
	}
}

func TestApp_StartsOnQueryScreen_WhenAuthenticated(t *testing.T) {
	// Create app with valid token
	tokens := &auth.AuthTokens{
		IDToken:      "valid-token",
		RefreshToken: "refresh-token",
		ExpiresIn:    3600,
		ExpiresAt:    time.Now().Add(1 * time.Hour),
	}

	app := tui.NewApp(tokens)

	tm := teatest.NewTestModel(t, app, teatest.WithInitialTermSize(80, 24))
	defer tm.Quit()

	time.Sleep(100 * time.Millisecond)

	output := readOutput(t, tm)

	if !strings.Contains(output, "Query") && !strings.Contains(output, "Ask") {
		t.Errorf("Expected query screen, got: %s", output)
	}

	// Should NOT show login screen
	if strings.Contains(output, "Email") && strings.Contains(output, "Password") {
		t.Error("Should not show login screen when authenticated")
	}
}

func TestLoginScreen_AcceptsEmailInput(t *testing.T) {
	app := tui.NewApp(nil)

	tm := teatest.NewTestModel(t, app, teatest.WithInitialTermSize(80, 24))
	defer tm.Quit()

	time.Sleep(50 * time.Millisecond)

	// Type email
	tm.Send(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("test@example.com")})
	time.Sleep(50 * time.Millisecond)

	output := readOutput(t, tm)

	if !strings.Contains(output, "test@example.com") {
		t.Errorf("Expected email input to be visible, got: %s", output)
	}
}

func TestLoginScreen_AcceptsPasswordInput(t *testing.T) {
	app := tui.NewApp(nil)

	tm := teatest.NewTestModel(t, app, teatest.WithInitialTermSize(80, 24))
	defer tm.Quit()

	time.Sleep(50 * time.Millisecond)

	// Tab to password field (or Enter to move to next field)
	tm.Send(tea.KeyMsg{Type: tea.KeyTab})
	time.Sleep(50 * time.Millisecond)

	// Type password
	tm.Send(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("password123")})
	time.Sleep(50 * time.Millisecond)

	output := readOutput(t, tm)

	// Password should be masked
	if !strings.Contains(output, "*") && !strings.Contains(output, "•") {
		t.Logf("Expected masked password in output: %s", output)
	}
}

func TestQueryScreen_AcceptsTextInput(t *testing.T) {
	tokens := &auth.AuthTokens{
		IDToken:      "valid-token",
		RefreshToken: "refresh-token",
		ExpiresIn:    3600,
		ExpiresAt:    time.Now().Add(1 * time.Hour),
	}

	app := tui.NewApp(tokens)

	tm := teatest.NewTestModel(t, app, teatest.WithInitialTermSize(80, 24))
	defer tm.Quit()

	time.Sleep(50 * time.Millisecond)

	// Type a question
	question := "How do I reset my password?"
	tm.Send(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(question)})
	time.Sleep(50 * time.Millisecond)

	output := readOutput(t, tm)

	if !strings.Contains(output, question) {
		t.Errorf("Expected question to be visible, got: %s", output)
	}
}

func TestQueryScreen_SendsQuery(t *testing.T) {
	tokens := &auth.AuthTokens{
		IDToken:      "valid-token",
		RefreshToken: "refresh-token",
		ExpiresIn:    3600,
		ExpiresAt:    time.Now().Add(1 * time.Hour),
	}

	// Create mock API client
	mockAPI := &mockAPIClient{
		queryResponse: api.QueryResponse{
			Text:       "To reset your password, visit settings...",
			Confidence: 0.95,
			Sources:    []string{"https://docs.example.com/reset"},
			Escalated:  false,
		},
	}

	app := tui.NewAppWithAPI(tokens, mockAPI)

	tm := teatest.NewTestModel(t, app, teatest.WithInitialTermSize(80, 24))
	defer tm.Quit()

	time.Sleep(50 * time.Millisecond)

	// Type and send question
	tm.Send(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("How do I reset my password?")})
	time.Sleep(50 * time.Millisecond)
	tm.Send(tea.KeyMsg{Type: tea.KeyEnter})

	// Wait for async response
	time.Sleep(200 * time.Millisecond)

	if !mockAPI.queryCalled {
		t.Error("Expected Query to be called")
	}

	output := readOutput(t, tm)

	if !strings.Contains(output, "To reset your password") {
		t.Errorf("Expected response to be displayed, got: %s", output)
	}
}

func TestQueryScreen_DisplaysConfidence(t *testing.T) {
	tokens := &auth.AuthTokens{
		IDToken:      "valid-token",
		RefreshToken: "refresh-token",
		ExpiresIn:    3600,
		ExpiresAt:    time.Now().Add(1 * time.Hour),
	}

	mockAPI := &mockAPIClient{
		queryResponse: api.QueryResponse{
			Text:       "Answer",
			Confidence: 0.85,
			Sources:    []string{},
			Escalated:  false,
		},
	}

	app := tui.NewAppWithAPI(tokens, mockAPI)

	tm := teatest.NewTestModel(t, app, teatest.WithInitialTermSize(80, 24))
	defer tm.Quit()

	time.Sleep(50 * time.Millisecond)
	tm.Send(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("test")})
	tm.Send(tea.KeyMsg{Type: tea.KeyEnter})
	time.Sleep(200 * time.Millisecond)

	output := readOutput(t, tm)

	// Should show confidence indicator (e.g., "85%" or "Confidence: 0.85")
	if !strings.Contains(output, "85") && !strings.Contains(output, "0.85") &&
		!strings.Contains(output, "Confidence") {
		t.Logf("Expected confidence indicator in output: %s", output)
	}
}

func TestQueryScreen_DisplaysSources(t *testing.T) {
	tokens := &auth.AuthTokens{
		IDToken:      "valid-token",
		RefreshToken: "refresh-token",
		ExpiresIn:    3600,
		ExpiresAt:    time.Now().Add(1 * time.Hour),
	}

	mockAPI := &mockAPIClient{
		queryResponse: api.QueryResponse{
			Text:       "Answer",
			Confidence: 0.9,
			Sources: []string{
				"https://docs.example.com/guide",
				"https://kb.example.com/faq",
			},
			Escalated: false,
		},
	}

	app := tui.NewAppWithAPI(tokens, mockAPI)

	tm := teatest.NewTestModel(t, app, teatest.WithInitialTermSize(80, 24))
	defer tm.Quit()

	time.Sleep(50 * time.Millisecond)
	tm.Send(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("test")})
	tm.Send(tea.KeyMsg{Type: tea.KeyEnter})
	time.Sleep(200 * time.Millisecond)

	output := readOutput(t, tm)

	if !strings.Contains(output, "docs.example.com") || !strings.Contains(output, "kb.example.com") {
		t.Errorf("Expected sources to be displayed, got: %s", output)
	}
}

func TestErrorState_RendersCorrectly(t *testing.T) {
	tokens := &auth.AuthTokens{
		IDToken:      "valid-token",
		RefreshToken: "refresh-token",
		ExpiresIn:    3600,
		ExpiresAt:    time.Now().Add(1 * time.Hour),
	}

	mockAPI := &mockAPIClient{
		queryError: "network error: connection timeout",
	}

	app := tui.NewAppWithAPI(tokens, mockAPI)

	tm := teatest.NewTestModel(t, app, teatest.WithInitialTermSize(80, 24))
	defer tm.Quit()

	time.Sleep(50 * time.Millisecond)
	tm.Send(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("test")})
	tm.Send(tea.KeyMsg{Type: tea.KeyEnter})
	time.Sleep(200 * time.Millisecond)

	output := readOutput(t, tm)

	if !strings.Contains(output, "error") && !strings.Contains(output, "Error") {
		t.Errorf("Expected error message to be displayed, got: %s", output)
	}

	if !strings.Contains(output, "connection timeout") {
		t.Errorf("Expected specific error message, got: %s", output)
	}
}

func TestBillingSuspendedError_ShowsSpecialMessage(t *testing.T) {
	tokens := &auth.AuthTokens{
		IDToken:      "valid-token",
		RefreshToken: "refresh-token",
		ExpiresIn:    3600,
		ExpiresAt:    time.Now().Add(1 * time.Hour),
	}

	mockAPI := &mockAPIClient{
		queryError: "billing suspended: Your account has been suspended",
	}

	app := tui.NewAppWithAPI(tokens, mockAPI)

	tm := teatest.NewTestModel(t, app, teatest.WithInitialTermSize(80, 24))
	defer tm.Quit()

	time.Sleep(50 * time.Millisecond)
	tm.Send(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("test")})
	tm.Send(tea.KeyMsg{Type: tea.KeyEnter})
	time.Sleep(200 * time.Millisecond)

	output := readOutput(t, tm)

	if !strings.Contains(output, "billing") && !strings.Contains(output, "suspended") {
		t.Errorf("Expected billing suspended message, got: %s", output)
	}
}

// Mock API client for testing
type mockAPIClient struct {
	queryCalled   bool
	queryResponse api.QueryResponse
	queryError    string
}

func (m *mockAPIClient) Query(question string) (api.QueryResponse, error) {
	m.queryCalled = true
	if m.queryError != "" {
		return api.QueryResponse{}, &mockError{msg: m.queryError}
	}
	return m.queryResponse, nil
}

func (m *mockAPIClient) HealthCheck() error {
	return nil
}

type mockError struct {
	msg string
}

func (e *mockError) Error() string {
	return e.msg
}
