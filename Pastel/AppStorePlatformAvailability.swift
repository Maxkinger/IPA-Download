import Foundation

enum AppStorePlatformAvailability {
    static func isPlatformAvailable(_ platform: String, country: String) -> Bool {
        let normalizedPlatform = normalizePlatform(platform)
        let normalizedCountry = country.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return !(normalizedPlatform == "appletv" && normalizedCountry == "cn")
    }

    static func fallbackPlatform(platform: String, country: String) -> String {
        let normalizedPlatform = normalizePlatform(platform)
        return isPlatformAvailable(normalizedPlatform, country: country) ? normalizedPlatform : "iphone"
    }

    private static func normalizePlatform(_ value: String) -> String {
        let compact = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "_", with: "")
            .replacingOccurrences(of: "-", with: "")
        if ["tv", "tvos", "appletv"].contains(compact) { return "appletv" }
        if ["ipad", "ipados", "tablet"].contains(compact) { return "ipad" }
        if ["vision", "visionpro", "visionos", "applevisionpro"].contains(compact) { return "vision" }
        return "iphone"
    }
}
