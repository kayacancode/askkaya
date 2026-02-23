package tui

import (
	"fmt"
	"strings"

	"github.com/askkaya/cli/internal/api"
	"github.com/askkaya/cli/internal/auth"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
)

// APIClient interface for making API calls
type APIClient interface {
	Query(question string) (api.QueryResponse, error)
	HealthCheck() error
}

// App is the main TUI application model
type App struct {
	tokens    *auth.AuthTokens
	apiClient APIClient
	width     int
	height    int
	state     string // "login" or "query"

	// Login screen fields
	emailInput    textinput.Model
	passwordInput textinput.Model
	focusIndex    int
	loginError    string

	// Query screen fields
	queryInput textinput.Model
	response   *api.QueryResponse
	err        error
	loading    bool
}

// NewApp creates a new TUI application
func NewApp(tokens *auth.AuthTokens) tea.Model {
	return newApp(tokens, nil)
}

// NewAppWithAPI creates a new TUI application with a custom API client (for testing)
func NewAppWithAPI(tokens *auth.AuthTokens, apiClient APIClient) tea.Model {
	return newApp(tokens, apiClient)
}

func newApp(tokens *auth.AuthTokens, apiClient APIClient) *App {
	state := "login"
	if tokens != nil && tokens.IDToken != "" {
		state = "query"
	}

	// Create email input
	emailInput := textinput.New()
	emailInput.Placeholder = "email@example.com"
	emailInput.CharLimit = 100
	emailInput.Width = 40

	// Create password input
	passwordInput := textinput.New()
	passwordInput.Placeholder = "password"
	passwordInput.CharLimit = 100
	passwordInput.Width = 40
	passwordInput.EchoMode = textinput.EchoPassword
	passwordInput.EchoCharacter = '*'

	// Create query input
	queryInput := textinput.New()
	queryInput.Placeholder = "Type your question..."
	queryInput.CharLimit = 500
	queryInput.Width = 60

	// Focus appropriate input
	if state == "login" {
		emailInput.Focus()
	} else {
		queryInput.Focus()
	}

	return &App{
		tokens:        tokens,
		apiClient:     apiClient,
		state:         state,
		emailInput:    emailInput,
		passwordInput: passwordInput,
		queryInput:    queryInput,
		focusIndex:    0,
	}
}

// Init initializes the application
func (a *App) Init() tea.Cmd {
	return textinput.Blink
}

// Update handles messages and updates the model
func (a *App) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyCtrlC, tea.KeyEscape:
			return a, tea.Quit

		case tea.KeyTab:
			if a.state == "login" {
				// Toggle focus between email and password
				a.focusIndex = (a.focusIndex + 1) % 2
				if a.focusIndex == 0 {
					a.emailInput.Focus()
					a.passwordInput.Blur()
				} else {
					a.emailInput.Blur()
					a.passwordInput.Focus()
				}
			}
			return a, nil

		case tea.KeyEnter:
			if a.state == "query" && a.queryInput.Value() != "" && !a.loading {
				a.loading = true
				return a, a.sendQuery()
			}
			return a, nil
		}

	case tea.WindowSizeMsg:
		a.width = msg.Width
		a.height = msg.Height
		return a, nil

	case queryResponseMsg:
		a.loading = false
		a.response = &msg.response
		a.err = nil
		return a, nil

	case queryErrorMsg:
		a.loading = false
		a.err = msg.err
		return a, nil
	}

	// Handle text input updates
	var cmd tea.Cmd
	if a.state == "login" {
		if a.focusIndex == 0 {
			a.emailInput, cmd = a.emailInput.Update(msg)
		} else {
			a.passwordInput, cmd = a.passwordInput.Update(msg)
		}
	} else {
		a.queryInput, cmd = a.queryInput.Update(msg)
	}

	return a, cmd
}

// View renders the UI
func (a *App) View() string {
	if a.state == "login" {
		return a.renderLogin()
	}
	return a.renderQuery()
}

func (a *App) renderLogin() string {
	var b strings.Builder

	b.WriteString(titleStyle.Render("AskKaya Login"))
	b.WriteString("\n\n")

	// Email field
	b.WriteString(inputLabelStyle.Render("Email"))
	b.WriteString("\n")
	if a.focusIndex == 0 {
		b.WriteString(inputFocusedStyle.Render(a.emailInput.View()))
	} else {
		b.WriteString(inputFieldStyle.Render(a.emailInput.View()))
	}
	b.WriteString("\n\n")

	// Password field
	b.WriteString(inputLabelStyle.Render("Password"))
	b.WriteString("\n")
	if a.focusIndex == 1 {
		b.WriteString(inputFocusedStyle.Render(a.passwordInput.View()))
	} else {
		b.WriteString(inputFieldStyle.Render(a.passwordInput.View()))
	}
	b.WriteString("\n")

	// Error message
	if a.loginError != "" {
		b.WriteString("\n")
		b.WriteString(errorStyle.Render("Error: " + a.loginError))
		b.WriteString("\n")
	}

	// Help text
	b.WriteString("\n")
	b.WriteString(helpStyle.Render("Tab: switch fields • Enter: submit • Esc: quit"))

	return b.String()
}

func (a *App) renderQuery() string {
	var b strings.Builder

	b.WriteString(titleStyle.Render("Ask AskKaya"))
	b.WriteString("\n")
	b.WriteString(subtitleStyle.Render("Query your support knowledge base"))
	b.WriteString("\n\n")

	// Query input
	b.WriteString(inputLabelStyle.Render("Your Question"))
	b.WriteString("\n")
	b.WriteString(inputFocusedStyle.Render(a.queryInput.View()))
	b.WriteString("\n")

	// Loading state
	if a.loading {
		b.WriteString("\n")
		b.WriteString("Thinking...")
		b.WriteString("\n")
	}

	// Error message
	if a.err != nil {
		b.WriteString("\n")
		b.WriteString(errorBoxStyle.Render("Error: " + a.err.Error()))
		b.WriteString("\n")
	}

	// Response
	if a.response != nil {
		b.WriteString("\n")
		b.WriteString(responseStyle.Render(a.response.Text))
		b.WriteString("\n")

		// Confidence
		confidencePercent := int(a.response.Confidence * 100)
		confidenceStyle := getConfidenceStyle(a.response.Confidence)
		b.WriteString(fmt.Sprintf("\nConfidence: %s", confidenceStyle.Render(fmt.Sprintf("%d%%", confidencePercent))))

		// Sources
		if len(a.response.Sources) > 0 {
			b.WriteString("\n\nSources:")
			for _, source := range a.response.Sources {
				b.WriteString("\n")
				b.WriteString(sourceStyle.Render("• " + source))
			}
		}

		// Escalation notice
		if a.response.Escalated {
			b.WriteString("\n\n")
			b.WriteString(warningStyle.Render("This question has been escalated for human review."))
		}
	}

	// Help text
	b.WriteString("\n\n")
	b.WriteString(helpStyle.Render("Enter: submit • Esc: quit"))

	return b.String()
}

// Message types for async operations
type queryResponseMsg struct {
	response api.QueryResponse
}

type queryErrorMsg struct {
	err error
}

func (a *App) sendQuery() tea.Cmd {
	question := a.queryInput.Value()
	return func() tea.Msg {
		if a.apiClient == nil {
			return queryErrorMsg{err: fmt.Errorf("API client not configured")}
		}

		response, err := a.apiClient.Query(question)
		if err != nil {
			return queryErrorMsg{err: err}
		}

		return queryResponseMsg{response: response}
	}
}

// Warning style for escalation notices
var warningStyle = errorStyle.Copy().Foreground(warningColor)
