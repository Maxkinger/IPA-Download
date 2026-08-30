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
release_env = release_step.fetch("env")
check.call(release_env["DMG_PATH"] == expected_paths[0], "release DMG must come from package output")
check.call(release_env["CHECKSUM_PATH"] == expected_paths[1], "release checksum must come from package output")
release_command = release_step.fetch("run")
check.call(release_command.include?('"$DMG_PATH"'), "release DMG path must be quoted")
check.call(release_command.include?('"$CHECKSUM_PATH"'), "release checksum path must be quoted")

publication_source = [upload_step.fetch("with").fetch("path"), release_command].join("\n")
check.call(!publication_source.match?(%r{dist/[^\s]*\*}), "dist globs must not publish assets")

sample_outputs = {
  expected_paths[0] => "dist/IDAPastel-1-arm64.dmg",
  expected_paths[1] => "dist/IDAPastel-1-arm64.dmg.sha256"
}
resolved_assets = configured_paths.map { |entry| sample_outputs.fetch(entry) }
check.call(!resolved_assets.include?("dist/unrelated.dmg"), "unrelated dist files must not be selected")

puts "PASS workflow publishes only the exact verified DMG pair"
