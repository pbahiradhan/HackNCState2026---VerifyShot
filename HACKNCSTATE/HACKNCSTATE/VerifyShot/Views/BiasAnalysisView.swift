import SwiftUI

// MARK: - Bias Analysis View (separate screen with model transparency)

struct BiasAnalysisView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationStack {
            guard let result = appState.analysisResult else {
                return AnyView(Text("No analysis data").foregroundColor(.gray))
            }

            return AnyView(
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 24) {
                        // ── Header ──
                        headerSection(result)

                        // ── Loading State ──
                        if appState.isAnalyzingBias {
                            loadingSection
                        }

                        // ── Final Bias Breakdown ──
                        if let biasResult = appState.biasAnalysisResult {
                            finalBiasBreakdown(biasResult)
                            
                            // ── All Model Assessments ──
                            allModelAssessments(biasResult)
                            
                            // ── Perspective Comparison ──
                            if let perspectives = biasResult.perspectives {
                                perspectiveComparison(perspectives)
                            }
                        } else if !appState.isAnalyzingBias && appState.biasAnalysisError == nil {
                            // Placeholder when not analyzed yet
                            placeholderSection
                        }

                        // ── Error State ──
                        if let error = appState.biasAnalysisError {
                            errorSection(error)
                        }

                        Spacer(minLength: 120)
                    }
                    .padding(.top, 8)
                }
                .background(Color.vsBackground)
                .navigationTitle("Bias Analysis")
                .navigationBarTitleDisplayMode(.large)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button {
                            appState.showBiasAnalysis = false
                        } label: {
                            Text("Done")
                                .foregroundColor(.vsNavy)
                        }
                    }
                }
            )
        }
    }

    // MARK: - Header

    private func headerSection(_ result: AnalysisResult) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "chart.bar.xaxis")
                    .foregroundColor(.vsOrange)
                Text("MULTI-PERSPECTIVE BIAS ANALYSIS")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.vsOrange)
                    .tracking(1)
            }
            .padding(.horizontal, 20)

            Text("Analysis across 9 independent assessments (3 perspectives × 3 AI models) to detect political bias and sensationalism.")
                .font(.subheadline)
                .foregroundColor(.vsDarkGray)
                .padding(.horizontal, 20)
        }
    }

    // MARK: - Loading State

    private var loadingSection: some View {
        VStack(spacing: 20) {
            // Animated spinner
            ProgressView()
                .progressViewStyle(.circular)
                .scaleEffect(1.5)
                .tint(.vsOrange)

            Text("Analyzing with 9 AI Models…")
                .font(.headline)
                .foregroundColor(.vsNavy)

            Text("3 perspectives × 3 models running in parallel")
                .font(.subheadline)
                .foregroundColor(.vsDarkGray)

            // Animated model indicators
            VStack(alignment: .leading, spacing: 12) {
                modelLoadingRow("GPT-4o", perspectives: ["US Left", "US Right", "International"])
                modelLoadingRow("Claude 3.5 Sonnet", perspectives: ["US Left", "US Right", "International"])
                modelLoadingRow("Gemini 1.5 Pro", perspectives: ["US Left", "US Right", "International"])
            }
            .padding(20)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
            .padding(.horizontal, 20)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }

    private func modelLoadingRow(_ modelName: String, perspectives: [String]) -> some View {
        HStack(spacing: 12) {
            ProgressView()
                .progressViewStyle(.circular)
                .scaleEffect(0.8)

            VStack(alignment: .leading, spacing: 2) {
                Text(modelName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.vsNavy)
                Text(perspectives.joined(separator: " • "))
                    .font(.caption2)
                    .foregroundColor(.vsDarkGray)
            }

            Spacer()
        }
    }

    // MARK: - Final Bias Breakdown

    private func finalBiasBreakdown(_ result: BiasAnalysisResult) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 6) {
                Image(systemName: "checkmark.shield.fill")
                    .foregroundColor(.vsOrange)
                Text("BIAS ASSESSMENT")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.vsOrange)
                    .tracking(1)
            }
            .padding(.horizontal, 20)

            BiasSlider(bias: result.biasSignals)
                .padding(.horizontal, 20)
        }
    }

    // MARK: - All Model Assessments

    private func allModelAssessments(_ result: BiasAnalysisResult) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 6) {
                Image(systemName: "person.3.fill")
                    .foregroundColor(.vsNavy)
                Text("ALL MODEL ASSESSMENTS")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.vsNavy)
                    .tracking(1)
            }
            .padding(.horizontal, 20)

            // Group by perspective
            let leftAssessments = result.modelAssessments.filter { $0.perspective == "us-left" }
            let rightAssessments = result.modelAssessments.filter { $0.perspective == "us-right" }
            let intlAssessments = result.modelAssessments.filter { $0.perspective == "international" }

            VStack(spacing: 16) {
                if !leftAssessments.isEmpty {
                    perspectiveGroup("US Left Perspective", assessments: leftAssessments, color: .blue)
                }
                if !rightAssessments.isEmpty {
                    perspectiveGroup("US Right Perspective", assessments: rightAssessments, color: .red)
                }
                if !intlAssessments.isEmpty {
                    perspectiveGroup("International Perspective", assessments: intlAssessments, color: .purple)
                }
            }
        }
    }

    private func perspectiveGroup(_ title: String, assessments: [ModelBiasUpdate], color: Color) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(color)
                .padding(.horizontal, 20)

            ForEach(assessments) { assessment in
                ModelAssessmentCard(assessment: assessment)
                    .padding(.horizontal, 20)
            }
        }
    }

    // MARK: - Perspective Comparison

    private func perspectiveComparison(_ perspectives: BiasPerspectives) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 6) {
                Image(systemName: "chart.bar.doc.horizontal")
                    .foregroundColor(.vsOrange)
                Text("PERSPECTIVE COMPARISON")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.vsOrange)
                    .tracking(1)
            }
            .padding(.horizontal, 20)

            VStack(spacing: 12) {
                perspectiveRow("US Left", perspectives.usLeft, .blue)
                perspectiveRow("US Right", perspectives.usRight, .red)
                perspectiveRow("International", perspectives.international, .purple)
            }
            .padding(20)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
            .padding(.horizontal, 20)
        }
    }

    private func perspectiveRow(_ label: String, _ perspective: BiasPerspective, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(label)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(color)
                Spacer()
                Text("Consensus: \(Int(perspective.consensus * 100))%")
                    .font(.caption.monospacedDigit())
                    .foregroundColor(.secondary)
            }

            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Bias")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Text(String(format: "%.2f", perspective.bias))
                        .font(.caption.monospacedDigit())
                        .foregroundColor(.vsDarkGray)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Sensationalism")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Text("\(Int(perspective.sensationalism * 100))%")
                        .font(.caption.monospacedDigit())
                        .foregroundColor(.vsDarkGray)
                }
            }
        }
        .padding(12)
        .background(Color.vsBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Placeholder

    private var placeholderSection: some View {
        VStack(spacing: 16) {
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 48))
                .foregroundColor(.vsGray)
            Text("Bias analysis not yet performed")
                .font(.headline)
                .foregroundColor(.vsNavy)
            Text("Tap the 'Bias Analysis' button in the results screen to begin")
                .font(.subheadline)
                .foregroundColor(.vsDarkGray)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(40)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
        .padding(.horizontal, 20)
    }

    // MARK: - Error

    private func errorSection(_ error: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 32))
                .foregroundColor(.vsOrange)
            Text("Bias Analysis Failed")
                .font(.headline)
                .foregroundColor(.vsNavy)
            Text(error)
                .font(.subheadline)
                .foregroundColor(.vsDarkGray)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(Color.vsOrange.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 20)
    }
}

// MARK: - Model Thinking Card

struct ModelThinkingCard: View {
    let update: ModelBiasUpdate

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Status indicator
            Circle()
                .fill(statusColor)
                .frame(width: 12, height: 12)
                .padding(.top, 4)

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(modelDisplayName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.vsNavy)
                    Spacer()
                    Text(perspectiveLabel)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.vsGray.opacity(0.3))
                        .clipShape(Capsule())
                }

                if let reasoning = update.reasoning, !reasoning.isEmpty {
                    Text(reasoning)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    Text(statusMessage)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .italic()
                }

                if update.status == "complete", let bias = update.bias {
                    HStack(spacing: 12) {
                        Label("Bias: \(String(format: "%.2f", bias))", systemImage: "arrow.left.arrow.right")
                        Label("Sensationalism: \(Int((update.sensationalism ?? 0) * 100))%", systemImage: "exclamationmark.triangle")
                    }
                    .font(.caption2)
                    .foregroundColor(.vsDarkGray)
                }
            }
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private var statusColor: Color {
        switch update.status {
        case "thinking": return .yellow
        case "analyzing": return .blue
        case "complete": return .green
        default: return .gray
        }
    }

    private var statusMessage: String {
        switch update.status {
        case "thinking": return "Analyzing bias patterns..."
        case "analyzing": return "Evaluating language and framing..."
        case "complete": return "Analysis complete"
        default: return "Processing..."
        }
    }

    private var modelDisplayName: String {
        update.modelName
    }

    private var perspectiveLabel: String {
        switch update.perspective {
        case "us-left": return "US Left"
        case "us-right": return "US Right"
        case "international": return "International"
        default: return update.perspective.capitalized
        }
    }
}

// MARK: - Model Assessment Card

struct ModelAssessmentCard: View {
    let assessment: ModelBiasUpdate

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(assessment.modelName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.vsNavy)
                Spacer()
                if let bias = assessment.bias {
                    Text(String(format: "%.2f", bias))
                        .font(.caption.monospacedDigit())
                        .foregroundColor(biasColor(bias))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(biasColor(bias).opacity(0.1))
                        .clipShape(Capsule())
                }
            }

            if let reasoning = assessment.reasoning, !reasoning.isEmpty {
                Text(reasoning)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let bias = assessment.bias, let sens = assessment.sensationalism {
                HStack(spacing: 16) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Political Bias")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        Text(String(format: "%.2f", bias))
                            .font(.caption.monospacedDigit())
                            .foregroundColor(.vsDarkGray)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Sensationalism")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        Text("\(Int(sens * 100))%")
                            .font(.caption.monospacedDigit())
                            .foregroundColor(.vsDarkGray)
                    }
                }
            }
        }
        .padding(16)
        .background(Color.vsBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func biasColor(_ bias: Double) -> Color {
        if bias < -0.3 { return .blue }
        if bias > 0.3 { return .red }
        return .gray
    }
}
