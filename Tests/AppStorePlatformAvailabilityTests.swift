import Foundation

@main
struct AppStorePlatformAvailabilityTests {
    private static var assertions = 0

    private static func expect(_ actual: Bool, _ expected: Bool, _ label: String) {
        assertions += 1
        guard actual == expected else {
            fputs("FAIL \(label): expected \(expected), got \(actual)\n", stderr)
            exit(1)
        }
    }

    private static func expect(_ actual: String, _ expected: String, _ label: String) {
        assertions += 1
        guard actual == expected else {
            fputs("FAIL \(label): expected \(expected), got \(actual)\n", stderr)
            exit(1)
        }
    }

    static func main() {
        expect(
            AppStorePlatformAvailability.isPlatformAvailable("appletv", country: "cn"),
            false,
            "China disables Apple TV"
        )
        expect(
            AppStorePlatformAvailability.isPlatformAvailable("appletv", country: "US"),
            true,
            "US enables Apple TV"
        )
        expect(
            AppStorePlatformAvailability.isPlatformAvailable("iphone", country: "cn"),
            true,
            "China keeps iPhone enabled"
        )
        expect(
            AppStorePlatformAvailability.fallbackPlatform(platform: "appletv", country: "cn"),
            "iphone",
            "China falls back from Apple TV to iPhone"
        )
        expect(
            AppStorePlatformAvailability.fallbackPlatform(platform: "appletv", country: "hk"),
            "appletv",
            "Hong Kong keeps Apple TV"
        )

        for country in ["us", "ca", "hk", "tw", "jp"] {
            expect(
                AppStorePlatformAvailability.isPlatformAvailable("appletv", country: country),
                true,
                "Apple TV remains available in \(country)"
            )
        }

        print("PASS AppStorePlatformAvailabilityTests (\(assertions) assertions)")
    }
}
