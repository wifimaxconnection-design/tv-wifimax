"""
FFmpeg NVENC transcoding profiles for IPTV delivery.
All profiles use CUDA hardware decode + NVENC encode (zero-copy).
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class TranscodingProfile:
    name: str
    width: int
    height: int
    video_codec: str       # h264_nvenc or hevc_nvenc
    video_bitrate: str     # e.g. "4M"
    max_bitrate: str       # CBR ceiling
    buf_size: str          # Rate control buffer
    audio_codec: str
    audio_bitrate: str
    fps: int
    preset: str            # NVENC preset p1-p7 (p1=fastest, p7=best quality)
    tune: str              # ll=low-latency, hq=high-quality
    profile: str           # baseline, main, high
    level: str             # e.g. "4.1"
    gop_size: int          # keyframe interval in frames
    bf: int                # B-frames (0 for low latency)


PROFILES: dict[str, TranscodingProfile] = {
    "1080p": TranscodingProfile(
        name="1080p",
        width=1920, height=1080,
        video_codec="h264_nvenc",
        video_bitrate="4000k", max_bitrate="4500k", buf_size="8000k",
        audio_codec="aac", audio_bitrate="192k",
        fps=25, preset="p4", tune="ll",
        profile="high", level="4.1",
        gop_size=50, bf=0,
    ),
    "720p": TranscodingProfile(
        name="720p",
        width=1280, height=720,
        video_codec="h264_nvenc",
        video_bitrate="2500k", max_bitrate="3000k", buf_size="5000k",
        audio_codec="aac", audio_bitrate="128k",
        fps=25, preset="p4", tune="ll",
        profile="main", level="3.2",
        gop_size=50, bf=0,
    ),
    "480p": TranscodingProfile(
        name="480p",
        width=854, height=480,
        video_codec="h264_nvenc",
        video_bitrate="1200k", max_bitrate="1500k", buf_size="2400k",
        audio_codec="aac", audio_bitrate="96k",
        fps=25, preset="p4", tune="ll",
        profile="main", level="3.1",
        gop_size=50, bf=0,
    ),
    "1080p_h265": TranscodingProfile(
        name="1080p_h265",
        width=1920, height=1080,
        video_codec="hevc_nvenc",
        video_bitrate="2500k", max_bitrate="3000k", buf_size="5000k",
        audio_codec="aac", audio_bitrate="192k",
        fps=25, preset="p4", tune="ll",
        profile="main", level="5.0",
        gop_size=50, bf=0,
    ),
    "720p_h265": TranscodingProfile(
        name="720p_h265",
        width=1280, height=720,
        video_codec="hevc_nvenc",
        video_bitrate="1500k", max_bitrate="1800k", buf_size="3000k",
        audio_codec="aac", audio_bitrate="128k",
        fps=25, preset="p4", tune="ll",
        profile="main", level="4.1",
        gop_size=50, bf=0,
    ),
}


def build_ffmpeg_command(
    input_url: str,
    output_path: str,
    profile: TranscodingProfile,
    gpu_index: int = 0,
    output_format: str = "hls",
) -> list[str]:
    """
    Build FFmpeg command for NVENC hardware transcoding.
    Uses zero-copy GPU pipeline: cuvid decode → scale_cuda → nvenc encode.
    """
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "warning",
        # Hardware acceleration
        "-hwaccel", "cuda",
        "-hwaccel_device", str(gpu_index),
        "-hwaccel_output_format", "cuda",
        # Input
        "-i", input_url,
        # Video scaling (GPU)
        "-vf", f"scale_cuda={profile.width}:{profile.height}:interp_algo=lanczos",
        # Video encoder (NVENC)
        "-c:v", profile.video_codec,
        "-preset", profile.preset,
        "-tune", profile.tune,
        "-profile:v", profile.profile,
        "-level", profile.level,
        "-b:v", profile.video_bitrate,
        "-maxrate", profile.max_bitrate,
        "-bufsize", profile.buf_size,
        "-rc", "cbr",
        "-rc-lookahead", "0",
        "-zerolatency", "1",
        "-bf", str(profile.bf),
        "-g", str(profile.gop_size),
        "-keyint_min", str(profile.gop_size),
        "-r", str(profile.fps),
        # Audio encoder
        "-c:a", profile.audio_codec,
        "-b:a", profile.audio_bitrate,
        "-ar", "48000",
        "-ac", "2",
    ]

    if output_format == "hls":
        cmd += [
            "-f", "hls",
            "-hls_time", "2",
            "-hls_list_size", "6",
            "-hls_flags", "delete_segments+append_list",
            "-hls_segment_type", "mpegts",
            "-hls_segment_filename", f"{output_path}/%03d.ts",
            f"{output_path}/index.m3u8",
        ]
    elif output_format == "mpegts":
        cmd += ["-f", "mpegts", output_path]
    elif output_format == "rtsp":
        cmd += ["-f", "rtsp", "-rtsp_transport", "tcp", output_path]

    return cmd
