# Chipché — Video Clipper

**Created and maintained by [Dhiraj Bhoi](https://github.com/dhirajbhoi-ops).**

Chipché is a locally hosted web app for reading video details from a URL, selecting a time range, and downloading that selected range as an MP4 file. It is designed for long videos where downloading the whole file is impractical.

## Requirements

- yt-dlp
- ffmpeg

Use this only for videos you own or have permission to download.

## Run

If you are using this from Codex, run:

```bat
start-codex-node.bat
```

Or, if Node.js is installed normally:

```bash
npm start
```

Then open:

```text
http://localhost:3030
```

## Windows Install Hints

If `yt-dlp` is not installed:

```powershell
winget install yt-dlp.yt-dlp
```

If `ffmpeg` is not installed:

```powershell
winget install Gyan.FFmpeg
```

Restart your terminal after installing command-line tools so Windows refreshes `PATH`.

Check installs:

```powershell
yt-dlp --version
ffmpeg -version
```

## Workflow

1. Paste the video URL.
2. If it is a YouTube URL, the preview loads immediately.
3. Click **Get Video Details** to fetch the real title and duration.
4. Use the timeline, sliders, quick buttons, or typed times to choose the clip range.
5. If details cannot load, install the required tools or type the video length manually.
6. Pick MP4 quality.
7. Click **Start Clip Download**.
8. Use **Download file** when the job completes.

## Time Examples

- `00:05:00` to `00:25:00`
- `02:00:00` to `04:30:00`
- `10:15:00` to `12:45:00`

The app limits one clip to 4 hours by default in `server.js`.


## Author

**Dhiraj Bhoi** — creator and maintainer of Chipché.

- GitHub: https://github.com/dhirajbhoi-ops

<!-- ## License -->
