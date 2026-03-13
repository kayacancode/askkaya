'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'

export default function Home() {
  const [email, setEmail] = useState('')

  return (
    <main style={{ background: 'linear-gradient(180deg, #FDFDFB 0%, #F0FDF4 50%, #FDFDFB 100%)', minHeight: '100vh' }}>
      {/* Floating Nav */}
      <nav style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="nav-pill"
        >
          <span style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E1A' }}>AskKaya</span>
          <a href="#how" style={{ fontSize: '15px', color: '#4A5A4A', textDecoration: 'none' }}>How it works</a>
          <a href="#teams" style={{ fontSize: '15px', color: '#4A5A4A', textDecoration: 'none' }}>For Organizations</a>
          <button className="btn-green">Get Started</button>
        </motion.div>
      </nav>

      {/* Hero */}
      <section style={{ paddingTop: '160px', paddingBottom: '80px', textAlign: 'center' }}>
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h1 style={{
              fontSize: 'clamp(44px, 6vw, 72px)',
              fontWeight: 600,
              lineHeight: 1.1,
              color: '#1A2E1A',
              marginBottom: '24px',
              letterSpacing: '-0.02em'
            }}>
              Never answer the same
              <br />
              <span style={{ color: '#22C55E' }}>question</span> twice
            </h1>
            <p style={{
              fontSize: '20px',
              color: '#4A5A4A',
              maxWidth: '560px',
              margin: '0 auto 40px',
              lineHeight: 1.6
            }}>
              Your digital twin answers exactly like you would — so you don't have to
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '280px',
                  padding: '14px 20px',
                  fontSize: '15px',
                  border: '1px solid #E8EBE8',
                  borderRadius: '12px',
                  outline: 'none'
                }}
              />
              <button className="btn-green" style={{ padding: '14px 28px' }}>
                Build Your Twin →
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works - Two Cards */}
      <section id="how" style={{ padding: '100px 0' }}>
        <div className="container">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{
              fontSize: 'clamp(36px, 5vw, 52px)',
              fontWeight: 600,
              color: '#22C55E',
              textAlign: 'center',
              marginBottom: '64px',
              letterSpacing: '-0.02em'
            }}
          >
            How it works
          </motion.h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Card 1: Input */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="card"
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '8px' }}>
                <span style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#22C55E',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '16px',
                  flexShrink: 0
                }}>1</span>
                <h3 style={{ fontSize: '24px', fontWeight: 600, color: '#1A2E1A', lineHeight: 1.3 }}>
                  Share your knowledge
                </h3>
              </div>

              <div className="mac-window" style={{ marginTop: '32px' }}>
                <div className="mac-titlebar">
                  <div className="mac-dot mac-dot-red"></div>
                  <div className="mac-dot mac-dot-yellow"></div>
                  <div className="mac-dot mac-dot-green"></div>
                </div>
                <div className="mac-content">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E' }}></div>
                      <span style={{ fontSize: '14px', color: '#4A5A4A' }}>Meeting with Sarah, pricing discussion</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E' }}></div>
                      <span style={{ fontSize: '14px', color: '#4A5A4A' }}>Slack: #team-support</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E' }}></div>
                      <span style={{ fontSize: '14px', color: '#4A5A4A' }}>Document: Refund Policy v3</span>
                    </div>
                    <div style={{
                      marginTop: '12px',
                      padding: '12px 16px',
                      background: '#F0FDF4',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: '#22C55E',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4"/>
                      </svg>
                      Building knowledge graph...
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Card 2: Output */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="card"
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '8px' }}>
                <span style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#22C55E',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '16px',
                  flexShrink: 0
                }}>2</span>
                <h3 style={{ fontSize: '24px', fontWeight: 600, color: '#1A2E1A', lineHeight: 1.3 }}>
                  Someone asks, your twin responds
                </h3>
              </div>

              <div className="mac-window" style={{ marginTop: '32px' }}>
                <div className="mac-titlebar">
                  <div className="mac-dot mac-dot-red"></div>
                  <div className="mac-dot mac-dot-yellow"></div>
                  <div className="mac-dot mac-dot-green"></div>
                </div>
                <div className="mac-content">
                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ fontSize: '12px', color: '#8A9A8A', marginBottom: '6px' }}>@jessica asks</p>
                    <p style={{ fontSize: '14px', color: '#1A2E1A' }}>"What's our refund policy?"</p>
                  </div>
                  <div style={{
                    padding: '16px',
                    background: '#F0FDF4',
                    borderRadius: '12px',
                    borderLeft: '3px solid #22C55E'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: '#22C55E',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: 'white'
                      }}>AI</div>
                      <span style={{ fontSize: '12px', color: '#22C55E', fontWeight: 600 }}>Your Twin</span>
                    </div>
                    <p style={{ fontSize: '14px', color: '#1A2E1A', lineHeight: 1.6 }}>
                      "30 days, no questions asked. We believe in the product and want you to feel confident in your purchase."
                    </p>
                  </div>
                  <p style={{ fontSize: '11px', color: '#8A9A8A', marginTop: '12px' }}>
                    ✓ Based on Refund Policy v3 and meeting with Sarah
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Card 3: Escalation */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="card"
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '8px' }}>
                <span style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#22C55E',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '16px',
                  flexShrink: 0
                }}>3</span>
                <h3 style={{ fontSize: '24px', fontWeight: 600, color: '#1A2E1A', lineHeight: 1.3 }}>
                  Beyond scope? You get a ping
                </h3>
              </div>

              <div className="mac-window" style={{ marginTop: '32px' }}>
                <div className="mac-titlebar">
                  <div className="mac-dot mac-dot-red"></div>
                  <div className="mac-dot mac-dot-yellow"></div>
                  <div className="mac-dot mac-dot-green"></div>
                </div>
                <div className="mac-content">
                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ fontSize: '12px', color: '#8A9A8A', marginBottom: '6px' }}>@marcus asks</p>
                    <p style={{ fontSize: '14px', color: '#1A2E1A' }}>"Can we negotiate a custom enterprise deal?"</p>
                  </div>
                  <div style={{
                    padding: '16px',
                    background: '#FEF3C7',
                    borderRadius: '12px',
                    borderLeft: '3px solid #F59E0B'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: '#F59E0B',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: 'white'
                      }}>!</div>
                      <span style={{ fontSize: '12px', color: '#B45309', fontWeight: 600 }}>Escalated to Kaya</span>
                    </div>
                    <p style={{ fontSize: '14px', color: '#92400E', lineHeight: 1.6 }}>
                      "This needs a human touch. Kaya will respond within 24 hours."
                    </p>
                  </div>
                  <div style={{
                    marginTop: '12px',
                    padding: '10px 14px',
                    background: '#F0FDF4',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#22C55E',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    Notification sent via Slack
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section style={{ padding: '80px 0' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <p style={{
              fontSize: 'clamp(24px, 3vw, 32px)',
              fontStyle: 'italic',
              color: '#22C55E',
              maxWidth: '700px',
              margin: '0 auto 32px',
              lineHeight: 1.5
            }}>
              "It feels like I cloned myself — my team gets answers instantly, and they're actually right."
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #22C55E, #16A34A)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 600
              }}>JC</div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontWeight: 600, color: '#1A2E1A' }}>Justin Chen</p>
                <p style={{ fontSize: '14px', color: '#8A9A8A' }}>Founder, Acme Consulting</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Your Twin Lives Where You Work */}
      <section style={{ padding: '100px 0', background: 'linear-gradient(180deg, #F0FDF4 0%, #FDFDFB 100%)' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 style={{
              fontSize: 'clamp(36px, 5vw, 52px)',
              fontWeight: 600,
              color: '#1A2E1A',
              marginBottom: '24px',
              letterSpacing: '-0.02em'
            }}>
              Your twin lives where you work
            </h2>
            <p style={{
              fontSize: '20px',
              color: '#4A5A4A',
              maxWidth: '600px',
              margin: '0 auto 64px'
            }}>
              AskKaya meets your team on the platforms they already use
            </p>
          </motion.div>

          {/* Integration visualization */}
          <div style={{ position: 'relative', maxWidth: '900px', margin: '0 auto', height: '400px' }}>
            {/* Center card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '200px',
                background: 'white',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                border: '1px solid #E8EBE8',
                zIndex: 10
              }}
            >
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#22C55E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: 'white',
                fontWeight: 700,
                fontSize: '16px'
              }}>AK</div>
              <p style={{ fontWeight: 600, color: '#1A2E1A', marginBottom: '4px' }}>AskKaya</p>
              <p style={{ fontSize: '12px', color: '#8A9A8A' }}>Your digital twin</p>
            </motion.div>

            {/* Floating integration pills */}
            {/* Slack */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              style={{
                position: 'absolute',
                left: '5%',
                top: '25%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'white',
                padding: '12px 18px',
                borderRadius: '12px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                border: '1px solid #E8EBE8',
                whiteSpace: 'nowrap'
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#E01E5A"/>
              </svg>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E1A' }}>Slack</p>
                <p style={{ fontSize: '12px', color: '#8A9A8A' }}>#ask-kaya</p>
              </div>
            </motion.div>

            {/* Discord */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15 }}
              style={{
                position: 'absolute',
                left: '0%',
                top: '60%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'white',
                padding: '12px 18px',
                borderRadius: '12px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                border: '1px solid #E8EBE8',
                whiteSpace: 'nowrap'
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#5865F2">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E1A' }}>Discord</p>
                <p style={{ fontSize: '12px', color: '#8A9A8A' }}>@AskKaya Bot</p>
              </div>
            </motion.div>

            {/* Telegram */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              style={{
                position: 'absolute',
                left: '15%',
                top: '85%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'white',
                padding: '12px 18px',
                borderRadius: '12px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                border: '1px solid #E8EBE8',
                whiteSpace: 'nowrap'
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#229ED9">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E1A' }}>Telegram</p>
                <p style={{ fontSize: '12px', color: '#8A9A8A' }}>@AskKayaBot</p>
              </div>
            </motion.div>

            {/* Email */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.25 }}
              style={{
                position: 'absolute',
                left: '70%',
                top: '20%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'white',
                padding: '12px 18px',
                borderRadius: '12px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                border: '1px solid #E8EBE8',
                whiteSpace: 'nowrap'
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
              </svg>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E1A' }}>Email</p>
                <p style={{ fontSize: '12px', color: '#8A9A8A' }}>ask@yourdomain.com</p>
              </div>
            </motion.div>

            {/* Google Chat */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              style={{
                position: 'absolute',
                left: '75%',
                top: '55%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'white',
                padding: '12px 18px',
                borderRadius: '12px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                border: '1px solid #E8EBE8',
                whiteSpace: 'nowrap'
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M22 12c0 5.523-4.477 10-10 10-1.404 0-2.74-.29-3.952-.815L2 23l1.785-5.32A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10z" fill="#00AC47"/>
                <path d="M7 9h10M7 12h7M7 15h5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E1A' }}>Google Chat</p>
                <p style={{ fontSize: '12px', color: '#8A9A8A' }}>AskKaya Space</p>
              </div>
            </motion.div>

            {/* Filament */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.35 }}
              style={{
                position: 'absolute',
                left: '65%',
                top: '85%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'white',
                padding: '12px 18px',
                borderRadius: '12px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                border: '1px solid #E8EBE8',
                whiteSpace: 'nowrap'
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#F59E0B"/>
                <path d="M2 17l10 5 10-5" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12l10 5 10-5" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E1A' }}>Filament</p>
                <p style={{ fontSize: '12px', color: '#8A9A8A' }}>Knowledge Base</p>
              </div>
            </motion.div>

            {/* Connection lines (subtle) */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <defs>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity="0.1"/>
                  <stop offset="50%" stopColor="#22C55E" stopOpacity="0.3"/>
                  <stop offset="100%" stopColor="#22C55E" stopOpacity="0.1"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </section>

      {/* For Teams */}
      <section id="teams" style={{ padding: '100px 0', background: 'white' }}>
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ textAlign: 'center', marginBottom: '64px' }}
          >
            <h2 style={{
              fontSize: 'clamp(36px, 5vw, 52px)',
              fontWeight: 600,
              color: '#22C55E',
              marginBottom: '24px',
              letterSpacing: '-0.02em'
            }}>
              For your organization
            </h2>
            <p style={{
              fontSize: '20px',
              color: '#4A5A4A',
              maxWidth: '600px',
              margin: '0 auto'
            }}>
              Give your team members their own digital twin — scale expertise across your entire company
            </p>
          </motion.div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', maxWidth: '1000px', margin: '0 auto' }}>
            {[
              {
                name: 'Sophie',
                role: 'Head of Sales',
                image: '/team/sophie.jpeg',
                queries: '847 questions answered this month',
                example: '"What\'s our enterprise pricing?"'
              },
              {
                name: 'Yiliu',
                role: 'Support Lead',
                image: '/team/yiliu.jpeg',
                queries: '1.2k questions answered this month',
                example: '"How do I reset my password?"'
              },
              {
                name: 'Jordan',
                role: 'Product Manager',
                image: '/team/jordan.jpeg',
                queries: '523 questions answered this month',
                example: '"When is v2.0 launching?"'
              }
            ].map((member, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                style={{
                  padding: '32px',
                  background: '#FAFAFA',
                  borderRadius: '20px',
                  border: '1px solid #E8EBE8',
                  textAlign: 'center'
                }}
              >
                {member.image ? (
                  <img
                    src={member.image}
                    alt={member.name}
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      margin: '0 auto 16px',
                      display: 'block'
                    }}
                  />
                ) : (
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: member.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '20px',
                    margin: '0 auto 16px'
                  }}>
                    {member.avatar}
                  </div>
                )}
                <p style={{ fontWeight: 600, color: '#1A2E1A', fontSize: '18px' }}>Ask{member.name}</p>
                <p style={{ fontSize: '14px', color: '#8A9A8A', marginBottom: '16px' }}>{member.role}</p>
                <div style={{
                  padding: '12px 16px',
                  background: 'white',
                  borderRadius: '12px',
                  border: '1px solid #E8EBE8',
                  marginBottom: '12px'
                }}>
                  <p style={{ fontSize: '13px', color: '#4A5A4A', fontStyle: 'italic' }}>{member.example}</p>
                </div>
                <p style={{ fontSize: '12px', color: '#22C55E', fontWeight: 500 }}>{member.queries}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ textAlign: 'center', marginTop: '48px' }}
          >
            <p style={{ fontSize: '16px', color: '#4A5A4A', marginBottom: '24px' }}>
              One knowledge base. Multiple experts. Zero bottlenecks.
            </p>
            <button className="btn-cta">
              <svg width="20" height="24" viewBox="0 0 384 512" fill="currentColor">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
              </svg>
              Download AskKaya for Mac
            </button>
          </motion.div>
        </div>
      </section>


      {/* Security / Multi-tenant */}
      <section style={{ padding: '100px 0', background: 'white' }}>
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ textAlign: 'center', marginBottom: '64px' }}
          >
            <h2 style={{
              fontSize: 'clamp(36px, 5vw, 52px)',
              fontWeight: 600,
              color: '#1A2E1A',
              marginBottom: '24px',
              letterSpacing: '-0.02em'
            }}>
              Your data stays <span style={{ color: '#22C55E' }}>yours</span>
            </h2>
            <p style={{
              fontSize: '20px',
              color: '#4A5A4A',
              maxWidth: '600px',
              margin: '0 auto'
            }}>
              Enterprise-grade security with complete isolation between accounts
            </p>
          </motion.div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', maxWidth: '1000px', margin: '0 auto' }}>
            {/* Multi-tenant isolation */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              style={{
                padding: '32px',
                background: '#FAFAFA',
                borderRadius: '20px',
                border: '1px solid #E8EBE8',
                textAlign: 'center'
              }}
            >
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                background: '#F0FDF4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px'
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1A2E1A', marginBottom: '8px' }}>Multi-tenant isolation</h3>
              <p style={{ fontSize: '14px', color: '#4A5A4A', lineHeight: 1.6 }}>
                Each twin runs in its own secure environment. Your knowledge never mixes with anyone else's.
              </p>
            </motion.div>

            {/* Encryption */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              style={{
                padding: '32px',
                background: '#FAFAFA',
                borderRadius: '20px',
                border: '1px solid #E8EBE8',
                textAlign: 'center'
              }}
            >
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                background: '#F0FDF4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px'
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <path d="M9 12l2 2 4-4"/>
                </svg>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1A2E1A', marginBottom: '8px' }}>End-to-end encryption</h3>
              <p style={{ fontSize: '14px', color: '#4A5A4A', lineHeight: 1.6 }}>
                All data encrypted at rest and in transit. Your conversations and knowledge base stay private.
              </p>
            </motion.div>

            {/* Access control */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              style={{
                padding: '32px',
                background: '#FAFAFA',
                borderRadius: '20px',
                border: '1px solid #E8EBE8',
                textAlign: 'center'
              }}
            >
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                background: '#F0FDF4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px'
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1A2E1A', marginBottom: '8px' }}>Granular access control</h3>
              <p style={{ fontSize: '14px', color: '#4A5A4A', lineHeight: 1.6 }}>
                You decide who can query your twin and what knowledge they can access.
              </p>
            </motion.div>
          </div>

          {/* Trust badges */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '32px',
              marginTop: '48px',
              flexWrap: 'wrap'
            }}
          >
            {['SOC 2 Type II', 'GDPR Compliant', 'SSO Ready'].map((badge, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                color: '#8A9A8A',
                fontWeight: 500
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#22C55E">
                  <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-.997-6l7.07-7.071-1.414-1.414-5.656 5.657-2.829-2.829-1.414 1.414L11.003 16z"/>
                </svg>
                {badge}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '120px 0', textAlign: 'center' }}>
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 style={{
              fontSize: 'clamp(40px, 5vw, 56px)',
              fontWeight: 700,
              color: '#1A2E1A',
              marginBottom: '24px',
              letterSpacing: '-0.02em',
              fontStyle: 'italic'
            }}>
              Ready to clone yourself?
            </h2>
            <p style={{ fontSize: '20px', color: '#4A5A4A', marginBottom: '40px' }}>
              Try AskKaya today. It's free to get started.
            </p>
            <button className="btn-cta">
              <svg width="20" height="24" viewBox="0 0 384 512" fill="currentColor">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-googletag-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
              </svg>
              Download AskKaya for Mac
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '48px 0', borderTop: '1px solid #E8EBE8' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontWeight: 700, color: '#1A2E1A', marginBottom: '4px' }}>AskKaya</p>
            <p style={{ fontSize: '14px', color: '#8A9A8A' }}>Build your digital twin.</p>
          </div>
          <div style={{ display: 'flex', gap: '32px' }}>
            <a href="#" style={{ fontSize: '14px', color: '#4A5A4A', textDecoration: 'none' }}>Privacy</a>
            <a href="#" style={{ fontSize: '14px', color: '#4A5A4A', textDecoration: 'none' }}>Terms</a>
            <a href="#" style={{ fontSize: '14px', color: '#4A5A4A', textDecoration: 'none' }}>Contact</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
