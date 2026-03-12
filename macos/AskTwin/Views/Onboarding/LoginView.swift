import SwiftUI

struct LoginView: View {
    @EnvironmentObject var appState: AppState
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var isSignupMode = false

    // Granola colors
    private let bgColor = Color(red: 0.11, green: 0.11, blue: 0.12)
    private let surfaceColor = Color(red: 0.14, green: 0.14, blue: 0.15)
    private let borderColor = Color.white.opacity(0.1)
    private let textPrimary = Color.white
    private let textSecondary = Color.white.opacity(0.5)
    private let accentColor = Color.white

    var body: some View {
        ZStack {
            // Dark background
            bgColor.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Logo & Title (Granola-style)
                VStack(spacing: 20) {
                    // Simple icon
                    ZStack {
                        Circle()
                            .fill(Color.white.opacity(0.05))
                            .frame(width: 72, height: 72)

                        Image(systemName: "person.crop.circle.fill")
                            .font(.system(size: 36, weight: .light))
                            .foregroundColor(textPrimary.opacity(0.8))
                    }

                    VStack(spacing: 8) {
                        Text("AskTwin")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(textPrimary)

                        Text(isSignupMode ? "Create your knowledge twin" : "Welcome back")
                            .font(.system(size: 14))
                            .foregroundColor(textSecondary)
                    }
                }
                .padding(.bottom, 40)

                // Form
                VStack(spacing: 16) {
                    // Email field
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Email")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(textSecondary)
                            .textCase(.uppercase)
                            .tracking(0.5)

                        TextField("", text: $email)
                            .textFieldStyle(.plain)
                            .font(.system(size: 14))
                            .foregroundColor(textPrimary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .background(surfaceColor)
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(borderColor, lineWidth: 1)
                            )
                    }

                    // Password field
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Password")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(textSecondary)
                            .textCase(.uppercase)
                            .tracking(0.5)

                        SecureField("", text: $password)
                            .textFieldStyle(.plain)
                            .font(.system(size: 14))
                            .foregroundColor(textPrimary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .background(surfaceColor)
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(borderColor, lineWidth: 1)
                            )
                    }

                    // Confirm password (signup only)
                    if isSignupMode {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Confirm Password")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(textSecondary)
                                .textCase(.uppercase)
                                .tracking(0.5)

                            SecureField("", text: $confirmPassword)
                                .textFieldStyle(.plain)
                                .font(.system(size: 14))
                                .foregroundColor(textPrimary)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 12)
                                .background(surfaceColor)
                                .cornerRadius(8)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(borderColor, lineWidth: 1)
                                )
                        }
                    }

                    // Error message
                    if let error = errorMessage {
                        Text(error)
                            .font(.system(size: 12))
                            .foregroundColor(.red.opacity(0.9))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    // Submit button
                    Button(action: submit) {
                        HStack {
                            if isLoading {
                                ProgressView()
                                    .scaleEffect(0.6)
                                    .tint(bgColor)
                            } else {
                                Text(isSignupMode ? "Create Account" : "Sign In")
                                    .font(.system(size: 14, weight: .medium))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(isFormValid ? accentColor : accentColor.opacity(0.3))
                        .foregroundColor(bgColor)
                        .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                    .disabled(!isFormValid || isLoading)
                    .padding(.top, 8)
                }
                .frame(width: 300)

                Spacer()

                // Toggle mode
                HStack(spacing: 4) {
                    Text(isSignupMode ? "Already have an account?" : "Don't have an account?")
                        .font(.system(size: 13))
                        .foregroundColor(textSecondary)

                    Button(action: toggleMode) {
                        Text(isSignupMode ? "Sign In" : "Create Account")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(textPrimary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.bottom, 32)
            }
        }
        .frame(minWidth: 400, minHeight: 550)
        .animation(.easeInOut(duration: 0.2), value: isSignupMode)
    }

    private var isFormValid: Bool {
        if isSignupMode {
            return !email.isEmpty &&
                   password.count >= 6 &&
                   password == confirmPassword
        } else {
            return !email.isEmpty && !password.isEmpty
        }
    }

    private func toggleMode() {
        withAnimation {
            isSignupMode.toggle()
            errorMessage = nil
            confirmPassword = ""
        }
    }

    private func submit() {
        isLoading = true
        errorMessage = nil

        Task {
            do {
                if isSignupMode {
                    try await appState.signup(email: email, password: password)
                } else {
                    try await appState.login(email: email, password: password)
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isLoading = false
                }
            }
        }
    }
}

#Preview {
    LoginView()
        .environmentObject(AppState.shared)
}
