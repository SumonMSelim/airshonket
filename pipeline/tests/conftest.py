import os
import ssl
import time
import urllib.request

import boto3
import pytest


def _healthy(endpoint, ca_bundle):
    try:
        ctx = ssl.create_default_context(cafile=ca_bundle)
        urllib.request.urlopen(f"{endpoint}/__admin/health", context=ctx, timeout=2)
        return True
    except Exception:
        return False


@pytest.fixture(scope="session", autouse=True)
def emulator_ready():
    """Wait for AWS Emulator, and refuse to run if the SDK would reach real AWS."""
    endpoint = os.environ.get("AWS_ENDPOINT_URL", "")
    assert endpoint.startswith("https://127.0.0.1:"), "AWS_ENDPOINT_URL must point at the emulator"
    deadline = time.time() + 60
    while not _healthy(endpoint, os.environ["AWS_CA_BUNDLE"]):
        assert time.time() < deadline, "AWS Emulator did not become healthy within 60 s"
        time.sleep(0.5)
    assert boto3.client("sts").get_caller_identity()["Account"] == "000000000000"
