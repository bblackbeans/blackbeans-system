from __future__ import annotations

import base64
import hashlib
import hmac
import os

from django.conf import settings

_PREFIX = b"bb-integrations-v1:"


def _key_bytes() -> bytes:
    material = (settings.INTEGRATIONS_FERNET_KEY or settings.SECRET_KEY or "").encode()
    return hashlib.sha256(_PREFIX + material).digest()


def encrypt_secret(plain: str) -> str:
    if not plain:
        return ""
    key = _key_bytes()
    nonce = os.urandom(16)
    data = plain.encode()
    keystream = bytearray()
    counter = 0
    while len(keystream) < len(data):
        block = hmac.new(
            key, nonce + counter.to_bytes(8, "big"), hashlib.sha256,
        ).digest()
        keystream.extend(block)
        counter += 1
    cipher = bytes(a ^ b for a, b in zip(data, keystream[: len(data)], strict=True))
    mac = hmac.new(key, nonce + cipher, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(nonce + mac + cipher).decode()


def decrypt_secret(token: str) -> str:
    if not token:
        return ""
    raw = base64.urlsafe_b64decode(token.encode())
    nonce, mac, cipher = raw[:16], raw[16:48], raw[48:]
    key = _key_bytes()
    expected = hmac.new(key, nonce + cipher, hashlib.sha256).digest()
    if not hmac.compare_digest(mac, expected):
        msg = "Token criptografado invalido."
        raise ValueError(msg)
    keystream = bytearray()
    counter = 0
    while len(keystream) < len(cipher):
        block = hmac.new(
            key, nonce + counter.to_bytes(8, "big"), hashlib.sha256,
        ).digest()
        keystream.extend(block)
        counter += 1
    plain = bytes(a ^ b for a, b in zip(cipher, keystream[: len(cipher)], strict=True))
    return plain.decode()
