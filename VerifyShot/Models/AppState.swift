import SwiftUI
import UIKit

// MARK: - Central observable state for the app

@MainActor
final class AppState: ObservableObject {
    // Current screenshot being analyzed
    @Published var screenshotImage: UIImage?
    @Published var imageUrl: String?

    // Analysis
    @Published var analysisResult: AnalysisResult?
    @Published var isAnalyzing = false
    @Published var analysisError: String?
    @Published var progressText: String = ""

    // Chat (inline on home screen)
    @Published var chatMessages: [ChatMessage] = []
    @Published var isChatting = false
    @Published var isDeepResearchMode = false

    // Navigation
    @Published var showAnalysis = false
    @Published var showDeepResearch = false

    // Selected tab
    @Published var selectedTab: Tab = .home

    // History
    @Published var history: [AnalysisResult] = []

    enum Tab: Int {
        case home = 0
        case results = 1
        case history = 2
    }

    private let api = APIClient.shared

    // MARK: - Upload & Analyze

    func analyzeScreenshot(_ image: UIImage) {
        screenshotImage = image
        isAnalyzing = true
        analysisError = nil
        progressText = "Uploading screenshot…"

        Task {
            do {
                let result = try await api.analyzeImage(image)
                self.analysisResult = result
                self.imageUrl = result.imageUrl
                self.isAnalyzing = false
                self.showAnalysis = true
                self.selectedTab = .results
                self.history.insert(result, at: 0)
            } catch {
                self.analysisError = error.localizedDescription
                self.isAnalyzing = false
            }
        }
    }

    // MARK: - Text Query (inline chat — no sheet)

    func startTextQuery(_ text: String) {
        // Add user message
        let userMsg = ChatMessage(role: .user, content: text)
        chatMessages.append(userMsg)
        isChatting = true

        let mode = isDeepResearchMode ? "deep_research" : "standard"

        // Build context if analysis exists
        let context: String
        if let result = analysisResult {
            context = result.claims.map { claim in
                "Claim: \(claim.text)\nVerdict: \(claim.verdict)\nSources: \(claim.sources.map(\.title).joined(separator: ", "))"
            }.joined(separator: "\n\n")
        } else {
            context = ""
        }

        Task {
            do {
                let reply = try await api.chat(
                    jobId: analysisResult?.jobId ?? "",
                    message: text,
                    context: context,
                    mode: mode
                )
                let assistantMsg = ChatMessage(role: .assistant, content: reply)
                self.chatMessages.append(assistantMsg)
            } catch {
                let errMsg = ChatMessage(
                    role: .assistant,
                    content: "Sorry, something went wrong: \(error.localizedDescription)"
                )
                self.chatMessages.append(errMsg)
            }
            self.isChatting = false
        }
    }

    // MARK: - Continue Chat (send follow-up messages)

    func sendChatMessage(_ text: String) {
        let userMsg = ChatMessage(role: .user, content: text)
        chatMessages.append(userMsg)
        isChatting = true

        let mode = isDeepResearchMode ? "deep_research" : "standard"

        let context: String
        if let result = analysisResult {
            context = result.claims.map { claim in
                "Claim: \(claim.text)\nVerdict: \(claim.verdict)\nSources: \(claim.sources.map(\.title).joined(separator: ", "))"
            }.joined(separator: "\n\n")
        } else {
            context = ""
        }

        Task {
            do {
                let reply = try await api.chat(
                    jobId: analysisResult?.jobId ?? "",
                    message: text,
                    context: context,
                    mode: mode
                )
                let assistantMsg = ChatMessage(role: .assistant, content: reply)
                self.chatMessages.append(assistantMsg)
            } catch {
                let errMsg = ChatMessage(
                    role: .assistant,
                    content: "Sorry, something went wrong. Please try again."
                )
                self.chatMessages.append(errMsg)
            }
            self.isChatting = false
        }
    }

    // MARK: - Enter Chat from Analysis Results

    func enterChatFromResults() {
        guard let result = analysisResult else { return }
        chatMessages = []
        let welcomeMsg = ChatMessage(
            role: .assistant,
            content: "I have context from your screenshot analysis (\(result.aggregateTrustScore)% trust score, \(result.claims.count) claim\(result.claims.count == 1 ? "" : "s")). What would you like to know?"
        )
        chatMessages.append(welcomeMsg)
        selectedTab = .home
    }

    // MARK: - Clear chat (back to home)

    func clearChat() {
        chatMessages = []
        isDeepResearchMode = false
    }

    func resetForNewScreenshot() {
        screenshotImage = nil
        imageUrl = nil
        analysisResult = nil
        analysisError = nil
        chatMessages = []
        showAnalysis = false
        showDeepResearch = false
        progressText = ""
        isDeepResearchMode = false
    }
}
