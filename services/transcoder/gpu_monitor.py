"""
NVIDIA GPU monitoring using pynvml.
Exposes NVENC usage, temperature, memory, and power draw.
"""
import os
from typing import Optional

try:
    import pynvml
    NVML_AVAILABLE = True
except ImportError:
    NVML_AVAILABLE = False


class GPUMonitor:
    def __init__(self):
        self._initialized = False
        if NVML_AVAILABLE:
            try:
                pynvml.nvmlInit()
                self._initialized = True
            except Exception:
                pass

    def get_gpu_info(self, index: int = 0) -> dict:
        if not self._initialized:
            return self._mock_info(index)
        try:
            handle = pynvml.nvmlDeviceGetHandleByIndex(index)
            name = pynvml.nvmlDeviceGetName(handle)
            if isinstance(name, bytes):
                name = name.decode()
            temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            power = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            encoder_util = pynvml.nvmlDeviceGetEncoderUtilization(handle)
            driver = pynvml.nvmlSystemGetDriverVersion()
            cuda = pynvml.nvmlSystemGetCudaDriverVersion_v2()

            return {
                "gpu_index": index,
                "name": name,
                "temperature_celsius": float(temp),
                "nvenc_usage_percent": float(encoder_util[0]),
                "gpu_util_percent": float(util.gpu),
                "memory_used_mb": round(mem.used / 1_048_576, 1),
                "memory_total_mb": round(mem.total / 1_048_576, 1),
                "memory_free_mb": round(mem.free / 1_048_576, 1),
                "power_draw_watts": round(power, 1),
                "driver_version": driver if isinstance(driver, str) else driver.decode(),
                "cuda_version": str(cuda),
            }
        except Exception as e:
            return {"error": str(e), "gpu_index": index}

    def get_device_count(self) -> int:
        if not self._initialized:
            return 1
        try:
            return pynvml.nvmlDeviceGetCount()
        except Exception:
            return 0

    def get_all_gpus(self) -> list:
        count = self.get_device_count()
        return [self.get_gpu_info(i) for i in range(count)]

    def _mock_info(self, index: int) -> dict:
        return {
            "gpu_index": index,
            "name": "NVIDIA RTX 4500 Ada (mock)",
            "temperature_celsius": 45.0,
            "nvenc_usage_percent": 0.0,
            "gpu_util_percent": 0.0,
            "memory_used_mb": 512.0,
            "memory_total_mb": 24576.0,
            "memory_free_mb": 24064.0,
            "power_draw_watts": 20.0,
            "driver_version": "545.29.06",
            "cuda_version": "12030",
        }

    def __del__(self):
        if NVML_AVAILABLE and self._initialized:
            try:
                pynvml.nvmlShutdown()
            except Exception:
                pass
