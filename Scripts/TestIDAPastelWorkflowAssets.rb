#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

workflow_path = File.expand_path("../.github/workflows/build-idapastel-dmg.yml", __dir__)
workflow = YAML.safe_load(File.read(workflow_path), aliases: true)
steps = workflow.fetch("jobs").fetch("build").fetch("steps")

check = lambda do |condition, message|
  raise message unless condition
end

package_step = steps.find { |step| step["name"] == "Verify and package" }
check.call(package_step, "Verify and package step is missing")
check.call(package_step["id"] == "package", "Verify and package must expose id=package")
check.call(package_step.fetch("run").include?('$GITHUB_OUTPUT'), "verified paths must be written to GITHUB_OUTPUT")

upload_step = steps.find { |step| step["uses"]&.start_with?("actions/upload-artifact@") }
check.call(upload_step, "upload-artifact step is missing")
configured_paths = upload_step.fetch("with").fetch("path").lines.map(&:strip).reject(&:empty?)
expected_paths = [
  "${{ steps.package.outputs.dmg }}",
  "${{ steps.package.outputs.checksum }}"
]
check.call(configured_paths == expected_paths, "artifact upload must contain only the verified DMG pair")

release_step = steps.find { |step| step["name"] == "Publish GitHub Release" }
check.call(release_step, "release step is missing")
check.call(release_step["if"] == "startsWith(github.ref, 'refs/tags/idapastel-v')", "release publication must be limited to idapastel-v tags")
release_env = release_step.fetch("env")
check.call(release_env["DMG_PATH"] == expected_paths[0], "release DMG must come from package output")
check.call(release_env["CHECKSUM_PATH"] == expected_paths[1], "release checksum must come from package output")
release_notes = workflow.fetch("jobs").fetch("build").fetch("env").fetch("RELEASE_NOTES")
check.call(release_notes.is_a?(String), "release notes must be provided through RELEASE_NOTES")
[
  "将 IDAPastel.app 拖入 Applications 文件夹",
  "Ad Hoc 方式分发，且未经过公证",
  "仍要打开",
  "右键",
  "“打开”",
  "Apple 芯片（arm64）",
  "Apple TV/tvOS IPA",
  "搜索、下载并校验",
  "不负责安装或部署",
  "SHA-256",
  ".sha256 校验文件"
].each do |required_topic|
  check.call(release_notes.include?(required_topic), "release notes must explain: #{required_topic}")
end
release_command = release_step.fetch("run")
check.call(
  release_command.strip == 'gh release create "$GITHUB_REF_NAME" "$DMG_PATH" "$CHECKSUM_PATH" --notes "$RELEASE_NOTES" --title "IDAPastel $GITHUB_REF_NAME"',
  "tag release command must publish exactly the verified DMG and checksum assets"
)

tv_release_step = steps.find { |step| step["name"] == "Publish tv Build Release" }
check.call(tv_release_step, "tv build release step is missing")
check.call(tv_release_step["if"] == "github.ref == 'refs/heads/tv'", "tv build release must be limited to tv branch pushes")
tv_release_env = tv_release_step.fetch("env")
check.call(tv_release_env["DMG_PATH"] == expected_paths[0], "tv build release DMG must come from package output")
check.call(tv_release_env["CHECKSUM_PATH"] == expected_paths[1], "tv build release checksum must come from package output")
check.call(tv_release_env["RELEASE_TAG"] == "idapastel-build-${{ github.run_id }}-${{ github.run_attempt }}", "tv build release tag must be unique per run attempt")
tv_release_command = tv_release_step.fetch("run")
check.call(
  tv_release_command.strip == 'gh release create "$RELEASE_TAG" "$DMG_PATH" "$CHECKSUM_PATH" --target "$GITHUB_SHA" --prerelease --notes "$RELEASE_NOTES" --title "IDAPastel build $GITHUB_RUN_NUMBER"',
  "tv build release command must publish exactly the verified DMG and checksum assets"
)

publication_source = [upload_step.fetch("with").fetch("path"), release_command, tv_release_command].join("\n")
check.call(!publication_source.match?(%r{dist/[^\s]*\*}), "dist globs must not publish assets")

sample_outputs = {
  expected_paths[0] => "dist/IDAPastel-1-arm64.dmg",
  expected_paths[1] => "dist/IDAPastel-1-arm64.dmg.sha256"
}
resolved_assets = configured_paths.map { |entry| sample_outputs.fetch(entry) }
check.call(!resolved_assets.include?("dist/unrelated.dmg"), "unrelated dist files must not be selected")

puts "PASS workflow publishes only the exact verified DMG pair"
