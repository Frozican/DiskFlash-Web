# cflash web

An unofficial static HTML/CSS/JavaScript disk-image writer inspired by [Cametendo/cflash-git](https://github.com/Cametendo/cflash-git).

## Features
- Responsive UI for desktop and mobile browsers
- Select or drag-and-drop a disk image
- Connect to the local helper to list physical disks
- Stream an image to a selected disk in chunks without loading the whole image into RAM
- Image size validation, optional SHA-256, progress indicator and explicit destructive confirmation
- Helper blocks identified boot/system disks, read-only disks, mounted Linux disks, and images larger than the target

## Important safety notes
**Flashing permanently overwrites the selected disk.** Check the device identifier, capacity, model, and serial before confirming. Disconnect any disk you do not want to erase. If a write is interrupted, the target may contain a partial image.

GitHub Pages cannot directly access arbitrary physical disks. Actual writing requires the included local helper, which listens only on `127.0.0.1:8765`. It supports Linux and Windows; macOS is not supported yet. Windows raw-disk access normally requires an elevated PowerShell session. On Linux, run with appropriate device permissions and unmount all partitions on the target first.

The helper refuses disks marked as boot/system by the OS, read-only disks, mounted Linux disks, and oversized images. OS device reporting can be imperfect; these checks are not a substitute for checking the target yourself. Only run the helper on a computer you trust. It has no authentication and is intended to run locally only; do not expose its port to your network.

## Use
1. Download `flash_helper.py` from this repository to the computer containing the target disk.
2. Install Python 3 if needed.
3. Open a terminal in that folder. On Windows, open PowerShell as Administrator. On Linux, use permissions that allow access to the target disk.
4. Run `python flash_helper.py` (or `python3 flash_helper.py` on many Linux systems) and keep the terminal open.
5. Open the GitHub Pages site, choose **Connect / refresh disks**, select the image and target disk, inspect the details, tick the warning, and confirm by typing the exact disk identifier.
6. When completed, safely eject the disk before unplugging it.

If the browser cannot connect, check that the helper is still running at `http://127.0.0.1:8765`. The helper only allows the published GitHub Pages origin and localhost development origins.

## Run the UI locally
Serve the folder over localhost (rather than opening the file directly) so browser security rules allow the local helper connection. For example: `python -m http.server 8000`.

## Deploy on GitHub Pages
The site is static. GitHub Actions publishes the repository root.

## License note
This is an independent implementation and does not bundle the original Java application.