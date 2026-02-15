import SwiftUI

// MARK: - Research Chat View (Manus AI-style)

struct ChatView: View {
    @EnvironmentObject var appState: AppState
    @State private var inputText = ""
    @FocusState private var isInputFocused: Bool
    @State private var showModeToggle = true

    private var hasAnalysisContext: Bool {
        appState.analysisResult != nil
    }

    var body: some View {
        VStack(spacing: 0) {
            // Mode toggle (Standard vs Deep Research)
            if showModeToggle {
                modeToggle
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 12)
            }

            // Chat messages
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 16) {
                        // Context banner (when screenshot analyzed)
                        if let result = appState.analysisResult {
                            contextBanner(result)
                        }

                        // Welcome message (only if no messages yet)
                        if appState.chatMessages.isEmpty {
                            welcomeMessage
                        }

                        // Messages
                        ForEach(appState.chatMessages) { msg in
                            messageBubble(msg)
                                .id(msg.id)
                        }

                        // Research steps (Deep Research mode only)
                        if appState.isDeepResearchMode && !appState.researchSteps.isEmpty {
                            researchStepsPanel
                        }

                        // Typing indicator (Standard mode)
                        if appState.isChatting && !appState.isDeepResearchMode {
                            typingIndicator
                        }
                    }
                    .padding(16)
                }
                .onChange(of: appState.chatMessages.count) { _, _ in
                    if let last = appState.chatMessages.last {
                        withAnimation {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }

            Divider()

            // Input bar
            inputBar
        }
        .background(Color.vsBackground)
        .navigationTitle("Verify")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Clear") {
                    appState.clearChat()
                }
                .foregroundColor(.vsOrange)
            }
        }
    }

    // MARK: - Mode Toggle

    private var modeToggle: some View {
        HStack(spacing: 0) {
            Button {
                appState.isDeepResearchMode = false
            } label: {
                Text("Standard")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(appState.isDeepResearchMode ? .vsDarkGray : .white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(appState.isDeepResearchMode ? Color.clear : Color.vsNavy)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }

            Button {
                appState.isDeepResearchMode = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "sparkle.magnifyingglass")
                        .font(.caption)
                    Text("Deep Research")
                        .font(.subheadline.weight(.semibold))
                }
                .foregroundColor(appState.isDeepResearchMode ? .white : .vsDarkGray)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(appState.isDeepResearchMode ? Color.vsOrange : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .padding(4)
        .background(Color.vsGray)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    // MARK: - Context Banner

    private func contextBanner(_ result: AnalysisResult) -> some View {
        NavigationLink {
            AnalysisResultView()
        } label: {
            HStack(spacing: 12) {
                // Screenshot thumbnail
                if let img = appState.screenshotImage {
                    Image(uiImage: img)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 50, height: 50)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.vsGray)
                        .frame(width: 50, height: 50)
                        .overlay(
                            Image(systemName: "photo")
                                .foregroundColor(.vsDarkGray)
                        )
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Screenshot Analysis Active")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.vsNavy)
                    HStack(spacing: 6) {
                        Text("\(result.aggregateTrustScore)%")
                            .font(.caption.weight(.bold))
                            .foregroundColor(.forTrustScore(result.aggregateTrustScore))
                        Text("•")
                            .foregroundColor(.vsDarkGray)
                        Text("\(result.claims.count) claim\(result.claims.count == 1 ? "" : "s")")
                            .font(.caption)
                            .foregroundColor(.vsDarkGray)
                    }
                }

                Spacer()

                HStack(spacing: 4) {
                    Text("View Full")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.vsOrange)
                    Image(systemName: "chevron.right")
                        .font(.caption2)
                        .foregroundColor(.vsOrange)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.vsOrange.opacity(0.1))
                .clipShape(Capsule())
            }
            .padding(12)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Welcome Message

    private var welcomeMessage: some View {
        VStack(spacing: 16) {
            // VerifyShot branding
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color.vsOrangeLight, Color.vsOrange],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 80, height: 80)
                    .shadow(color: .vsOrange.opacity(0.3), radius: 12, y: 6)
                
                Image(systemName: "checkmark.shield.fill")
                    .font(.system(size: 36))
                    .foregroundColor(.white)
            }

            VStack(spacing: 8) {
                Text("Welcome to VerifyShot")
                    .font(.title2.bold())
                    .foregroundColor(.vsNavy)

                if hasAnalysisContext {
                    Text("Ask me about your screenshot analysis")
                        .font(.subheadline)
                        .foregroundColor(.vsDarkGray)
                        .multilineTextAlignment(.center)
                } else {
                    Text("Upload a screenshot or ask me to verify any claim")
                        .font(.subheadline)
                        .foregroundColor(.vsDarkGray)
                        .multilineTextAlignment(.center)
                }
            }

            // Suggestion chips
            VStack(spacing: 8) {
                if hasAnalysisContext {
                    quickChip("Is this claim true?")
                    quickChip("What are the main sources?")
                    quickChip("Is there any bias?")
                } else {
                    quickChip("Is this news real?")
                    quickChip("Check a health claim")
                    quickChip("Verify a statistic")
                }
            }
            .padding(.top, 8)
        }
        .padding(.vertical, 32)
    }

    private func quickChip(_ text: String) -> some View {
        Button {
            inputText = text
            sendMessage()
        } label: {
            Text(text)
                .font(.subheadline)
                .foregroundColor(.vsNavy)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
        }
    }

    // MARK: - Message Bubble

    private func messageBubble(_ message: ChatMessage) -> some View {
        HStack {
            if message.role == .user { Spacer(minLength: 60) }

            Text(message.content)
                .font(.body)
                .foregroundColor(message.role == .user ? .white : .primary)
                .padding(14)
                .background(
                    message.role == .user
                        ? AnyShapeStyle(Color.vsNavy)
                        : AnyShapeStyle(Color.white)
                )
                .clipShape(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                )
                .shadow(color: .black.opacity(message.role == .assistant ? 0.04 : 0), radius: 4, y: 2)

            if message.role == .assistant { Spacer(minLength: 60) }
        }
    }

    // MARK: - Research Steps Panel

    private var researchStepsPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(appState.researchSteps.enumerated()), id: \.element.id) { index, step in
                ResearchStepCard(step: step, index: index)
            }
        }
    }

    // MARK: - Typing Indicator

    private var typingIndicator: some View {
        HStack {
            HStack(spacing: 4) {
                ForEach(0..<3) { i in
                    Circle()
                        .fill(Color.vsDarkGray)
                        .frame(width: 8, height: 8)
                        .opacity(0.6)
                }
            }
            .padding(14)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            Spacer(minLength: 60)
        }
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        HStack(spacing: 12) {
            // Deep research indicator
            if appState.isDeepResearchMode {
                Image(systemName: "sparkle.magnifyingglass")
                    .font(.caption)
                    .foregroundColor(.vsOrange)
                    .padding(8)
                    .background(Color.vsOrange.opacity(0.1))
                    .clipShape(Circle())
            }

            TextField(hasAnalysisContext ? "Ask about this screenshot…" : "Ask me to verify a claim…", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...4)
                .focused($isInputFocused)
                .onSubmit { sendMessage() }

            Button {
                sendMessage()
            } label: {
                Circle()
                    .fill(canSendChat ? Color.vsNavy : Color.vsGray)
                    .frame(width: 36, height: 36)
                    .overlay(
                        Image(systemName: "arrow.up")
                            .font(.body.bold())
                            .foregroundColor(canSendChat ? .white : .vsDarkGray)
                    )
            }
            .disabled(!canSendChat)
        }
        .padding(12)
        .background(Color.white)
    }

    private var canSendChat: Bool {
        !inputText.trimmingCharacters(in: .whitespaces).isEmpty && !appState.isChatting
    }

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        inputText = ""
        appState.sendChatMessage(text)
    }
}

// MARK: - Research Step Card

struct ResearchStepCard: View {
    let step: ResearchStep
    let index: Int
    @State private var isVisible = false
    @State private var isComplete = false

    var body: some View {
        HStack(spacing: 12) {
            // Icon
            ZStack {
                Circle()
                    .fill(isComplete ? Color.vsGreen.opacity(0.15) : Color.vsOrange.opacity(0.15))
                    .frame(width: 40, height: 40)
                
                if isComplete {
                    Image(systemName: "checkmark")
                        .font(.caption.bold())
                        .foregroundColor(.vsGreen)
                } else {
                    Image(systemName: step.icon)
                        .font(.caption)
                        .foregroundColor(.vsOrange)
                }
            }

            Text(step.title)
                .font(.subheadline)
                .foregroundColor(.vsNavy)

            Spacer()
        }
        .padding(12)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
        .opacity(isVisible ? 1 : 0)
        .offset(y: isVisible ? 0 : 10)
        .onAppear {
            // Animate in with delay
            withAnimation(.spring(response: 0.5, dampingFraction: 0.7).delay(step.delay)) {
                isVisible = true
            }
            
            // Mark as complete when step.isComplete changes
            if step.isComplete {
                DispatchQueue.main.asyncAfter(deadline: .now() + step.delay + 0.3) {
                    withAnimation(.spring(response: 0.3)) {
                        isComplete = true
                    }
                }
            }
        }
        .onChange(of: step.isComplete) { _, newValue in
            if newValue {
                withAnimation(.spring(response: 0.3)) {
                    isComplete = true
                }
            }
        }
    }
}
