import Foundation

struct AppleVersionIDsRequestContext: Equatable {
    let appID: String
    let platform: String

    init(appID: String, platform: String) {
        self.appID = appID.trimmingCharacters(in: .whitespacesAndNewlines)
        self.platform = Self.canonicalPlatform(platform)
    }

    var isAppleTV: Bool { platform == "appletv" }

    private static func canonicalPlatform(_ value: String) -> String {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalized == "appletv" || normalized == "tvos" || normalized.contains("appletvos") {
            return "appletv"
        }
        return normalized
    }
}

struct AppleVersionIDsResponse: Equatable {
    let appID: String
    let platform: String?
    let latestVersionID: String
    let versionIDs: [String]
}

enum AppleVersionIDsResponseDecision: Equatable {
    case stale
    case apply(visibleVersionIDs: [String], isAppleTV: Bool)
}

enum AppleVersionIDsRequestPolicy {
    static func decision(
        for response: AppleVersionIDsResponse,
        request: AppleVersionIDsRequestContext,
        current: AppleVersionIDsRequestContext
    ) -> AppleVersionIDsResponseDecision {
        guard request == current,
              response.appID.trimmingCharacters(in: .whitespacesAndNewlines) == request.appID
        else { return .stale }

        if let responsePlatform = response.platform,
           !responsePlatform.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           AppleVersionIDsRequestContext(appID: request.appID, platform: responsePlatform).platform != request.platform {
            return .stale
        }

        if request.isAppleTV {
            let latestVersionID = response.latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
            return .apply(
                visibleVersionIDs: latestVersionID.isEmpty ? [] : [latestVersionID],
                isAppleTV: true
            )
        }

        return .apply(visibleVersionIDs: Array(response.versionIDs.reversed()), isAppleTV: false)
    }
}

struct AppleVersionIDsRequestState: Equatable {
    private(set) var activeRequest: AppleVersionIDsRequestContext?

    @discardableResult
    mutating func registerStart(
        of request: AppleVersionIDsRequestContext,
        jobStarted: Bool
    ) -> Bool {
        guard jobStarted, activeRequest == nil else { return false }
        activeRequest = request
        return true
    }

    func isLoading(for current: AppleVersionIDsRequestContext) -> Bool {
        activeRequest == current
    }

    mutating func takeCompletedRequest() -> AppleVersionIDsRequestContext? {
        defer { activeRequest = nil }
        return activeRequest
    }
}
