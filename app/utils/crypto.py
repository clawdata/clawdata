"""Fernet-based secret encryption/decryption."""

from cryptography.fernet import Fernet

from app.config import settings


def _get_fernet() -> Fernet:
    key = settings.secret_key.encode()
    # Fernet key must be 32-byte base64-encoded. If the user hasn't set a real
    # key, generate a deterministic one from the raw value (dev convenience).
    try:
        return Fernet(key)
    except Exception:
        import base64
        import hashlib

        derived = base64.urlsafe_b64encode(hashlib.sha256(key).digest())
        return Fernet(derived)


def encrypt(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _get_fernet().decrypt(ciphertext.encode()).decode()
