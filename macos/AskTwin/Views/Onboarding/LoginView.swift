import SwiftUI

struct LoginView: View {
    @EnvironmentObject var appState: AppState
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 30) {
            Spacer()

            // Logo
            VStack(spacing: 12) {
                Image(systemName: "person.crop.circle.fill")
                    .font(.system(size: 80))
                    .foregroundStyle(.blue)

                Text("AskTwin")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Text("Your AI-powered knowledge assistant")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            // Login form
            VStack(spacing: 16) {
                TextField("Email", text: $email)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.emailAddress)
                    .autocorrectionDisabled()

                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.password)

                if let error = errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }

                Button(action: login) {
                    if isLoading {
                        ProgressView()
                            .scaleEffect(0.8)
                    } else {
                        Text("Sign In")
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(email.isEmpty || password.isEmpty || isLoading)
            }
            .frame(maxWidth: 300)

            Spacer()

            // Footer
            VStack(spacing: 8) {
                Text("Don't have an account?")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Link("Sign up at askkaya.com", destination: URL(string: "https://askkaya.com")!)
                    .font(.caption)
            }
            .padding(.bottom, 20)
        }
        .padding(40)
        .frame(minWidth: 400, minHeight: 500)
    }

    private func login() {
        isLoading = true
        errorMessage = nil

        Task {
            do {
                try await appState.login(email: email, password: password)
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
