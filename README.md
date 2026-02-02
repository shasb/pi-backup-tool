# Pi Backup Tool

A terminal user interface (TUI) app for backing up and restoring Raspberry Pi SD cards using `dd` and `pishrink`.

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **Interactive TUI** - Easy-to-use terminal interface with keyboard navigation
- **Backup SD cards** - Create full disk images using `dd`
- **Restore images** - Write images back to SD cards
- **Auto-unmount** - Automatically unmounts disks before operations
- **Compressed images** - Supports reading/writing `.img.gz` files
- **Auto-shrink** - Optionally shrinks images with `pishrink` (Linux)
- **Progress display** - Real-time speed and bytes written
- **Device detection** - Automatically detects external disks

## Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/pi-backup-tool.git
cd pi-backup-tool

# Install dependencies
npm install

# Build the project
npm run build

# Install globally (optional)
npm link
```

## Usage

```bash
# Run directly
npm start

# Or if installed globally
pi-backup
```

### Main Menu

```
🥧 Pi Backup Tool

What would you like to do?
❯ 💾 Backup SD card to image file
  📀 Restore image file to SD card
  ❌ Exit
```

### Backup Flow

1. Select source SD card from detected devices (or enter path manually)
2. Browse to destination directory
3. Enter filename (defaults to `pi-backup.img`)
4. Confirm and start backup
5. Image is automatically shrunk with pishrink (Linux only)

### Restore Flow

1. Browse and select an image file (`.img`, `.img.gz`, `.iso`, `.dmg`)
2. Select target SD card
3. Confirm (warning: this erases all data on the target!)
4. Image is written to the SD card

## Requirements

- **Node.js** 18 or higher
- **sudo access** - Required for raw disk operations
- **macOS or Linux**

### Optional (for shrinking)

On Linux, pishrink requires:
- `parted`
- `e2fsck`
- `resize2fs`

pishrink is automatically downloaded on first use.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| ↑/↓ | Navigate menu |
| Enter | Select/Confirm |
| q | Quit |
| Ctrl+C | Force quit |

## How It Works

### Backup
```bash
# The tool runs (approximately):
diskutil unmountDisk disk12
sudo dd if=/dev/rdisk12 of=backup.img bs=4m status=progress
pishrink.sh backup.img  # Linux only
```

### Restore
```bash
# The tool runs (approximately):
diskutil unmountDisk disk12
sudo dd if=backup.img of=/dev/rdisk12 bs=4m status=progress

# For compressed images:
gunzip -c backup.img.gz | sudo dd of=/dev/rdisk12 bs=4m status=progress
```

## Project Structure

```
pi-backup-tool/
├── src/
│   └── index.js      # Main application source
├── dist/
│   └── index.js      # Compiled application
├── package.json
├── babel.config.json
├── LICENSE
└── README.md
```

## Development

```bash
# Run in development mode (with babel-node)
npm start

# Build for production
npm run build

# Run built version
node dist/index.js
```

## Troubleshooting

### "dd failed with exit code 1"
- Ensure the SD card is inserted
- Try manually unmounting: `diskutil unmountDisk /dev/diskX`
- Check you have sudo access

### "Resource busy"
- Close any applications using the SD card
- Eject and reinsert the SD card
- Run `diskutil unmountDisk /dev/diskX`

### pishrink fails on macOS
- pishrink requires Linux utilities (`parted`, `resize2fs`)
- The backup still completes, just without shrinking
- Transfer the image to Linux to shrink, or use `gzip` to compress

## Manual Backup/Restore

If you prefer command-line:

```bash
# Backup
diskutil unmountDisk /dev/disk12
sudo dd if=/dev/rdisk12 of=~/pi-backup.img bs=4m status=progress

# Restore
diskutil unmountDisk /dev/disk12
sudo dd if=~/pi-backup.img of=/dev/rdisk12 bs=4m status=progress

# Compress
gzip pi-backup.img

# Restore compressed
gunzip -c pi-backup.img.gz | sudo dd of=/dev/rdisk12 bs=4m status=progress
```

## License

MIT License - see [LICENSE](LICENSE) file.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Acknowledgments

- [Ink](https://github.com/vadimdemedes/ink) - React for CLI apps
- [PiShrink](https://github.com/Drewsif/PiShrink) - Image shrinking tool
