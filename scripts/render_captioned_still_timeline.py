"""Render a reviewed still timeline with frame-timed ASS and unchanged audio.

Development/media tool only. Requires an existing FFmpeg with libass and libx264.
"""
from pathlib import Path
import argparse
import os
import shutil
import subprocess


def render(concat, subtitles, audio, output, *, fps, frames, ffmpeg=None):
    concat, subtitles, audio, output = map(Path, (concat, subtitles, audio, output))
    for source in (concat, subtitles, audio):
        if not source.is_file():
            raise FileNotFoundError(source)
    if output.exists():
        raise FileExistsError(output)
    if not 1 <= fps <= 120 or frames < 1:
        raise ValueError('Invalid frame rate or frame count')
    executable = ffmpeg or os.environ.get('ZTF_VIDEO_FFMPEG') or shutil.which('ffmpeg')
    if not executable:
        raise RuntimeError('FFmpeg is required for this media authoring tool')
    # A safe relative filter filename avoids Windows drive-colon/filter escaping.
    if any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_. ' for c in subtitles.name):
        raise ValueError('Unsupported subtitle filename')
    command = [
        str(executable), '-nostdin', '-hide_banner', '-v', 'error', '-n',
        '-f', 'concat', '-safe', '0', '-i', str(concat.resolve()),
        '-i', str(audio.resolve()), '-map', '0:v:0', '-map', '1:a:0',
        '-map_metadata', '1', '-map_chapters', '1',
        # Expand the sparse still-image PTS before evaluating subtitle events.
        '-vf', f"fps={fps},ass=filename='{subtitles.name}'",
        '-fps_mode', 'cfr', '-frames:v', str(frames), '-c:v', 'libx264',
        '-preset', 'veryfast', '-crf', '20', '-threads', '2',
        '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart',
        str(output.resolve()),
    ]
    subprocess.run(command, cwd=subtitles.resolve().parent, check=True,
                   capture_output=True, text=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('concat', 'subtitles', 'audio', 'output'):
        parser.add_argument(name, type=Path)
    parser.add_argument('--fps', type=int, default=24)
    parser.add_argument('--frames', type=int, required=True)
    args = parser.parse_args()
    render(args.concat, args.subtitles, args.audio, args.output,
           fps=args.fps, frames=args.frames)
