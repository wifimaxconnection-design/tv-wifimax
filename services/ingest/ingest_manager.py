"""
Multicast UDP MPEG-TS ingest manager.
Receives multicast streams from MikroTik routers, monitors PCR/packet loss,
and publishes raw TS data to Redis for downstream consumers.
"""
import asyncio
import socket
import struct
import time
import os
from dataclasses import dataclass, field
from typing import Dict, Optional
import redis.asyncio as aioredis
import structlog

logger = structlog.get_logger()

TS_PACKET_SIZE = 188
TS_SYNC_BYTE = 0x47
BUFFER_SIZE = int(os.getenv("INGEST_BUFFER_SIZE", 4_194_304))  # 4 MB
STATS_INTERVAL = int(os.getenv("INGEST_STATS_INTERVAL", 10))


@dataclass
class ChannelStats:
    channel_id: str
    multicast_address: str
    port: int
    interface: str
    status: str = "stopped"
    packets_received: int = 0
    packets_lost: int = 0
    bytes_received: int = 0
    bitrate_mbps: float = 0.0
    last_pcr: Optional[int] = None
    pcr_discontinuity_count: int = 0
    started_at: float = field(default_factory=time.time)
    last_updated: float = field(default_factory=time.time)


class MulticastReceiver:
    """Async UDP multicast socket receiver with PCR monitoring."""

    def __init__(self, channel_id: str, address: str, port: int, interface: str, redis_client):
        self.channel_id = channel_id
        self.address = address
        self.port = port
        self.interface = interface
        self.redis = redis_client
        self.stats = ChannelStats(channel_id, address, port, interface)
        self._stop_event = asyncio.Event()
        self._sock: Optional[socket.socket] = None

    def _create_socket(self) -> socket.socket:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, BUFFER_SIZE)
        sock.bind(("", self.port))

        # Join multicast group
        group = socket.inet_aton(self.address)
        iface_addr = socket.inet_aton(self._get_interface_ip())
        mreq = group + iface_addr
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        sock.setblocking(False)
        return sock

    def _get_interface_ip(self) -> str:
        try:
            import subprocess
            result = subprocess.run(
                ["ip", "-4", "addr", "show", self.interface],
                capture_output=True, text=True, timeout=2
            )
            for line in result.stdout.splitlines():
                if "inet " in line:
                    return line.strip().split()[1].split("/")[0]
        except Exception:
            pass
        return "0.0.0.0"

    def _parse_ts_packets(self, data: bytes) -> list[bytes]:
        packets = []
        offset = 0
        while offset + TS_PACKET_SIZE <= len(data):
            if data[offset] == TS_SYNC_BYTE:
                packets.append(data[offset:offset + TS_PACKET_SIZE])
                offset += TS_PACKET_SIZE
            else:
                offset += 1
        return packets

    def _check_pcr(self, packet: bytes):
        """Extract and validate PCR for continuity monitoring."""
        if len(packet) < 6:
            return
        adaptation_field_control = (packet[3] >> 4) & 0x03
        if adaptation_field_control in (2, 3):
            adaptation_length = packet[4]
            if adaptation_length > 0 and (packet[5] & 0x10):
                pcr_bytes = packet[6:12]
                if len(pcr_bytes) >= 6:
                    pcr_base = (
                        (pcr_bytes[0] << 25)
                        | (pcr_bytes[1] << 17)
                        | (pcr_bytes[2] << 9)
                        | (pcr_bytes[3] << 1)
                        | (pcr_bytes[4] >> 7)
                    )
                    if self.stats.last_pcr is not None:
                        diff = pcr_base - self.stats.last_pcr
                        if diff < 0 or diff > 900_000:  # > 10 sec discontinuity
                            self.stats.pcr_discontinuity_count += 1
                            logger.warning("PCR discontinuity", channel_id=self.channel_id, diff=diff)
                    self.stats.last_pcr = pcr_base

    async def receive_loop(self):
        reconnect_delay = int(os.getenv("INGEST_RECONNECT_DELAY", 5))
        max_attempts = int(os.getenv("INGEST_MAX_RECONNECT_ATTEMPTS", 10))
        attempts = 0

        while not self._stop_event.is_set():
            try:
                self._sock = self._create_socket()
                self.stats.status = "running"
                attempts = 0
                logger.info("Multicast receiver started",
                            channel=self.channel_id, address=self.address, port=self.port)

                loop = asyncio.get_event_loop()
                bytes_since_last = 0
                last_bitrate_ts = time.monotonic()

                while not self._stop_event.is_set():
                    try:
                        data = await asyncio.wait_for(
                            loop.sock_recv(self._sock, 65536), timeout=5.0
                        )
                        packets = self._parse_ts_packets(data)
                        self.stats.packets_received += len(packets)
                        self.stats.bytes_received += len(data)
                        bytes_since_last += len(data)

                        for pkt in packets:
                            self._check_pcr(pkt)

                        # Publish to Redis for transcoder
                        await self.redis.publish(
                            f"ingest:{self.channel_id}",
                            data
                        )

                        now = time.monotonic()
                        elapsed = now - last_bitrate_ts
                        if elapsed >= STATS_INTERVAL:
                            self.stats.bitrate_mbps = round(
                                (bytes_since_last * 8) / (elapsed * 1_000_000), 2
                            )
                            bytes_since_last = 0
                            last_bitrate_ts = now
                            self.stats.last_updated = time.time()
                            logger.info("Ingest stats",
                                        channel=self.channel_id,
                                        bitrate_mbps=self.stats.bitrate_mbps,
                                        packets=self.stats.packets_received)

                    except asyncio.TimeoutError:
                        logger.warning("No data received", channel=self.channel_id)

            except Exception as e:
                self.stats.status = "error"
                logger.error("Ingest error", channel=self.channel_id, error=str(e))
                if self._sock:
                    self._sock.close()
                attempts += 1
                if attempts >= max_attempts:
                    logger.error("Max reconnect attempts reached", channel=self.channel_id)
                    break
                await asyncio.sleep(reconnect_delay)

        self.stats.status = "stopped"
        if self._sock:
            self._sock.close()

    def stop(self):
        self._stop_event.set()


class IngestManager:
    def __init__(self):
        self.redis: Optional[aioredis.Redis] = None
        self.receivers: Dict[str, MulticastReceiver] = {}
        self._tasks: Dict[str, asyncio.Task] = {}

    async def run(self):
        self.redis = await aioredis.from_url(
            os.getenv("REDIS_URL", "redis://redis:6379/2"),
            decode_responses=False,
        )
        logger.info("IngestManager ready")

    async def start_channel(self, channel_id: str, address: str, port: int, interface: str = "eth0"):
        if channel_id in self.receivers:
            await self.stop_channel(channel_id)
        receiver = MulticastReceiver(channel_id, address, port, interface, self.redis)
        self.receivers[channel_id] = receiver
        self._tasks[channel_id] = asyncio.create_task(receiver.receive_loop())
        logger.info("Channel started", channel_id=channel_id)

    async def stop_channel(self, channel_id: str):
        if channel_id in self.receivers:
            self.receivers[channel_id].stop()
            if channel_id in self._tasks:
                self._tasks[channel_id].cancel()
                del self._tasks[channel_id]
            del self.receivers[channel_id]
            logger.info("Channel stopped", channel_id=channel_id)

    def get_stats(self) -> list:
        return [
            {
                "channel_id": r.stats.channel_id,
                "address": r.stats.multicast_address,
                "port": r.stats.port,
                "status": r.stats.status,
                "bitrate_mbps": r.stats.bitrate_mbps,
                "packets_received": r.stats.packets_received,
                "pcr_discontinuities": r.stats.pcr_discontinuity_count,
                "last_updated": r.stats.last_updated,
            }
            for r in self.receivers.values()
        ]
