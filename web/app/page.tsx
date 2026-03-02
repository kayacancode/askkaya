'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import './marketing.css'

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<'cli' | 'mcp' | 'skill'>('cli')
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const codeExamples = {
    cli: `# Install AskKaya
brew tap kayacancode/askkaya
brew install askkaya

# Sign up (invite-only)
askkaya auth signup -c YOUR_INVITE_CODE -e you@email.com

# Log in
askkaya auth login -e you@email.com

# Ask anything
askkaya query "How do I configure Honcho memory?"`,
    mcp: `{
  "mcpServers": {
    "askkaya": {
      "transport": "http",
      "url": "https://api.askkaya.com/mcp"
    }
  }
}

// Your AI agent can now automatically query the knowledge base
// No manual commands needed`,
    skill: `# Quick install
curl -sL https://raw.githubusercontent.com/kayacancode/askkaya/main/skills/install.sh | bash

# Then use in your AI assistant
/askkaya How do I set up OpenClaw?

# The skill calls the CLI under the hood`
  }

  return (
    <div className="marketing-page">
      {/* Floating nav */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'nav-scrolled' : ''}`}>
        <div className="nav-container">
          <Link href="/" className="logo-text">
            <span className="logo-ask">Ask</span>
            <span className="logo-kaya">Kaya</span>
          </Link>

          <div className="nav-links">
            <Link href="#features" className="nav-link">Features</Link>
            <Link href="#how-it-works" className="nav-link">How It Works</Link>
            <Link href="#integrate" className="nav-link">Integrate</Link>
          </div>

          <div className="nav-actions">
            <Link href="#get-started" className="btn-primary">
              Request Access
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-bg">
          <div className="hero-grid" />
          <div className="hero-glow" />
          {/* Neural connection SVG */}
          <div className="neural-lines">
            <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
              <path className="neural-line" d="M0,400 Q300,300 600,400 T1200,400" />
              <path className="neural-line" d="M0,300 Q400,400 800,300 T1200,350" style={{ animationDelay: '-5s' }} />
              <path className="neural-line" d="M0,500 Q350,450 700,500 T1200,450" style={{ animationDelay: '-10s' }} />
            </svg>
          </div>
        </div>

        <div className="hero-content">
          <div className="hero-badge">
            Pre-Launch Access
          </div>

          <h1 className="hero-title">
            <span className="hero-title-line">Have a question?</span>
            <span className="hero-title-line hero-title-accent">Ask Kaya</span>
          </h1>

          <p className="hero-subtitle">
            AskKaya answers your questions the way I would. It learns from every interaction.
            If it doesn&apos;t know, it asks me—and remembers for next time.
          </p>

          <div className="hero-actions">
            <a href="#get-started" className="btn-primary">
              Request Access
            </a>
          </div>

          <div className="stats-bar">
            <div className="stat-item">
              <span className="stat-value">RAG</span>
              <span className="stat-label">Powered</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">MCP</span>
              <span className="stat-label">Native</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">CLI</span>
              <span className="stat-label">First</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="max-w-7xl mx-auto">
          <span className="section-label">Capabilities</span>
          <h2 className="section-title">
            Built for the age of AI agents
          </h2>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: '#D97706' }}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
                  <path d="M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                </svg>
              </div>
              <h3 className="feature-title">RAG-Powered Answers</h3>
              <p className="feature-desc">
                Retrieves context from your personal knowledge base using
                semantic search. Answers feel personal because they are.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: '#D97706' }}>
                  <path d="M12 3v18M3 12h18" />
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 3" />
                </svg>
              </div>
              <h3 className="feature-title">Auto-Learning</h3>
              <p className="feature-desc">
                When escalated questions get answered, those answers are
                automatically added to the knowledge base. It gets smarter with use.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: '#D97706' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </div>
              <h3 className="feature-title">Vision Support</h3>
              <p className="feature-desc">
                Parse screenshots, error messages, and images. Just attach an
                image to your query and get contextual help.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: '#D97706' }}>
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <h3 className="feature-title">Smart Escalation</h3>
              <p className="feature-desc">
                Low confidence answers automatically escalate via Telegram.
                Human expertise when needed, automation when possible.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: '#D97706' }}>
                  <path d="M12 2a10 10 0 1 0 10 10" />
                  <path d="M12 12l8-8" />
                  <path d="M16 4h4v4" />
                </svg>
              </div>
              <h3 className="feature-title">Multi-Tenant KB</h3>
              <p className="feature-desc">
                Personal, client, and global knowledge scopes. Control exactly
                who sees what with fine-grained access control.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: '#D97706' }}>
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <path d="M9 9h6v6H9z" />
                  <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
                </svg>
              </div>
              <h3 className="feature-title">Agent Native</h3>
              <p className="feature-desc">
                Built for AI agents from day one. MCP server integration means
                your agents query knowledge automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="how-section">
        <div className="max-w-7xl mx-auto text-center mb-16">
          <span className="section-label">How It Works</span>
          <h2 className="section-title">
            The more you use it, the smarter it gets
          </h2>
        </div>

        <div className="how-steps">
          <div className="how-step">
            <div className="step-content">
              <h3 className="step-title">Ask a Question</h3>
              <p className="step-desc">
                Query via CLI, MCP server, or AI assistant skill.
                Natural language, code snippets, or screenshots.
              </p>
            </div>
            <div className="step-number">01</div>
            <div className="step-visual" />
          </div>

          <div className="how-step">
            <div className="step-visual" />
            <div className="step-number">02</div>
            <div className="step-content">
              <h3 className="step-title">Knowledge Retrieval</h3>
              <p className="step-desc">
                RAG searches your knowledge base using semantic embeddings.
                Finds the most relevant context for your question.
              </p>
            </div>
          </div>

          <div className="how-step">
            <div className="step-content">
              <h3 className="step-title">Get an Answer</h3>
              <p className="step-desc">
                Claude generates a response using your KB context.
                If confidence is low, escalates to Kaya directly.
              </p>
            </div>
            <div className="step-number">03</div>
            <div className="step-visual" />
          </div>

          <div className="how-step">
            <div className="step-visual" />
            <div className="step-number">04</div>
            <div className="step-content">
              <h3 className="step-title">Auto-Learn</h3>
              <p className="step-desc">
                Escalation replies are saved to the KB automatically.
                Next time someone asks, the digital twin knows.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Integration Section */}
      <section id="integrate" className="integrate-section">
        <div className="integrate-content">
          <span className="section-label">Integration</span>
          <h2 className="section-title">
            Three ways to connect
          </h2>

          <div className="integration-tabs">
            <button
              className={`integration-tab ${activeTab === 'cli' ? 'active' : ''}`}
              onClick={() => setActiveTab('cli')}
            >
              CLI Tool
            </button>
            <button
              className={`integration-tab ${activeTab === 'mcp' ? 'active' : ''}`}
              onClick={() => setActiveTab('mcp')}
            >
              MCP Server
            </button>
            <button
              className={`integration-tab ${activeTab === 'skill' ? 'active' : ''}`}
              onClick={() => setActiveTab('skill')}
            >
              AI Skill
            </button>
          </div>

          <div className="code-block">
            <div className="code-header">
              <span className="code-dot" />
              <span className="code-dot" />
              <span className="code-dot" />
              <span className="code-title">
                {activeTab === 'cli' && 'terminal'}
                {activeTab === 'mcp' && 'mcp-config.json'}
                {activeTab === 'skill' && 'terminal'}
              </span>
            </div>
            <div className="code-content">
              <pre>
                {codeExamples[activeTab].split('\n').map((line, i) => {
                  if (line.startsWith('#') || line.startsWith('//')) {
                    return <div key={i}><span className="code-comment">{line}</span></div>
                  }
                  if (line.includes('"')) {
                    return (
                      <div key={i}>
                        {line.split(/(\"[^\"]*\")/).map((part, j) => {
                          if (part.startsWith('"')) {
                            return <span key={j} className="code-string">{part}</span>
                          }
                          return <span key={j}>{part}</span>
                        })}
                      </div>
                    )
                  }
                  if (line.includes('askkaya') || line.includes('curl') || line.includes('brew')) {
                    return (
                      <div key={i}>
                        {line.split(/(\b(?:askkaya|brew|curl)\b)/).map((part, j) => {
                          if (['askkaya', 'brew', 'curl'].includes(part)) {
                            return <span key={j} className="code-func">{part}</span>
                          }
                          return <span key={j}>{part}</span>
                        })}
                      </div>
                    )
                  }
                  return <div key={i}>{line}</div>
                })}
              </pre>
            </div>
          </div>

          <p className="text-center mt-8" style={{ color: 'var(--text-secondary)' }}>
            Works with <span style={{ color: 'var(--amber)' }}>Claude Code</span>,{' '}
            <span style={{ color: 'var(--amber)' }}>OpenClaw</span>, and any MCP-compatible client
          </p>
        </div>
      </section>

      {/* CTA Section */}
      <section id="get-started" className="cta-section">
        <div className="cta-content">
          <h2 className="cta-title">
            Want to talk to <span className="text-gradient">my digital twin</span>?
          </h2>
          <p className="cta-subtitle">
            AskKaya is currently invite-only during pre-launch.
            Request access to get answers from my knowledge base anytime.
          </p>

          <a href="mailto:kaya@forever22studios.com" className="btn-primary" style={{ display: 'inline-flex', fontSize: '1rem', padding: '1rem 2rem' }}>
            Request Invite
          </a>

          <p className="mt-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <a href="mailto:kaya@forever22studios.com" style={{ color: 'var(--amber)' }} className="hover:underline">
              kaya@forever22studios.com
            </a>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer-section">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-4 gap-12">
            <div className="col-span-2">
              <div className="logo-text mb-4">
                <span className="logo-ask">Ask</span>
                <span className="logo-kaya">Kaya</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '24rem' }}>
                My digital twin that learns from every interaction.
                Built for the age of AI agents.
              </p>
            </div>

            <div>
              <h4 className="footer-heading">Product</h4>
              <ul className="footer-links">
                <li><Link href="#features">Features</Link></li>
                <li><Link href="#how-it-works">How It Works</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="footer-heading">Connect</h4>
              <ul className="footer-links">
                <li><a href="mailto:kaya@forever22studios.com">Contact</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              &copy; {new Date().getFullYear()} Forever 22 Studios. All rights reserved.
            </p>
            <div className="flex gap-6 text-sm">
              <span className="version-badge">Pre-Launch</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
