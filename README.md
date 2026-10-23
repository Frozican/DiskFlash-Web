# cflash web

An unofficial, static HTML/CSS/JavaScript browser companion inspired by [Cametendo/cflash-git](https://github.com/Cametendo/cflash-git).

## Included
- Responsive dark UI for desktop and mobile
- Select or drag-and-drop an image file
- Image name and size summary
- Configurable block size and `oflag`
- Optional SHA-256 calculation (reads the whole file into memory)
- Explicit data-loss acknowledgement
- Downloadable/copyable flash plan

## Important limitation
This project is **not a real disk flasher**. Standard web pages cannot list and overwrite arbitrary USB mass-storage devices like a Linux process using `dd`. The app intentionally does not claim that a drive has been flashed and does not execute commands on the host.

A real browser-based flasher would require supported device-specific APIs/protocols (and compatible hardware), or a trusted local helper application. WebUSB does not provide universal raw access to ordinary USB flash drives.

## Run locally
Open `index.html` in a modern browser. For SHA-256, use HTTPS or localhost because Web Crypto requires a secure context.

## Deploy on GitHub Pages
Upload `index.html`, `style.css`, `app.js`, and optionally `README.md` to a repository, then enable Pages for the branch/folder containing `index.html`.

## License note
This is an independent web implementation inspired by the workflow of cflash-git; it does not bundle the original Java implementation.
