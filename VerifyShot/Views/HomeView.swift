import SwiftUI
import PhotosUI

// MARK: - Home Screen (ChatGPT-inspired redesign)

struct HomeView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var detector = ScreenshotDetector()
    @State private var searchText = ""
    @State private var showAttachmentMenu = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var showNoAnalysisAlert = false
    @FocusState private var isSearchFocused: Bool

    private let suggestions = [
        "Verify COVID claim from recent news",
        "Recent social post about tax laws",
        "Check authenticity of viral image",
    ]

    var body: some View {
        ZStack {
            Color.vsBackground.ignoresSafeArea()

            VStack(spacing: 0) {
                // Nav bar
                HStack {
                    Button { } label: {
                        Image(systemName: "chevron.left")
                            .font(.title3.weight(.medium))
                            .foregroundColor(.vsNavy)
                    }
                    Spacer()
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)

                Spacer()

                // Orange sun graphic
                ZStack {
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [Color.vsOrangeLight.opacity(0.5), Color.clear],
                                center: .center,
                                startRadius: 60,
                                endRadius: 160
                            )
                        )
                        .frame(width: 300, height: 300)

                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color.vsOrangeLight, Color.vsOrange],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 180, height: 180)
                        .shadow(color: .vsOrange.opacity(0.3), radius: 20, y: 10)
                }

                // Greeting
                Text("Hey, What are you\nlooking for today?")
                    .font(.system(size: 26, weight: .bold))
                    .multilineTextAlignment(.center)
                    .foregroundColor(.vsNavy)
                    .padding(.top, 24)

                Spacer()

                // Suggestion chips
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(suggestions, id: \.self) { suggestion in
                            Button {
                                searchText = suggestion
                                isSearchFocused = true
                            } label: {
                                Text(suggestion)
                                    .font(.subheadline)
                                    .foregroundColor(.vsNavy)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 12)
                                    .background(Color.vsGray)
                                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                }
                .padding(.bottom, 16)

                // Search bar (ChatGPT style)
                searchBar
                    .padding(.horizontal, 16)
                    .padding(.bottom, 100) // room for tab bar
            }

            // Loading overlay
            if appState.isAnalyzing {
                loadingOverlay
            }
        }
        .navigationBarHidden(true)
        .onChange(of: detector.latestScreenshot) { _, newImage in
            if let img = newImage {
                appState.analyzeScreenshot(img)
            }
        }
        .onChange(of: selectedPhotoItem) { _, item in
            if let item {
                loadPhoto(from: item)
            }
        }
        .sheet(isPresented: $showAttachmentMenu) {
            attachmentMenu
        }
        .alert("No Analysis Yet", isPresented: $showNoAnalysisAlert) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("Analyze a screenshot first, then use Deep Research for a detailed report.")
        }
    }

    // MARK: - Search bar (ChatGPT style: [+] [Ask anything...] [↑])

    private var searchBar: some View {
        HStack(spacing: 10) {
            // "+" button — opens attachment menu
            Button {
                showAttachmentMenu = true
            } label: {
                Circle()
                    .fill(Color.vsNavy)
                    .frame(width: 38, height: 38)
                    .overlay(
                        Image(systemName: "plus")
                            .font(.body.bold())
                            .foregroundColor(.white)
                    )
            }

            // Text input
            TextField("Ask anything", text: $searchText)
                .font(.body)
                .foregroundColor(.vsNavy)
                .focused($isSearchFocused)
                .submitLabel(.send)
                .onSubmit { sendTextQuery() }

            // Send button
            Button {
                sendTextQuery()
            } label: {
                Circle()
                    .fill(canSend ? Color.vsNavy : Color.vsGray)
                    .frame(width: 38, height: 38)
                    .overlay(
                        Image(systemName: "arrow.up")
                            .font(.body.bold())
                            .foregroundColor(canSend ? .white : .vsDarkGray)
                    )
            }
            .disabled(!canSend)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: .black.opacity(0.08), radius: 10, y: 3)
    }

    private var canSend: Bool {
        !searchText.trimmingCharacters(in: .whitespaces).isEmpty
    }

    // MARK: - Attachment Menu Sheet (ChatGPT-style bottom sheet)

    private var attachmentMenu: some View {
        VStack(spacing: 0) {
            // Top row: Photos
            HStack(spacing: 16) {
                // Photos picker
                PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                    VStack(spacing: 8) {
                        Image(systemName: "photo.on.rectangle.angled")
                            .font(.title2)
                            .foregroundColor(.white)
                        Text("Photos")
                            .font(.caption.weight(.medium))
                            .foregroundColor(.white)
                    }
                    .frame(width: 90, height: 90)
                    .background(Color(.systemGray3))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .onChange(of: selectedPhotoItem) { _, newItem in
                    if newItem != nil {
                        showAttachmentMenu = false
                    }
                }

                // Screenshots shortcut
                PhotosPicker(selection: $selectedPhotoItem, matching: .screenshots) {
                    VStack(spacing: 8) {
                        Image(systemName: "camera.viewfinder")
                            .font(.title2)
                            .foregroundColor(.white)
                        Text("Screenshots")
                            .font(.caption.weight(.medium))
                            .foregroundColor(.white)
                    }
                    .frame(width: 90, height: 90)
                    .background(Color(.systemGray3))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
            }
            .padding(.top, 28)
            .padding(.bottom, 20)

            Divider()
                .padding(.horizontal, 20)

            // List options
            VStack(spacing: 0) {
                // Deep Research
                Button {
                    showAttachmentMenu = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        if appState.analysisResult != nil {
                            appState.showDeepResearch = true
                        } else {
                            showNoAnalysisAlert = true
                        }
                    }
                } label: {
                    menuRow(
                        icon: "doc.text.magnifyingglass",
                        iconColor: .vsOrange,
                        title: "Deep Research",
                        subtitle: "Get a detailed analysis report"
                    )
                }

                // Web Search
                Button {
                    showAttachmentMenu = false
                    isSearchFocused = true
                } label: {
                    menuRow(
                        icon: "globe",
                        iconColor: .vsBlue,
                        title: "Web Search",
                        subtitle: "Find real-time news and info"
                    )
                }
            }

            Spacer()
        }
        .presentationDetents([.fraction(0.42)])
        .presentationDragIndicator(.visible)
    }

    private func menuRow(icon: String, iconColor: Color, title: String, subtitle: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(iconColor)
                .frame(width: 32, height: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body.weight(.semibold))
                    .foregroundColor(.vsNavy)
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(.vsDarkGray)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(.vsDarkGray)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    // MARK: - Loading Overlay

    private var loadingOverlay: some View {
        ZStack {
            Color.black.opacity(0.3).ignoresSafeArea()
            VStack(spacing: 16) {
                ProgressView()
                    .scaleEffect(1.5)
                    .tint(.white)
                Text(appState.progressText.isEmpty ? "Analyzing screenshot…" : appState.progressText)
                    .font(.headline)
                    .foregroundColor(.white)
            }
            .padding(32)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 20))
        }
    }

    // MARK: - Send text query → opens chat

    private func sendTextQuery() {
        let text = searchText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        searchText = ""
        isSearchFocused = false
        appState.startTextQuery(text)
    }

    // MARK: - Load photo from picker

    private func loadPhoto(from item: PhotosPickerItem) {
        Task {
            if let data = try? await item.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                appState.analyzeScreenshot(image)
            }
        }
    }
}
