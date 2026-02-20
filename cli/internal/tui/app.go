package tui

import (
	"github.com/askkaya/cli/internal/api"
	"github.com/askkaya/cli/internal/auth"
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
	email    string
	password string
	// Query screen fields
	question string
	response string
	err      error
}

// NewApp creates a new TUI application
func NewApp(tokens *auth.AuthTokens) tea.Model {
	state := "login"
	if tokens != nil && tokens.IDToken != "" {
		state = "query"
	}
	
	return &App{
		tokens:    tokens,
		apiClient: nil, // Will use real API client in production
		state:     state,
	}
}

// NewAppWithAPI creates a new TUI application with a custom API client (for testing)
func NewAppWithAPI(tokens *auth.AuthTokens, apiClient APIClient) tea.Model {
	state := "login"
	if tokens != nil && tokens.IDToken != "" {
		state = "query"
	}
	
	return &App{
		tokens:    tokens,
		apiClient: apiClient,
		state:     state,
	}
}

// Init initializes the application
func (a *App) Init() tea.Cmd {
	return nil
}

// Update handles messages and updates the model
func (a *App) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyCtrlC, tea.KeyEscape:
			return a, tea.Quit
		case tea.KeyTab:
			// Switch focus between fields in login screen
			return a, nil
		case tea.KeyEnter:
			if a.state == "query" && a.question != "" {
				// Send query
				return a, a.sendQuery()
			}
			return a, nil
		case tea.KeyRunes:
			// Handle text input
			if a.state == "login" {
				a.email += string(msg.Runes)
			} else if a.state == "query" {
				a.question += string(msg.Runes)
			}
			return a, nil
		}
	case tea.WindowSizeMsg:
		a.width = msg.Width
		a.height = msg.Height
		return a, nil
	case queryResponseMsg:
		a.response = msg.response.Text
		a.err = nil
		return a, nil
	case queryErrorMsg:
		a.err = msg.err
		return a, nil
	}
	
	return a, nil
}

// View renders the UI
func (a *App) View() string {
	if a.state == "login" {
		return a.renderLogin()
	}
	return a.renderQuery()
}

func (a *App) renderLogin() string {
	view := "Login\n\n"
	view += "Email: " + a.email + "\n"
	view += "Password: "
	for range a.password {
		view += "*"
	}
	view += "\n"
	return view
}

func (a *App) renderQuery() string {
	view := "Query Screen\n\n"
	view += "Ask your question: " + a.question + "\n\n"
	
	if a.err != nil {
		view += "Error: " + a.err.Error() + "\n"
	}
	
	if a.response != "" {
		view += "Response: " + a.response + "\n"
	}
	
	return view
}

// Message types for async operations
type queryResponseMsg struct {
	response api.QueryResponse
}

type queryErrorMsg struct {
	err error
}

func (a *App) sendQuery() tea.Cmd {
	return func() tea.Msg {
		if a.apiClient == nil {
			return queryErrorMsg{err: nil}
		}
		
		response, err := a.apiClient.Query(a.question)
		if err != nil {
			return queryErrorMsg{err: err}
		}
		
		return queryResponseMsg{response: response}
	}
}
