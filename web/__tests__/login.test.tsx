import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import LoginPage from '@/app/login/page'
import DashboardPage from '@/app/dashboard/page'

// Mock modules
jest.mock('firebase/auth')
jest.mock('next/navigation')

describe('Authentication and Login', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue(mockRouter)
  })

  describe('Login Page', () => {
    it('renders email and password form', () => {
      render(<LoginPage />)
      
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })

    it('calls Firebase Auth signInWithEmailAndPassword on submit', async () => {
      const mockSignIn = signInWithEmailAndPassword as jest.Mock
      mockSignIn.mockResolvedValue({
        user: {
          uid: 'test-uid',
          email: 'admin@example.com',
          getIdTokenResult: jest.fn().mockResolvedValue({
            claims: { admin: true },
          }),
        },
      })

      render(<LoginPage />)
      
      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      fireEvent.change(emailInput, { target: { value: 'admin@example.com' } })
      fireEvent.change(passwordInput, { target: { value: 'password123' } })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith(
          expect.anything(),
          'admin@example.com',
          'password123'
        )
      })
    })

    it('redirects to /dashboard on successful login', async () => {
      const mockSignIn = signInWithEmailAndPassword as jest.Mock
      mockSignIn.mockResolvedValue({
        user: {
          uid: 'test-uid',
          email: 'admin@example.com',
          getIdTokenResult: jest.fn().mockResolvedValue({
            claims: { admin: true },
          }),
        },
      })

      render(<LoginPage />)
      
      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      fireEvent.change(emailInput, { target: { value: 'admin@example.com' } })
      fireEvent.change(passwordInput, { target: { value: 'password123' } })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/dashboard')
      })
    })

    it('shows error message on invalid credentials', async () => {
      const mockSignIn = signInWithEmailAndPassword as jest.Mock
      mockSignIn.mockRejectedValue({
        code: 'auth/invalid-credential',
        message: 'Invalid email or password',
      })

      render(<LoginPage />)
      
      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      fireEvent.change(emailInput, { target: { value: 'wrong@example.com' } })
      fireEvent.change(passwordInput, { target: { value: 'wrongpass' } })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
      })
    })

    it('rejects non-admin users (missing admin:true custom claim)', async () => {
      const mockSignIn = signInWithEmailAndPassword as jest.Mock
      mockSignIn.mockResolvedValue({
        user: {
          uid: 'test-uid',
          email: 'user@example.com',
          getIdTokenResult: jest.fn().mockResolvedValue({
            claims: { admin: false },
          }),
        },
      })

      render(<LoginPage />)
      
      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
      fireEvent.change(passwordInput, { target: { value: 'password123' } })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/access denied.*admin/i)).toBeInTheDocument()
      })
    })
  })

  describe('Protected Routes', () => {
    it('redirects to /login if unauthenticated', async () => {
      // Mock unauthenticated state
      const mockAuth = {
        currentUser: null,
      }

      // This test expects middleware or layout to check auth and redirect
      render(<DashboardPage />)

      await waitFor(() => {
        // The page should trigger a redirect or show a login prompt
        expect(mockRouter.push).toHaveBeenCalledWith('/login')
      })
    })

    it('allows access to dashboard when authenticated with admin claim', async () => {
      // Mock authenticated admin user
      const mockAuth = {
        currentUser: {
          uid: 'admin-uid',
          email: 'admin@example.com',
          getIdTokenResult: jest.fn().mockResolvedValue({
            claims: { admin: true },
          }),
        },
      }

      render(<DashboardPage />)

      await waitFor(() => {
        // Dashboard should render without redirect
        expect(mockRouter.push).not.toHaveBeenCalledWith('/login')
      })
    })
  })
})
