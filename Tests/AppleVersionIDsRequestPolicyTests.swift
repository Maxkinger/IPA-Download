import Foundation

@main
struct AppleVersionIDsRequestPolicyTests {
    private static var assertions = 0

    private static func expect(_ condition: @autoclosure () -> Bool, _ label: String) {
        assertions += 1
        guard condition() else {
            fputs("FAIL \(label)\n", stderr)
            exit(1)
        }
    }

    static func main() {
        let tvRequest = AppleVersionIDsRequestContext(appID: "42", platform: "appletv")
        let phoneRequest = AppleVersionIDsRequestContext(appID: "42", platform: "iphone")
        let otherPhoneApp = AppleVersionIDsRequestContext(appID: "84", platform: "iphone")
        let tvResponse = AppleVersionIDsResponse(
            appID: "42",
            platform: "appletv",
            latestVersionID: "900",
            versionIDs: ["700", "800", "900"]
        )

        expect(
            AppleVersionIDsRequestPolicy.decision(
                for: tvResponse,
                request: tvRequest,
                current: phoneRequest
            ) == .stale,
            "a tvOS response is stale after the UI switches to iPhone"
        )

        expect(
            AppleVersionIDsRequestPolicy.decision(
                for: AppleVersionIDsResponse(
                    appID: "84",
                    platform: "iphone",
                    latestVersionID: "900",
                    versionIDs: ["700", "800", "900"]
                ),
                request: phoneRequest,
                current: phoneRequest
            ) == .stale,
            "a response for another App ID is stale"
        )

        expect(
            AppleVersionIDsRequestPolicy.decision(
                for: AppleVersionIDsResponse(
                    appID: "42",
                    platform: "appletv",
                    latestVersionID: "900",
                    versionIDs: ["700", "800", "900"]
                ),
                request: phoneRequest,
                current: phoneRequest
            ) == .stale,
            "a response carrying another platform is stale"
        )

        expect(
            AppleVersionIDsRequestPolicy.decision(
                for: AppleVersionIDsResponse(
                    appID: "42",
                    platform: "iphone",
                    latestVersionID: "900",
                    versionIDs: ["700", "800", "900"]
                ),
                request: phoneRequest,
                current: otherPhoneApp
            ) == .stale,
            "a response is stale after the UI switches to another App ID"
        )

        expect(
            AppleVersionIDsRequestPolicy.decision(
                for: AppleVersionIDsResponse(
                    appID: "42",
                    platform: "iphone",
                    latestVersionID: "900",
                    versionIDs: ["700", "800", "900"]
                ),
                request: phoneRequest,
                current: phoneRequest
            ) == .apply(visibleVersionIDs: ["900", "800", "700"], isAppleTV: false),
            "a matching iPhone response keeps all IDs in reverse order"
        )

        expect(
            AppleVersionIDsRequestPolicy.decision(
                for: tvResponse,
                request: tvRequest,
                current: tvRequest
            ) == .apply(visibleVersionIDs: ["900"], isAppleTV: true),
            "a matching Apple TV response exposes only its latest ID"
        )

        var state = AppleVersionIDsRequestState()
        expect(
            state.registerStart(of: tvRequest, jobStarted: true),
            "the first fixed-key request records its context"
        )
        expect(
            state.isLoading(for: tvRequest),
            "the initiating context is loading while its job runs"
        )
        expect(
            !state.registerStart(of: phoneRequest, jobStarted: false),
            "a second request rejected by the fixed job key is not registered"
        )
        expect(
            state.activeRequest == tvRequest,
            "a rejected second request cannot replace the running request context"
        )
        expect(
            !state.isLoading(for: phoneRequest),
            "the rejected second request does not leave its UI context loading"
        )

        let completedRequest = state.takeCompletedRequest()
        expect(
            completedRequest == tvRequest,
            "completion remains bound to the request that actually started"
        )
        expect(
            AppleVersionIDsRequestPolicy.decision(
                for: tvResponse,
                request: completedRequest!,
                current: phoneRequest
            ) == .stale,
            "the old fixed-key completion cannot bind to the new UI context"
        )
        expect(
            !state.isLoading(for: tvRequest) && !state.isLoading(for: phoneRequest),
            "taking the completion clears loading state"
        )

        print("PASS AppleVersionIDsRequestPolicyTests (\(assertions) assertions)")
    }
}
