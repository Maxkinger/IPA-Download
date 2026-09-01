#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

workflow_path = File.expand_path("../.github/workflows/build-idapastel-dmg.yml", __dir__)
workflow = YAML.safe_load(File.read(workflow_path), aliases: true)
steps = workflow.fetch("jobs").fetch("build").fetch("steps")
project_path = File.expand_path("../Pastel.xcodeproj/project.pbxproj", __dir__)
project = File.read(project_path)

check = lambda do |condition, message|
  raise message unless condition
end

marketing_versions = project.scan(/^\s*MARKETING_VERSION = ([^;]+);$/).flatten.uniq
build_versions = project.scan(/^\s*CURRENT_PROJECT_VERSION = ([^;]+);$/).flatten.uniq
check.call(marketing_versions == ["1.0.0"], "IDAPastel marketing version must be 1.0.0 in every configuration")
check.call(build_versions == ["1"], "local IDAPastel build number must default to 1 in every configuration")

version_step = steps.find { |step| step["name"] == "Resolve build version" }
check.call(version_step, "Resolve build version step is missing")
check.call(version_step["id"] == "version", "Resolve build version must expose id=version")
version_script = version_step.fetch("run")
check.call(version_script.include?("MARKETING_VERSION"), "build version resolution must read MARKETING_VERSION from the project")
check.call(version_script.include?("idapastel-v"), "tag version validation must recognize idapastel-v tags")
check.call(version_script.include?("GITHUB_OUTPUT"), "resolved app version must be written to GITHUB_OUTPUT")

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
check.call(release_env["APP_VERSION"] == "${{ steps.version.outputs.app_version }}", "tag release must expose the resolved app version")
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
  release_command.strip == 'gh release create "$GITHUB_REF_NAME" "$DMG_PATH" "$CHECKSUM_PATH" --notes "$RELEASE_NOTES" --title "IDAPastel $APP_VERSION"',
  "tag release command must publish exactly the verified DMG and checksum assets"
)

build_step = steps.find { |step| step["name"] == "Build IDAPastel" }
check.call(build_step, "Build IDAPastel step is missing")
build_script = build_step.fetch("run")
check.call(build_script.include?(%q{CURRENT_PROJECT_VERSION="$GITHUB_RUN_NUMBER"}), "Actions must use the run number as the build number")
check.call(steps.index(version_step) < steps.index(build_step), "build version must be resolved before the app is built")

tv_release_step = steps.find { |step| step["name"] == "Publish tv Build Release" }
check.call(tv_release_step, "tv build release step is missing")
check.call(tv_release_step["if"] == "github.ref == 'refs/heads/tv'", "tv build release must be limited to tv branch pushes")
tv_release_env = tv_release_step.fetch("env")
check.call(tv_release_env["APP_VERSION"] == "${{ steps.version.outputs.app_version }}", "tv build release must expose the resolved app version")
check.call(tv_release_env["DMG_PATH"] == expected_paths[0], "tv build release DMG must come from package output")
check.call(tv_release_env["CHECKSUM_PATH"] == expected_paths[1], "tv build release checksum must come from package output")
check.call(tv_release_env["RELEASE_TAG"] == "idapastel-build-${{ github.run_id }}-${{ github.run_attempt }}", "tv build release tag must be unique per run attempt")
tv_release_command = tv_release_step.fetch("run")
check.call(
  tv_release_command.strip == 'gh release create "$RELEASE_TAG" "$DMG_PATH" "$CHECKSUM_PATH" --target "$GITHUB_SHA" --prerelease --notes "$RELEASE_NOTES" --title "IDAPastel $APP_VERSION (Build $GITHUB_RUN_NUMBER)"',
  "tv build release command must publish exactly the verified DMG and checksum assets"
)

publication_source = [upload_step.fetch("with").fetch("path"), release_command, tv_release_command].join("\n")
check.call(!publication_source.match?(%r{dist/[^\s]*\*}), "dist globs must not publish assets")

sample_outputs = {
  expected_paths[0] => "dist/IDAPastel-1.0.0-arm64.dmg",
  expected_paths[1] => "dist/IDAPastel-1.0.0-arm64.dmg.sha256"
}
resolved_assets = configured_paths.map { |entry| sample_outputs.fetch(entry) }
check.call(!resolved_assets.include?("dist/unrelated.dmg"), "unrelated dist files must not be selected")

puts "PASS workflow publishes only the exact verified DMG pair"
