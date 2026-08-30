import Foundation

@main
struct DownloadedPackagePlatformTests {
    private static var assertions = 0

    private static func expect(_ actual: String, _ expected: String, _ label: String) {
        assertions += 1
        guard actual == expected else {
            fputs("FAIL \(label): expected \(expected), got \(actual)\n", stderr)
            exit(1)
        }
    }

    private static func infoPlist(format: PropertyListSerialization.PropertyListFormat) throws -> Data {
        try PropertyListSerialization.data(
            fromPropertyList: ["CFBundleSupportedPlatforms": ["AppleTVOS"]],
            format: format,
            options: 0
        )
    }

    static func main() throws {
        let xml = try infoPlist(format: .xml)
        let binary = try infoPlist(format: .binary)

        expect(
            DownloadedPackagePlatform.canonicalPlatform(metadataValue: "", mainInfoPlistData: xml),
            "appletv",
            "XML AppleTVOS package fact"
        )
        expect(
            DownloadedPackagePlatform.canonicalPlatform(metadataValue: "iphone", mainInfoPlistData: binary),
            "appletv",
            "binary package fact overrides optional metadata"
        )

        for alias in ["appletv", "AppleTVOS", "tvos", "tvOS"] {
            expect(
                DownloadedPackagePlatform.canonicalPlatform(metadataValue: alias, mainInfoPlistData: nil),
                "appletv",
                "canonical metadata alias \(alias)"
            )
        }

        for existing in ["iphone", "ipad", "vision"] {
            expect(
                DownloadedPackagePlatform.canonicalPlatform(metadataValue: existing, mainInfoPlistData: nil),
                existing,
                "preserve \(existing)"
            )
        }

        print("PASS DownloadedPackagePlatformTests (\(assertions) assertions)")
    }
}
