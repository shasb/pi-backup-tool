# Project Log - Pi Backup Tool

This log tracks all major changes, decisions, and development history so any future session can pick up where we left off.

## Project Overview

A TUI (Terminal User Interface) app for backing up and restoring Raspberry Pi SD cards using `dd` and `pishrink`.

**Repository:** https://github.com/shasb/pi-backup-tool
**Tech Stack:** Node.js, Ink (React for CLI), Babel
**Status:** v1.0.0 - Feature complete, production ready

---

## Development History

### 2025-02-01 - Initial Development

#### Step 1: Project Setup
- Created Node.js project with Ink TUI framework
- Set up Babel for JSX transpilation (Ink uses React)
- Configured ES modules with proper build pipeline

#### Step 2: Core Backup Feature
- Implemented disk detection using `diskutil list -plist external` (macOS)
- Added Linux fallback using `lsblk`
- Created FileBrowser component for destination directory selection
- Implemented `dd` backup with real-time progress parsing
- Used raw device (`/dev/rdiskX`) on macOS for faster reads

#### Step 3: Bug Fix - dd Failing with Exit Code 1
**Problem:** Backup was failing because the SD card was still mounted.
**Solution:** Added automatic unmount step before backup:
```javascript
diskutil unmountDisk diskX
```
This runs during the validation phase before `dd` starts.

#### Step 4: pishrink Integration
- Added automatic download of pishrink if not present
- Runs after backup to shrink image (removes empty space)
- Gracefully handles failure on macOS (pishrink needs Linux tools)

#### Step 5: Restore Feature
- Added main menu to choose between Backup and Restore
- Created ImagePicker component (shows .img, .img.gz, .iso, .dmg files)
- Implemented restore flow: select image → select target disk → confirm → write
- Added support for gzipped images (pipes through `gunzip`)
- Added prominent warning about data destruction

#### Step 6: UX Improvements
- Fixed React key warnings by adding unique keys to all SelectInput items
- Added better error messages (captures actual dd stderr output)
- Added "Main Menu" option in error state
- Added validation step with sudo credential caching

#### Step 7: Documentation & Release
- Created comprehensive README.md
- Added LICENSE (MIT)
- Added .gitignore
- Created GitHub repository
- Added topic tags

---

## Architecture Decisions

### Why Ink/React for CLI?
- Familiar component model
- Easy state management
- Built-in input handling
- Good ecosystem (ink-select-input, ink-spinner, etc.)

### Why Babel?
- Ink uses JSX which needs transpilation
- Allows modern ES6+ syntax
- Build step produces portable Node.js code

### Why Raw Device on macOS?
- `/dev/rdiskX` (raw) is significantly faster than `/dev/diskX` (buffered)
- Can be 5-10x faster for large disk operations

---

## Known Limitations

1. **pishrink on macOS**: Requires Linux tools (parted, e2fsck, resize2fs) - backup works but shrinking is skipped
2. **Progress accuracy**: dd's progress output is parsed but percentage can't be calculated without knowing total disk size upfront
3. **No Windows support**: Uses Unix-specific disk utilities

---

## Future Enhancements (Not Implemented)

- [ ] Add percentage progress bar (query disk size first)
- [ ] Add estimated time remaining
- [ ] Add verification step (compare checksums after write)
- [ ] Add scheduled/automated backups
- [ ] Add compression option during backup (pipe through gzip)
- [ ] Add network backup (write to remote location)

---

## Files Overview

```
pi-backup-tool/
├── src/index.js       # Main source (JSX)
├── dist/index.js      # Compiled output
├── package.json       # Dependencies and scripts
├── babel.config.json  # Babel configuration
├── README.md          # User documentation
├── LICENSE            # MIT license
├── PROJECT_LOG.md     # This file
└── .gitignore
```

---

## How to Continue Development

1. Clone the repo
2. `npm install`
3. Edit `src/index.js`
4. `npm run build` to compile
5. `npm start` or `node dist/index.js` to test
6. Update this PROJECT_LOG.md with changes
7. Commit and push
