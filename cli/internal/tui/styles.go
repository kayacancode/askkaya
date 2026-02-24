package tui

import (
	"github.com/charmbracelet/lipgloss"
)

var (
	// Colors
	primaryColor   = lipgloss.Color("205")
	secondaryColor = lipgloss.Color("39")
	errorColor     = lipgloss.Color("196")
	successColor   = lipgloss.Color("82")
	warningColor   = lipgloss.Color("214")
	subtleColor    = lipgloss.Color("241")

	// Title styles
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(primaryColor).
			MarginBottom(1)

	subtitleStyle = lipgloss.NewStyle().
			Foreground(subtleColor).
			MarginBottom(1)

	// Input styles
	inputLabelStyle = lipgloss.NewStyle().
			Foreground(secondaryColor).
			Bold(true)

	inputFieldStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(subtleColor).
			Padding(0, 1)

	inputFocusedStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(primaryColor).
				Padding(0, 1)

	// Error styles
	errorStyle = lipgloss.NewStyle().
			Foreground(errorColor).
			Bold(true)

	errorBoxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(errorColor).
			Padding(0, 1)

	// Success styles
	successStyle = lipgloss.NewStyle().
			Foreground(successColor)

	// Response styles
	responseStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(secondaryColor).
			Padding(1, 2).
			MarginTop(1)

	responseBoxStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(secondaryColor).
				Padding(1, 2)

	// Loading style
	loadingStyle = lipgloss.NewStyle().
			Foreground(secondaryColor).
			Bold(true)

	// Escalation style
	escalationStyle = lipgloss.NewStyle().
				Foreground(warningColor).
				Bold(true)

	// Scroll info style
	scrollInfoStyle = lipgloss.NewStyle().
				Foreground(subtleColor).
				Italic(true)

	// Confidence styles
	confidenceHighStyle = lipgloss.NewStyle().
				Foreground(successColor).
				Bold(true)

	confidenceMediumStyle = lipgloss.NewStyle().
				Foreground(warningColor).
				Bold(true)

	confidenceLowStyle = lipgloss.NewStyle().
				Foreground(errorColor).
				Bold(true)

	// Source styles
	sourceStyle = lipgloss.NewStyle().
			Foreground(subtleColor).
			PaddingLeft(2)

	// Help text
	helpStyle = lipgloss.NewStyle().
			Foreground(subtleColor).
			MarginTop(1)
)

// getConfidenceStyle returns the appropriate style based on confidence score
func getConfidenceStyle(confidence float64) lipgloss.Style {
	if confidence >= 0.8 {
		return confidenceHighStyle
	}
	if confidence >= 0.5 {
		return confidenceMediumStyle
	}
	return confidenceLowStyle
}
