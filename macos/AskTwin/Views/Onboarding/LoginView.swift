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
            // Clean background
            Color(NSColor.textBackgroundColor)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Logo & Title (Granola-style)
                VStack(spacing: 16) {
                    // Simple icon
                    ZStack {
                        Circle()
                            .fill(Color.blue.opacity(0.1))
                            .frame(width: 80, height: 80)

                        Image(systemName: "person.crop.circle.fill")
                            .font(.system(size: 40, weight: .light))
                            .foregroundColor(.blue)
                    }

                    VStack(spacing: 8) {
                        Text("AskTwin")
                            .font(.system(size: 32, weight: .bold))

                        Text(isSignupMode ? "Create your knowledge twin" : "Welcome back")
                            .font(.system(size: 15))
                            .foregroundColor(.secondary)
                    }
                }
                .padding(.bottom, 48)

                // Form
                VStack(spacing: 16) {
                    // Email field
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Email")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.secondary)

                        TextField("", text: $email)
                            .textFieldStyle(.plain)
                            .font(.system(size: 14))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(Color(NSColor.controlBackgroundColor))
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
                            )
                    }

                    // Password field
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Password")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.secondary)

                        SecureField("", text: $password)
                            .textFieldStyle(.plain)
                            .font(.system(size: 14))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(Color(NSColor.controlBackgroundColor))
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
                            )
                    }

                    // Confirm password (signup only)
                    if isSignupMode {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Confirm Password")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.secondary)

                            SecureField("", text: $confirmPassword)
                                .textFieldStyle(.plain)
                                .font(.system(size: 14))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 10)
                                .background(Color(NSColor.controlBackgroundColor))
                                .cornerRadius(8)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
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
                                    .scaleEffect(0.7)
                                    .tint(.white)
                            } else {
                                Text(isSignupMode ? "Create Account" : "Sign In")
                                    .font(.system(size: 14, weight: .medium))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(isFormValid ? Color.blue : Color.blue.opacity(0.5))
                        .foregroundColor(.white)
                        .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                    .disabled(!isFormValid || isLoading)
                    .padding(.top, 8)
                }
                .frame(width: 280)

                Spacer()

                // Toggle mode
                HStack(spacing: 4) {
                    Text(isSignupMode ? "Already have an account?" : "Don't have an account?")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)

                    Button(action: toggleMode) {
                        Text(isSignupMode ? "Sign In" : "Create Account")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.blue)
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
