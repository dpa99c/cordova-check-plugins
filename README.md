cordova-check-plugins
=====================

A CLI tool to check for updates / manage updating plugins in Cordova/Phonegap projects.

# Purpose

This tool intends to provide a convenient way to check if the plugins contained within a Cordova project are up-to-date with their remote source and to optionally update them, either automatically or interactively.

[![CLI screenshot](https://raw.githubusercontent.com/dpa99c/cordova-check-plugins/master/screenshot/1.thumb.jpg)](https://raw.githubusercontent.com/dpa99c/cordova-check-plugins/master/screenshot/1.jpg)

# Supported plugin sources

Plugins sourced via the npm registry (with optionally specified versions) or directly from GitHub repos (with optionally specified branches/tags) are supported.

For example:

    cordova-plugin-camera
    cordova-plugin-geolocation@*
    cordova-plugin-whitelist@1
    cordova-plugin-file@4.0.0
    https://github.com/dpa99c/cordova-custom-config
    https://github.com/apache/cordova-plugin-battery-status#r1.0.0

# Installation

    npm install -g cordova-check-plugins

# Usage

Once `cordova-check-plugins` is installed globally, it can be run from the root of any Cordova/Phonegap project:

    $ cordova-check-plugins

By default, it will display lists of plugins under the following categories:

- "Plugin update available" - installed plugins for which a new remote version is available (displayed in green)
- "Installed plugin version newer than remote default" - installed plugins for which the local version is newer than the default remote version (displayed in yellow)
- "Unknown plugin version mismatch" - installed plugins for which the remote version could not be determined as older/newer (displayed in yellow)
- "Error checking plugin version" - installed plugins for which an error occurred while checking the plugin versions (displayed in red)
- "Up-to-date plugins" - (only if [--verbose](#--verbose) is specified) installed plugins which are up-to-date with the detected remote version (displayed in cyan)

Plugins for which updates are available can optionally be updated either interactively or automatically via the `--update` command-line option.

## Command-line options

### --verbose

Displays detailed log output and lists "Up-to-date plugins"

    $ cordova-check-plugins --verbose

### --update={mode}

Specifies update mode for plugins which have updates available. Valid modes are:

- `none` - (default) don't update plugins
- `interactive` - using interactive CLI to choose which plugins to update manually
- `auto` - automatically update any plugins for which an update is available

i.e.

    $ cordova-check-plugins --update=none
        same as:  $ cordova-check-plugins
    $ cordova-check-plugins --update=interactive
    $ cordova-check-plugins --update=auto

License
================

The MIT License

Copyright (c) 2015 Dave Alden / Working Edge Ltd.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
