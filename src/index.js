import React, { useState, useEffect } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { execSync, spawn } from 'child_process';
import { existsSync, statSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname, basename } from 'path';

// Application modes
const MODES = {
  BACKUP: 'backup',
  RESTORE: 'restore',
};

// Application states
const STATES = {
  MAIN_MENU: 'main_menu',
  SELECT_SOURCE: 'select_source',
  SELECT_DEST: 'select_dest',
  CONFIRM: 'confirm',
  VALIDATING: 'validating',
  BACKING_UP: 'backing_up',
  SHRINKING: 'shrinking',
  RESTORING: 'restoring',
  COMPLETE: 'complete',
  ERROR: 'error',
};

// Get list of disk devices (macOS specific, with Linux fallback)
function getDisks() {
  try {
    const platform = process.platform;

    if (platform === 'darwin') {
      // macOS: use diskutil to get external/removable disks
      const output = execSync('diskutil list -plist external', { encoding: 'utf8' });
      const diskMatches = output.match(/<string>(disk\d+)<\/string>/g) || [];
      const disks = [...new Set(diskMatches.map(m => m.match(/disk\d+/)[0]))];

      return disks.map((disk, idx) => {
        try {
          const info = execSync(`diskutil info ${disk}`, { encoding: 'utf8' });
          const nameMatch = info.match(/Media Name:\s+(.+)/);
          const sizeMatch = info.match(/Disk Size:\s+([^\(]+)/);
          const name = nameMatch ? nameMatch[1].trim() : 'Unknown';
          const size = sizeMatch ? sizeMatch[1].trim() : 'Unknown size';
          return {
            key: `disk-${idx}-${disk}`,
            label: `${disk} - ${name} (${size})`,
            value: `/dev/r${disk}`,  // Use raw device for faster dd
          };
        } catch {
          return { key: `disk-${idx}-${disk}`, label: disk, value: `/dev/r${disk}` };
        }
      });
    } else {
      // Linux: look for removable block devices
      const output = execSync('lsblk -d -o NAME,SIZE,MODEL,RM -n', { encoding: 'utf8' });
      return output.trim().split('\n')
        .filter(line => line.trim())
        .map((line, idx) => {
          const parts = line.trim().split(/\s+/);
          const name = parts[0];
          const size = parts[1] || 'Unknown';
          const model = parts.slice(2, -1).join(' ') || 'Unknown';
          const removable = parts[parts.length - 1] === '1';
          return {
            key: `disk-${idx}-${name}`,
            label: `${name} - ${model} (${size})${removable ? ' [Removable]' : ''}`,
            value: `/dev/${name}`,
            removable,
          };
        })
        .filter(d => d.removable || d.value.includes('mmcblk') || d.value.includes('sd'));
    }
  } catch (error) {
    return [{ label: 'Error detecting disks - enter manually', value: '' }];
  }
}

// File browser component for destination selection
function FileBrowser({ currentPath, onSelect, onCancel }) {
  const [path, setPath] = useState(currentPath);
  const [items, setItems] = useState([]);
  const [inputMode, setInputMode] = useState(false);
  const [fileName, setFileName] = useState('pi-backup.img');

  useEffect(() => {
    try {
      const entries = readdirSync(path, { withFileTypes: true });
      const dirs = entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map((e, idx) => ({
          key: `dir-${idx}-${e.name}`,
          label: `📁 ${e.name}/`,
          value: join(path, e.name),
          isDir: true,
        }));

      const parentDir = dirname(path);
      const navItems = path !== '/' ? [{ key: 'parent-dir', label: '📁 ../', value: parentDir, isDir: true }] : [];

      setItems([
        ...navItems,
        ...dirs.sort((a, b) => a.label.localeCompare(b.label)),
        { key: 'select-dir', label: '✅ Select this directory', value: path, isSelect: true },
      ]);
    } catch (error) {
      setItems([
        { key: 'error-parent', label: '📁 ../', value: dirname(path), isDir: true },
        { key: 'error-msg', label: `Error: ${error.message}`, value: path, isDir: false },
      ]);
    }
  }, [path]);

  const handleSelect = (item) => {
    if (item.isSelect) {
      setInputMode(true);
    } else if (item.isDir) {
      setPath(item.value);
    }
  };

  if (inputMode) {
    return (
      <Box flexDirection="column">
        <Text color="cyan">Enter filename (will be saved to {path}):</Text>
        <Box>
          <Text color="green">❯ </Text>
          <TextInput
            value={fileName}
            onChange={setFileName}
            onSubmit={() => onSelect(join(path, fileName))}
          />
        </Box>
        <Text dimColor>Press Enter to confirm, Ctrl+C to cancel</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="cyan">Select destination directory:</Text>
      <Text dimColor>Current: {path}</Text>
      <Box marginTop={1}>
        <SelectInput items={items} onSelect={handleSelect} />
      </Box>
    </Box>
  );
}

// Image file picker component for restore
function ImagePicker({ currentPath, onSelect }) {
  const [path, setPath] = useState(currentPath);
  const [items, setItems] = useState([]);

  useEffect(() => {
    try {
      const entries = readdirSync(path, { withFileTypes: true });

      // Get directories
      const dirs = entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map((e, idx) => ({
          key: `dir-${idx}-${e.name}`,
          label: `📁 ${e.name}/`,
          value: join(path, e.name),
          isDir: true,
        }));

      // Get image files (.img, .img.gz, .iso)
      const images = entries
        .filter(e => e.isFile() && /\.(img|img\.gz|iso|dmg)$/i.test(e.name))
        .map((e, idx) => {
          let size = '';
          try {
            const stats = statSync(join(path, e.name));
            const mb = (stats.size / 1024 / 1024).toFixed(1);
            size = mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
          } catch {}
          return {
            key: `img-${idx}-${e.name}`,
            label: `💾 ${e.name} ${size ? `(${size})` : ''}`,
            value: join(path, e.name),
            isFile: true,
          };
        });

      const parentDir = dirname(path);
      const navItems = path !== '/' ? [{ key: 'parent-dir', label: '📁 ../', value: parentDir, isDir: true }] : [];

      setItems([
        ...navItems,
        ...dirs.sort((a, b) => a.label.localeCompare(b.label)),
        ...images.sort((a, b) => a.label.localeCompare(b.label)),
      ]);

      if (dirs.length === 0 && images.length === 0 && path !== '/') {
        setItems([
          { key: 'parent-dir', label: '📁 ../', value: parentDir, isDir: true },
          { key: 'no-images', label: '(No image files found)', value: '', isDir: false },
        ]);
      }
    } catch (error) {
      setItems([
        { key: 'error-parent', label: '📁 ../', value: dirname(path), isDir: true },
        { key: 'error-msg', label: `Error: ${error.message}`, value: path, isDir: false },
      ]);
    }
  }, [path]);

  const handleSelect = (item) => {
    if (item.isFile) {
      onSelect(item.value);
    } else if (item.isDir) {
      setPath(item.value);
    }
  };

  return (
    <Box flexDirection="column">
      <Text color="cyan">Select image file to restore:</Text>
      <Text dimColor>Current: {path}</Text>
      <Box marginTop={1}>
        <SelectInput items={items} onSelect={handleSelect} />
      </Box>
    </Box>
  );
}

// Progress bar component
function ProgressBar({ progress, width = 40 }) {
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  return (
    <Text>
      <Text color="green">{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
      <Text> {progress.toFixed(1)}%</Text>
    </Text>
  );
}

// Main App component
function App() {
  const { exit } = useApp();
  const [mode, setMode] = useState(null);  // BACKUP or RESTORE
  const [state, setState] = useState(STATES.MAIN_MENU);
  const [disks, setDisks] = useState([]);
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [progress, setProgress] = useState(0);
  const [bytesWritten, setBytesWritten] = useState('0');
  const [speed, setSpeed] = useState('0');
  const [error, setError] = useState('');
  const [logs, setLogs] = useState([]);
  const [shrinkProgress, setShrinkProgress] = useState('');

  // Load disks on mount
  useEffect(() => {
    const diskList = getDisks();
    if (diskList.length === 0) {
      diskList.push({ key: 'no-disks', label: 'No external disks found', value: '' });
    }
    diskList.push({ key: 'manual-entry', label: '📝 Enter device path manually...', value: 'manual' });
    setDisks(diskList);
  }, []);

  // Handle keyboard input for quitting
  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
    }
  });

  const addLog = (message) => {
    setLogs(prev => [...prev.slice(-5), message]);
  };

  // Validate before backup (check sudo, unmount disk, check source exists)
  const validateAndBackup = () => {
    setState(STATES.VALIDATING);
    addLog('Validating sudo access...');

    // First, validate sudo credentials
    const sudoCheck = spawn('sudo', ['-v'], {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    sudoCheck.on('close', (code) => {
      if (code !== 0) {
        setError('sudo authentication failed. Please run with sudo access.');
        setState(STATES.ERROR);
        return;
      }

      // Unmount the disk before backup (macOS uses diskutil, Linux uses umount)
      // Extract disk name from raw device path (e.g., /dev/rdisk12 -> disk12)
      const diskMatch = source.match(/r?(disk\d+)/);
      if (diskMatch && process.platform === 'darwin') {
        const diskName = diskMatch[1];
        addLog(`Unmounting ${diskName}...`);

        const unmount = spawn('diskutil', ['unmountDisk', diskName], {
          stdio: ['inherit', 'pipe', 'pipe'],
        });

        let unmountError = '';
        unmount.stderr.on('data', (data) => {
          unmountError += data.toString();
        });

        unmount.stdout.on('data', (data) => {
          addLog(data.toString().trim().substring(0, 60));
        });

        unmount.on('close', (code) => {
          if (code !== 0) {
            // Disk might already be unmounted, continue anyway
            addLog(`Unmount warning: ${unmountError.trim() || 'disk may already be unmounted'}`);
          } else {
            addLog('Disk unmounted successfully');
          }
          checkSourceAndBackup();
        });

        unmount.on('error', (err) => {
          addLog(`Unmount skipped: ${err.message}`);
          checkSourceAndBackup();
        });
      } else {
        // Linux or couldn't parse disk name, try umount
        checkSourceAndBackup();
      }
    });

    sudoCheck.on('error', (err) => {
      setError(`sudo failed: ${err.message}`);
      setState(STATES.ERROR);
    });
  };

  // Check source exists and start backup
  const checkSourceAndBackup = () => {
    addLog('Checking source device...');
    const checkSource = spawn('sudo', ['test', '-e', source]);
    checkSource.on('close', (code) => {
      if (code !== 0) {
        setError(`Source device not found: ${source}`);
        setState(STATES.ERROR);
        return;
      }
      runBackup();
    });
    checkSource.on('error', (err) => {
      setError(`Cannot access source: ${err.message}`);
      setState(STATES.ERROR);
    });
  };

  // Run dd backup
  const runBackup = () => {
    setState(STATES.BACKING_UP);
    addLog(`Starting backup from ${source} to ${destination}`);

    let lastError = '';

    const ddArgs = process.platform === 'darwin'
      ? ['if=' + source, 'of=' + destination, 'bs=4m', 'status=progress']
      : ['if=' + source, 'of=' + destination, 'bs=4M', 'status=progress', 'conv=fsync'];

    const dd = spawn('sudo', ['dd', ...ddArgs], {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    // dd outputs progress to stderr
    dd.stderr.on('data', (data) => {
      const output = data.toString();

      // Capture error messages (lines that don't look like progress)
      if (!output.match(/bytes.*copied/) && !output.match(/records (in|out)/)) {
        lastError = output.trim();
      }

      // Parse dd progress output
      // Format: "1234567890 bytes (1.2 GB, 1.1 GiB) copied, 10.5 s, 123 MB/s"
      const bytesMatch = output.match(/(\d+)\s+bytes/);
      const speedMatch = output.match(/([\d.]+)\s*([MGK]?B\/s)/);

      if (bytesMatch) {
        const bytes = parseInt(bytesMatch[1]);
        const mb = (bytes / 1024 / 1024).toFixed(1);
        setBytesWritten(`${mb} MB`);
      }

      if (speedMatch) {
        setSpeed(speedMatch[1] + ' ' + speedMatch[2]);
      }

      addLog(output.trim().substring(0, 60));
    });

    dd.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        addLog(output.substring(0, 60));
      }
    });

    dd.on('close', (code) => {
      if (code === 0) {
        addLog('Backup complete! Starting pishrink...');
        runPishrink();
      } else {
        const errorMsg = lastError || `exit code ${code}`;
        setError(`dd failed: ${errorMsg}`);
        setState(STATES.ERROR);
      }
    });

    dd.on('error', (err) => {
      setError(`Failed to start dd: ${err.message}`);
      setState(STATES.ERROR);
    });
  };

  // Run pishrink
  const runPishrink = () => {
    setState(STATES.SHRINKING);

    // Check if pishrink is available, if not download it
    const pishrinkPath = '/usr/local/bin/pishrink.sh';

    const runShrink = () => {
      addLog('Running pishrink to compress image...');

      const pishrink = spawn('sudo', ['bash', pishrinkPath, '-v', destination], {
        stdio: ['inherit', 'pipe', 'pipe'],
      });

      pishrink.stdout.on('data', (data) => {
        const output = data.toString().trim();
        setShrinkProgress(output.substring(0, 60));
        addLog(output.substring(0, 60));
      });

      pishrink.stderr.on('data', (data) => {
        const output = data.toString().trim();
        setShrinkProgress(output.substring(0, 60));
        addLog(output.substring(0, 60));
      });

      pishrink.on('close', (code) => {
        if (code === 0) {
          addLog('Shrink complete!');
          setState(STATES.COMPLETE);
        } else {
          // pishrink might fail on macOS since it needs Linux tools
          addLog(`pishrink exited with code ${code} - image saved without shrinking`);
          setState(STATES.COMPLETE);
        }
      });

      pishrink.on('error', (err) => {
        addLog(`pishrink not available: ${err.message} - image saved without shrinking`);
        setState(STATES.COMPLETE);
      });
    };

    // Check if pishrink exists
    if (!existsSync(pishrinkPath)) {
      addLog('pishrink not found, downloading...');

      const download = spawn('sudo', ['bash', '-c',
        `curl -fsSL https://raw.githubusercontent.com/Drewsif/PiShrink/master/pishrink.sh -o ${pishrinkPath} && chmod +x ${pishrinkPath}`
      ]);

      download.on('close', (code) => {
        if (code === 0) {
          runShrink();
        } else {
          addLog('Could not download pishrink - image saved without shrinking');
          setState(STATES.COMPLETE);
        }
      });
    } else {
      runShrink();
    }
  };

  // Validate and run restore (image -> SD card)
  const validateAndRestore = () => {
    setState(STATES.VALIDATING);
    addLog('Validating sudo access...');

    const sudoCheck = spawn('sudo', ['-v'], {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    sudoCheck.on('close', (code) => {
      if (code !== 0) {
        setError('sudo authentication failed. Please run with sudo access.');
        setState(STATES.ERROR);
        return;
      }

      // Unmount target disk before restore
      const diskMatch = destination.match(/r?(disk\d+)/);
      if (diskMatch && process.platform === 'darwin') {
        const diskName = diskMatch[1];
        addLog(`Unmounting ${diskName}...`);

        const unmount = spawn('diskutil', ['unmountDisk', diskName], {
          stdio: ['inherit', 'pipe', 'pipe'],
        });

        unmount.on('close', (code) => {
          if (code !== 0) {
            addLog('Unmount warning: disk may already be unmounted');
          } else {
            addLog('Disk unmounted successfully');
          }
          runRestore();
        });

        unmount.on('error', () => {
          runRestore();
        });
      } else {
        runRestore();
      }
    });

    sudoCheck.on('error', (err) => {
      setError(`sudo failed: ${err.message}`);
      setState(STATES.ERROR);
    });
  };

  // Run dd restore (write image to SD card)
  const runRestore = () => {
    setState(STATES.RESTORING);
    addLog(`Restoring ${source} to ${destination}`);

    let lastError = '';

    // Check if source is gzipped
    const isGzipped = source.endsWith('.gz');

    let ddProcess;
    if (isGzipped) {
      // Use gunzip piped to dd for compressed images
      addLog('Decompressing and writing image...');
      ddProcess = spawn('sudo', ['bash', '-c',
        `gunzip -c "${source}" | dd of=${destination} bs=4m status=progress`
      ], {
        stdio: ['inherit', 'pipe', 'pipe'],
      });
    } else {
      const ddArgs = process.platform === 'darwin'
        ? ['if=' + source, 'of=' + destination, 'bs=4m', 'status=progress']
        : ['if=' + source, 'of=' + destination, 'bs=4M', 'status=progress', 'conv=fsync'];

      ddProcess = spawn('sudo', ['dd', ...ddArgs], {
        stdio: ['inherit', 'pipe', 'pipe'],
      });
    }

    ddProcess.stderr.on('data', (data) => {
      const output = data.toString();

      if (!output.match(/bytes.*copied/) && !output.match(/records (in|out)/)) {
        lastError = output.trim();
      }

      const bytesMatch = output.match(/(\d+)\s+bytes/);
      const speedMatch = output.match(/([\d.]+)\s*([MGK]?B\/s)/);

      if (bytesMatch) {
        const bytes = parseInt(bytesMatch[1]);
        const mb = (bytes / 1024 / 1024).toFixed(1);
        setBytesWritten(`${mb} MB`);
      }

      if (speedMatch) {
        setSpeed(speedMatch[1] + ' ' + speedMatch[2]);
      }

      addLog(output.trim().substring(0, 60));
    });

    ddProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) addLog(output.substring(0, 60));
    });

    ddProcess.on('close', (code) => {
      if (code === 0) {
        addLog('Restore complete!');
        setState(STATES.COMPLETE);
      } else {
        const errorMsg = lastError || `exit code ${code}`;
        setError(`Restore failed: ${errorMsg}`);
        setState(STATES.ERROR);
      }
    });

    ddProcess.on('error', (err) => {
      setError(`Failed to start restore: ${err.message}`);
      setState(STATES.ERROR);
    });
  };

  // Manual source input state
  const [manualSource, setManualSource] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  // Render based on current state
  const renderContent = () => {
    switch (state) {
      case STATES.MAIN_MENU:
        return (
          <Box flexDirection="column">
            <Text color="cyan" bold>What would you like to do?</Text>
            <Box marginTop={1}>
              <SelectInput
                items={[
                  { key: 'menu-backup', label: '💾 Backup SD card to image file', value: 'backup' },
                  { key: 'menu-restore', label: '📀 Restore image file to SD card', value: 'restore' },
                  { key: 'menu-exit', label: '❌ Exit', value: 'exit' },
                ]}
                onSelect={(item) => {
                  if (item.value === 'backup') {
                    setMode(MODES.BACKUP);
                    setState(STATES.SELECT_SOURCE);
                  } else if (item.value === 'restore') {
                    setMode(MODES.RESTORE);
                    setState(STATES.SELECT_SOURCE);
                  } else {
                    exit();
                  }
                }}
              />
            </Box>
          </Box>
        );

      case STATES.SELECT_SOURCE:
        // BACKUP: select SD card, RESTORE: select image file
        if (mode === MODES.RESTORE) {
          return (
            <ImagePicker
              currentPath={homedir()}
              onSelect={(path) => {
                setSource(path);
                setState(STATES.SELECT_DEST);
              }}
            />
          );
        }
        // BACKUP mode - select SD card
        if (showManualInput) {
          return (
            <Box flexDirection="column">
              <Text color="cyan">Enter device path (e.g., /dev/rdisk2):</Text>
              <Box>
                <Text color="green">❯ </Text>
                <TextInput
                  value={manualSource}
                  onChange={setManualSource}
                  onSubmit={() => {
                    setSource(manualSource);
                    setState(STATES.SELECT_DEST);
                  }}
                />
              </Box>
            </Box>
          );
        }
        return (
          <Box flexDirection="column">
            <Text color="cyan" bold>Select source SD card:</Text>
            <Text dimColor>Use arrow keys to navigate, Enter to select</Text>
            <Box marginTop={1}>
              <SelectInput
                items={disks}
                onSelect={(item) => {
                  if (item.value === 'manual') {
                    setShowManualInput(true);
                  } else if (item.value) {
                    setSource(item.value);
                    setState(STATES.SELECT_DEST);
                  }
                }}
              />
            </Box>
          </Box>
        );

      case STATES.SELECT_DEST:
        // BACKUP: select directory for image, RESTORE: select SD card
        if (mode === MODES.RESTORE) {
          return (
            <Box flexDirection="column">
              <Text color="cyan" bold>Select target SD card:</Text>
              <Text dimColor>Use arrow keys to navigate, Enter to select</Text>
              <Box marginTop={1}>
                <SelectInput
                  items={disks}
                  onSelect={(item) => {
                    if (item.value === 'manual') {
                      setShowManualInput(true);
                    } else if (item.value) {
                      setDestination(item.value);
                      setState(STATES.CONFIRM);
                    }
                  }}
                />
              </Box>
            </Box>
          );
        }
        // BACKUP mode - select destination directory
        return (
          <FileBrowser
            currentPath={homedir()}
            onSelect={(path) => {
              setDestination(path);
              setState(STATES.CONFIRM);
            }}
          />
        );

      case STATES.CONFIRM:
        const isRestore = mode === MODES.RESTORE;
        return (
          <Box flexDirection="column">
            <Text color={isRestore ? 'red' : 'yellow'} bold>
              {isRestore ? '⚠️  Confirm Restore (THIS WILL OVERWRITE THE SD CARD!)' : '⚠️  Confirm Backup'}
            </Text>
            <Box marginY={1} flexDirection="column">
              <Text>{isRestore ? 'Image:  ' : 'Source:      '}<Text color="cyan">{source}</Text></Text>
              <Text>{isRestore ? 'Target: ' : 'Destination: '}<Text color="cyan">{destination}</Text></Text>
            </Box>
            <Text dimColor>
              {isRestore
                ? 'This will ERASE ALL DATA on the target disk!'
                : 'This will read the entire disk and may take a while.'}
            </Text>
            <Box marginTop={1}>
              <SelectInput
                items={[
                  { key: 'confirm-start', label: isRestore ? '✅ Start Restore' : '✅ Start Backup', value: 'start' },
                  { key: 'confirm-back', label: '🔙 Go Back', value: 'back' },
                  { key: 'confirm-cancel', label: '❌ Cancel', value: 'cancel' },
                ]}
                onSelect={(item) => {
                  switch (item.value) {
                    case 'start':
                      if (isRestore) {
                        validateAndRestore();
                      } else {
                        validateAndBackup();
                      }
                      break;
                    case 'back':
                      setState(STATES.SELECT_SOURCE);
                      break;
                    case 'cancel':
                      exit();
                      break;
                  }
                }}
              />
            </Box>
          </Box>
        );

      case STATES.VALIDATING:
        return (
          <Box flexDirection="column">
            <Box>
              <Text color="green"><Spinner type="dots" /></Text>
              <Text color="cyan" bold> Validating access...</Text>
            </Box>
            <Text dimColor marginTop={1}>Enter sudo password if prompted</Text>
          </Box>
        );

      case STATES.BACKING_UP:
        return (
          <Box flexDirection="column">
            <Box>
              <Text color="green"><Spinner type="dots" /></Text>
              <Text color="cyan" bold> Backing up SD card...</Text>
            </Box>
            <Box marginY={1} flexDirection="column">
              <Text>Written: <Text color="yellow">{bytesWritten}</Text></Text>
              <Text>Speed:   <Text color="yellow">{speed}</Text></Text>
            </Box>
            <Box flexDirection="column" marginTop={1}>
              <Text dimColor>Recent activity:</Text>
              {logs.slice(-3).map((log, i) => (
                <Text key={i} dimColor>  {log}</Text>
              ))}
            </Box>
            <Text dimColor marginTop={1}>Press Ctrl+C to cancel (not recommended)</Text>
          </Box>
        );

      case STATES.RESTORING:
        return (
          <Box flexDirection="column">
            <Box>
              <Text color="green"><Spinner type="dots" /></Text>
              <Text color="cyan" bold> Restoring image to SD card...</Text>
            </Box>
            <Box marginY={1} flexDirection="column">
              <Text>Written: <Text color="yellow">{bytesWritten}</Text></Text>
              <Text>Speed:   <Text color="yellow">{speed}</Text></Text>
            </Box>
            <Box flexDirection="column" marginTop={1}>
              <Text dimColor>Recent activity:</Text>
              {logs.slice(-3).map((log, i) => (
                <Text key={i} dimColor>  {log}</Text>
              ))}
            </Box>
            <Text dimColor marginTop={1}>Press Ctrl+C to cancel (not recommended)</Text>
          </Box>
        );

      case STATES.SHRINKING:
        return (
          <Box flexDirection="column">
            <Box>
              <Text color="green"><Spinner type="dots" /></Text>
              <Text color="cyan" bold> Shrinking image with pishrink...</Text>
            </Box>
            <Text marginY={1}>{shrinkProgress}</Text>
            <Box flexDirection="column">
              <Text dimColor>Recent activity:</Text>
              {logs.slice(-3).map((log, i) => (
                <Text key={i} dimColor>  {log}</Text>
              ))}
            </Box>
          </Box>
        );

      case STATES.COMPLETE:
        return (
          <Box flexDirection="column">
            <Text color="green" bold>✅ {mode === MODES.RESTORE ? 'Restore' : 'Backup'} Complete!</Text>
            <Box marginY={1} flexDirection="column">
              {mode === MODES.RESTORE ? (
                <Text>Image restored to: <Text color="cyan">{destination}</Text></Text>
              ) : (
                <Text>Image saved to: <Text color="cyan">{destination}</Text></Text>
              )}
            </Box>
            <Text dimColor>Press 'q' or Ctrl+C to exit</Text>
          </Box>
        );

      case STATES.ERROR:
        return (
          <Box flexDirection="column">
            <Text color="red" bold>❌ Error</Text>
            <Text color="red">{error}</Text>
            <Box marginTop={1}>
              <SelectInput
                items={[
                  { key: 'error-retry', label: '🔄 Try Again', value: 'retry' },
                  { key: 'error-menu', label: '🏠 Main Menu', value: 'menu' },
                  { key: 'error-exit', label: '❌ Exit', value: 'exit' },
                ]}
                onSelect={(item) => {
                  if (item.value === 'retry') {
                    setError('');
                    setState(STATES.SELECT_SOURCE);
                  } else if (item.value === 'menu') {
                    setError('');
                    setSource('');
                    setDestination('');
                    setMode(null);
                    setState(STATES.MAIN_MENU);
                  } else {
                    exit();
                  }
                }}
              />
            </Box>
          </Box>
        );
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text backgroundColor="blue" color="white" bold> 🥧 Pi Backup Tool </Text>
      </Box>
      {renderContent()}
    </Box>
  );
}

// Run the app
render(<App />);
