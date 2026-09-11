# Adds the AlarmKit native files to the RoyceTravelTemplate target and wires the
# Swift Objective-C bridging header. Idempotent — safe to run more than once.
#
# Run with CocoaPods' bundled xcodeproj gem:
#   CP=/opt/homebrew/Cellar/cocoapods/1.16.2_2/libexec
#   GEM_HOME=$CP GEM_PATH=$CP /usr/bin/ruby ios/scripts/wire_alarm_module.rb
require 'xcodeproj'

project_path = File.expand_path(File.join(__dir__, '..', 'RoyceTravelTemplate.xcodeproj'))
proj = Xcodeproj::Project.open(project_path)

app = proj.targets.find { |t| t.name == 'RoyceTravelTemplate' }
raise 'app target not found' unless app
group = proj.main_group['RoyceTravelTemplate']
raise 'RoyceTravelTemplate group not found' unless group

SOURCES = %w[AlarmModule.swift AlarmModule.m]
HEADERS = %w[RoyceTravelTemplate-Bridging-Header.h]

def find_ref(proj, name)
  proj.files.find { |f| f.display_name == name }
end

(SOURCES + HEADERS).each do |name|
  ref = find_ref(proj, name)
  if ref
    puts "ref exists: #{name}"
  else
    ref = group.new_file(name) # path is relative to the group (RoyceTravelTemplate/)
    puts "added ref:  #{name}"
  end

  next unless SOURCES.include?(name)

  already = app.source_build_phase.files_references.include?(ref)
  if already
    puts "in build:   #{name}"
  else
    app.source_build_phase.add_file_reference(ref)
    puts "added build:#{name}"
  end
end

app.build_configurations.each do |c|
  c.build_settings['SWIFT_OBJC_BRIDGING_HEADER'] =
    'RoyceTravelTemplate/RoyceTravelTemplate-Bridging-Header.h'
  c.build_settings['SWIFT_VERSION'] ||= '5.0'
  c.build_settings['CLANG_ENABLE_MODULES'] = 'YES'
  puts "settings set for config: #{c.name}"
end

proj.save
puts 'SAVED project.'
