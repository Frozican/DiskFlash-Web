# cflash web

A browser-based disk-image writer with a small local Python helper. The interface runs as a static website; the helper is required because browsers cannot directly write to physical disks. Inspired by the workflow of [Cametendo/cflash-git](https://github.com/Cametendo/cflash-git), but implemented independently.

> **Destructive tool:** flashing overwrites data on the selected physical disk. A wrong selection can destroy files or make a drive unusable. Read the safety section before using it.

## Features

- Responsive browser interface for selecting an image and a physical disk
- Local helper for listing disks on Windows and Linux
- Streamed image transfer and block-based writing, rather than loading the entire image into helper memory
- Selectable write block size (1, 4, 8, or 16 MiB)
- Live write progress, throughput, and estimated remaining time
- Automatic block-by-block read-back verification using SHA-256 after writing
- Separate write and verification progress
- Confirmation checkbox, exact device-identifier prompt, and final confirmation dialog
- Basic protection against system/boot disks, read-only disks, mounted Linux disks, and images larger than the selected disk

## Requirements and platform support

- **Windows:** Python 3 and PowerShell. Run the helper from an elevated PowerShell window (Run as administrator) so it can access physical disks.
- **Linux:** Python 3 and the `lsblk` command. The helper needs permission to write to the target device; this commonly means running it with `sudo`. Unmount every partition on the target drive first.
- **macOS:** not supported by the helper at this time.
- A modern browser and an internet connection to use the published website, or a local web server if running the UI from a downloaded/cloned copy.

The browser UI itself is static. **GitHub Pages cannot perform raw disk writes on its own**; `flash_helper.py` performs local disk access on the computer where it is running.

## Quick start

### 1. Start the local helper

Download [`flash_helper.py`](./flash_helper.py) onto the computer that has the USB drive or disk you want to write. Install Python 3 if it is not already installed.

**Windows**
1. Open **PowerShell as administrator**.
2. Change to the folder containing the downloaded file, for example:
   ```powershell
   cd "$HOME\Downloads"
   ```
3. Start the helper:
   ```powershell
   py .\flash_helper.py
   ```
   If the `py` command is unavailable but Python is installed, try `python .\flash_helper.py`.

**Linux**
1. Open a terminal in the folder containing the downloaded file.
2. Ensure the target drive's partitions are unmounted.
3. Start the helper with permission to access physical disks:
   ```bash
   sudo python3 flash_helper.py
   ```

Keep this terminal open while using the website. The helper should print that it is listening on `http://127.0.0.1:8765`. It listens on the local loopback interface only; do not change it to listen on a network interface or expose the port.

### 2. Open the website and connect

Open the [cflash web site](https://frozican.github.io/justtestingthings/) in the same computer where the helper is running.

1. Click **Connect / refresh disks**.
2. Confirm that the helper connects and that the disk list appears.
3. Select the image file you intend to write.
4. Select the **physical target disk**. Check its model/name, capacity, serial number (when available), and device identifier carefully.
5. Select a block size if needed. The default is 4 MiB; this setting changes the transfer/write chunk size, not the image contents.
6. Optionally calculate a source SHA-256 checksum. This optional browser-side action reads the entire selected file into memory, so avoid it for very large images or on memory-limited devices. It is not required for flashing: the helper automatically calculates a hash while writing and compares it with a hash of the data read back from the disk.
7. Tick the data-loss confirmation.
8. Click the flash button. In the prompt, type the **exact device identifier** shown by the helper, then review the final confirmation.
9. Wait for both writing and verification to finish. Do not unplug the drive, close the browser, or stop the helper while the operation is running.
10. Only treat the operation as successful if the page reports that read-back SHA-256 verification passed. Safely eject the drive before unplugging it.

## How verification works

The helper streams the selected file to the target in blocks while calculating a SHA-256 digest of the incoming bytes. After writing, it flushes the file and calls `fsync`, seeks back to the start of the target, reads the written bytes in blocks, and calculates another SHA-256 digest. The digests are compared. If the read-back ends early or the hashes differ, the operation is reported as failed.

The verification covers the number of bytes in the selected file; it does not check unused space beyond the image length, validate the image's format, or guarantee that the image will boot on the target hardware.

## Safety notes

- **The selected target is overwritten.** Existing files and partitions on it may be destroyed. Always keep a separate backup of anything important.
- Confirm the physical disk by its **identifier, model, and capacity**, not just by its drive letter or a familiar name. Disconnect other external drives you do not want to risk.
- Do not select your computer's internal/system disk. The helper blocks disks the operating system identifies as boot/system disks, but detection is not infallible.
- On Linux, unmount all partitions on the target drive before flashing. The helper refuses targets with mounted Linux partitions.
- Windows system/boot and read-only flags are checked, but the helper does not currently enumerate Windows mounted partitions as comprehensively as it does on Linux. Verify the target yourself.
- If the operation is interrupted or an error occurs after writing starts, the target may contain a **partially written image**. Do not assume it is usable.
- Never run a disk-writing tool from a source you do not trust. The helper has no authentication and is intended for local use only.
- The tool and its protections have not been tested against every disk, controller, operating-system configuration, or failure mode. Use a spare drive and proceed carefully.

## Run the website locally

The UI should be served over HTTP on localhost rather than opened directly as a `file://` URL.

1. Clone or download this repository.
2. Start the helper as described above.
3. In a separate terminal, change to the repository folder and run:
   ```bash
   python -m http.server 8000
   ```
4. Open [http://localhost:8000](http://localhost:8000).

The helper allows the published GitHub Pages origin and the local origins `http://localhost:8000` and `http://127.0.0.1:8000`.

## Troubleshooting

### The website cannot connect to the helper
- Make sure `flash_helper.py` is still running in the terminal.
- Check that it reports `http://127.0.0.1:8765`.
- Use the website and helper on the same computer. The helper is not a remote server.
- Refresh the disk list. If needed, restart the helper and reload the website.
- Check whether local security software is blocking Python's local HTTP listener.

### No disks appear, or disk listing fails
- **Windows:** use an elevated PowerShell window and confirm PowerShell's `Get-Disk` command works.
- **Linux:** confirm `lsblk` is installed and that the system can see the drive.
- Reconnect the drive, restart the helper, and click **Connect / refresh disks** again.

### The target is blocked
- A system/boot disk, read-only disk, mounted Linux disk, or disk smaller than the image is intentionally blocked.
- On Linux, unmount all partitions belonging to the target disk, then refresh the list.
- Do not try to bypass a protection unless you have positively identified the device and understand the consequences.

### The write or verification fails
- If writing started, assume the target may be partially overwritten.
- Check the helper's terminal output and the error shown on the page.
- Try another USB port/cable or a different spare drive if hardware problems are suspected.
- Do not report the drive as successfully flashed unless read-back verification passes.

### The optional source checksum fails
- The browser's optional source-checksum button reads the complete image into memory and may fail for large files. This is separate from the helper's automatic blockwise verification after writing.

## Project layout

- `index.html` — user interface
- `style.css` — visual styles
- `app.js` — browser logic, local-helper communication, and progress display
- `flash_helper.py` — local disk discovery, raw writing, progress reporting, and read-back verification

## Deployment

The website is static and can be hosted on GitHub Pages. The local helper must still be downloaded and started separately on the user's computer; GitHub Pages does not host or run it.

## Credits and independence

This project was inspired by the general disk-flashing workflow of [Cametendo/cflash-git](https://github.com/Cametendo/cflash-git). It is an independent implementation and does not bundle the original Java application.

## License

See the repository's license file, if present.
