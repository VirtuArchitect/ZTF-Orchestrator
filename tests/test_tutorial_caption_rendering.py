"""Exercise actual subtitle changes inside one long still-image interval."""
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess

import pytest


def test_caption_changes_between_still_image_events(tmp_path):
    ffmpeg = os.environ.get('ZTF_VIDEO_FFMPEG') or shutil.which('ffmpeg')
    if not ffmpeg:
        pytest.skip('Media authoring test requires FFmpeg with libass')
    root = Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location(
        'caption_renderer', root / 'scripts/render_captioned_still_timeline.py')
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    def run(*args):
        return subprocess.run([ffmpeg, '-nostdin', '-v', 'error', *map(str, args)],
                              check=True, capture_output=True).stdout
    still = tmp_path / 'still.png'
    run('-f', 'lavfi', '-i', 'color=c=black:s=640x360', '-frames:v', '1', still)
    audio = tmp_path / 'audio.m4a'
    run('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '8', '-c:a', 'aac', audio)
    concat = tmp_path / 'still.ffconcat'
    concat.write_text(f"ffconcat version 1.0\nfile '{still.as_posix()}'\n"
                      f"duration 8\nfile '{still.as_posix()}'\n", encoding='utf-8')
    subtitles = tmp_path / 'captions.ass'
    subtitles.write_text('''[Script Info]
ScriptType: v4.00+
PlayResX: 640
PlayResY: 360
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BorderStyle, Outline, Alignment, MarginL, MarginR, MarginV
Style: Default,Arial,42,&H00FFFFFF,&H00000000,1,1,2,20,20,25
[Events]
Format: Layer, Start, End, Style, Text
Dialogue: 0,0:00:01.00,0:00:02.50,Default,FIRST CAPTION
Dialogue: 0,0:00:05.00,0:00:06.50,Default,SECOND CAPTION
''', encoding='utf-8')
    output = tmp_path / 'captioned.mp4'
    renderer.render(concat, subtitles, audio, output, fps=24, frames=192, ffmpeg=ffmpeg)
    def frame(time):
        return run('-ss', time, '-i', output, '-vf', 'crop=640:110:0:240,format=gray',
                   '-frames:v', '1', '-f', 'rawvideo', '-')
    first, second, gap = frame('1.5'), frame('5.5'), frame('3.5')
    assert sum(value > 180 for value in first) > 500
    assert sum(value > 180 for value in second) > 500
    assert sum(value > 180 for value in gap) < 20
    assert first != second, 'The second caption must replace the first between visual events'
    assert run('-i', audio, '-map', '0:a:0', '-c', 'copy', '-f', 'adts', '-') == run(
        '-i', output, '-map', '0:a:0', '-c', 'copy', '-f', 'adts', '-')
    with pytest.raises(FileExistsError):
        renderer.render(concat, subtitles, audio, output, fps=24, frames=192, ffmpeg=ffmpeg)
    with pytest.raises(ValueError):
        renderer.render(concat, subtitles, audio, tmp_path / 'invalid.mp4',
                        fps=0, frames=192, ffmpeg=ffmpeg)
