import Foundation
import UIKit

// MARK: - Talks to the Vercel backend

final class APIClient {
    static let shared = APIClient()

    // ⚠️  CHANGE THIS to your deployed Vercel URL
    private let baseURL = "https://hackncstate.vercel.app"

    private init() {}

    // MARK: - Analyze (single call: upload + analyze)

    func analyzeImage(_ image: UIImage) async throws -> AnalysisResult {
        // Resize image to max 1200px width to reduce size
        let resizedImage = image.resized(to: CGSize(width: 1200, height: 1200))
        
        // Use lower compression quality (0.4) to keep under 4MB limit
        guard let jpegData = resizedImage.jpegData(compressionQuality: 0.4) else {
            throw APIError.invalidImage
        }

        // Check size - Vercel has ~4.5MB limit, base64 adds ~33% overhead
        // So we want raw image to be < 3MB
        let maxSize = 3 * 1024 * 1024 // 3MB
        if jpegData.count > maxSize {
            // Try even lower quality
            guard let compressedData = resizedImage.jpegData(compressionQuality: 0.3) else {
                throw APIError.invalidImage
            }
            if compressedData.count > maxSize {
                throw APIError.invalidImage // Image too large even after compression
            }
            return try await uploadAndAnalyze(compressedData)
        }

        return try await uploadAndAnalyze(jpegData)
    }
    
    private func uploadAndAnalyze(_ imageData: Data) async throws -> AnalysisResult {
        let base64 = imageData.base64EncodedString()
        
        let body: [String: Any] = [
            "image": base64,
            "filename": "screenshot-\(Int(Date().timeIntervalSince1970)).jpg"
        ]

        let data = try await post(path: "/api/analyze", body: body)
        let result = try JSONDecoder().decode(AnalysisResult.self, from: data)
        return result
    }

    // MARK: - Chat (standard or deep_research mode)

    func chat(
        jobId: String,
        message: String,
        context: String,
        mode: String = "standard"
    ) async throws -> String {
        let body: [String: Any] = [
            "jobId": jobId,
            "message": message,
            "context": context,
            "mode": mode
        ]
        let data = try await post(path: "/api/chat", body: body)
        let resp = try JSONDecoder().decode(ChatResponse.self, from: data)
        return resp.reply
    }

    // MARK: - Save Analysis to Backboard Memory (for cross-thread chat recall)

    func saveAnalysisMemory(jobId: String, content: String) async throws {
        let body: [String: Any] = [
            "jobId": jobId,
            "content": content
        ]
        _ = try await post(path: "/api/save-memory", body: body)
    }

    // MARK: - Health Check

    func healthCheck() async -> String {
        do {
            guard let url = URL(string: baseURL + "/api/health") else { return "Bad URL" }
            let (data, _) = try await URLSession.shared.data(from: url)
            return String(data: data, encoding: .utf8) ?? "No response"
        } catch {
            return "Error: \(error.localizedDescription)"
        }
    }

    // MARK: - Private

    private func post(path: String, body: [String: Any]) async throws -> Data {
        guard let url = URL(string: baseURL + path) else { throw APIError.badURL }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120  // allow time for analysis

        let jsonData = try JSONSerialization.data(withJSONObject: body)
        request.httpBody = jsonData

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse else { throw APIError.noResponse }

        guard (200...299).contains(http.statusCode) else {
            // Try to extract the error message from JSON response
            var errorMsg = "Unknown error"
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                if let serverError = json["error"] as? String {
                    errorMsg = serverError
                }
                if let hint = json["hint"] as? String {
                    errorMsg += " (\(hint))"
                }
            } else {
                errorMsg = String(data: data, encoding: .utf8) ?? "Unknown error"
            }
            throw APIError.server(http.statusCode, errorMsg)
        }
        return data
    }
}

enum APIError: LocalizedError {
    case invalidImage
    case badURL
    case noResponse
    case server(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidImage: return "Could not process image (may be too large)"
        case .badURL: return "Invalid server URL"
        case .noResponse: return "No response from server"
        case .server(let code, let msg): return "Server error \(code): \(msg)"
        }
    }
}

// MARK: - UIImage Extension for Resizing

extension UIImage {
    func resized(to maxSize: CGSize) -> UIImage {
        // Maintain aspect ratio
        let aspectRatio = self.size.width / self.size.height
        var newSize = maxSize
        
        if self.size.width > self.size.height {
            // Landscape
            newSize.height = maxSize.width / aspectRatio
        } else {
            // Portrait
            newSize.width = maxSize.height * aspectRatio
        }
        
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            self.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}
