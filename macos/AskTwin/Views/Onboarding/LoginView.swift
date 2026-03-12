import SwiftUI

struct LoginView: View {
    @EnvironmentObject var appState: AppState
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var isSignupMode = false

    var body: some View {
        ZStack {
            // Light cream background
            GranolaTheme.cream.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Logo & Title (Granola-style)
                VStack(spacing: 20) {
                    // Simple icon
                    ZStack {
                        Circle()
                            .fill(GranolaTheme.creamDark)
                            .frame(width: 72, height: 72)

                        Image(systemName: "person.crop.circle.fill")
                            .font(.system(size: 36, weight: .light))
                            .foregroundColor(GranolaTheme.textPrimary.opacity(0.8))
                    }

                    VStack(spacing: 8) {
                        Text("AskKaya")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(GranolaTheme.textPrimary)

                        Text(isSignupMode ? "Create your knowledge twin" : "Welcome back")
                            .font(.system(size: 14))
                            .foregroundColor(GranolaTheme.textSecondary)
                    }
                }
                .padding(.bottom, 40)

                // Form
                VStack(spacing: 16) {
                    // Email field
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Email")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(GranolaTheme.textSecondary)
                            .textCase(.uppercase)
                            .tracking(0.5)

                        TextField("", text: $email)
                            .textFieldStyle(.plain)
                            .font(.system(size: 14))
                            .foregroundColor(GranolaTheme.textPrimary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .background(GranolaTheme.creamDark)
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(GranolaTheme.creamBorder, lineWidth: 1)
                            )
                    }

                    // Password field
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Password")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(GranolaTheme.textSecondary)
                            .textCase(.uppercase)
                            .tracking(0.5)

                        SecureField("", text: $password)
                            .textFieldStyle(.plain)
                            .font(.system(size: 14))
                            .foregroundColor(GranolaTheme.textPrimary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .background(GranolaTheme.creamDark)
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(GranolaTheme.creamBorder, lineWidth: 1)
                            )
                    }

                    // Confirm password (signup only)
                    if isSignupMode {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Confirm Password")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(GranolaTheme.textSecondary)
                                .textCase(.uppercase)
                                .tracking(0.5)

                            SecureField("", text: $confirmPassword)
                                .textFieldStyle(.plain)
                                .font(.system(size: 14))
                                .foregroundColor(GranolaTheme.textPrimary)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 12)
                                .background(GranolaTheme.creamDark)
                                .cornerRadius(8)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(GranolaTheme.creamBorder, lineWidth: 1)
                                )
                        }
                    }

                    // Error message
                    if let error = errorMessage {
                        Text(error)
                            .font(.system(size: 12))
                            .foregroundColor(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    // Submit button
                    Button(action: submit) {
                        HStack {
                            if isLoading {
                                ProgressView()
                                    .scaleEffect(0.6)
                                    .tint(GranolaTheme.cream)
                            } else {
                                Text(isSignupMode ? "Create Account" : "Sign In")
                                    .font(.system(size: 14, weight: .medium))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(isFormValid ? GranolaTheme.textPrimary : GranolaTheme.textPrimary.opacity(0.3))
                        .foregroundColor(GranolaTheme.cream)
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
                        .foregroundColor(GranolaTheme.textSecondary)

                    Button(action: toggleMode) {
                        Text(isSignupMode ? "Sign In" : "Create Account")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(GranolaTheme.textPrimary)
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
