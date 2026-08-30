import Foundation

enum DownloadedPackagePlatform {
    static func canonicalPlatform(metadataValue: String, mainInfoPlistData: Data?) -> String {
        if supportsAppleTV(mainInfoPlistData) {
            return "appletv"
        }

        let compactMetadata = metadataValue
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .filter { $0.isLetter || $0.isNumber }
        if ["appletv", "appletvos", "tvos"].contains(compactMetadata) {
            return "appletv"
        }
        return metadataValue
    }

    private static func supportsAppleTV(_ data: Data?) -> Bool {
        guard let data,
              let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil),
              let info = plist as? [String: Any],
              let platforms = info["CFBundleSupportedPlatforms"] as? [String]
        else {
            return false
        }
        return platforms.contains { $0.caseInsensitiveCompare("AppleTVOS") == .orderedSame }
    }
}
