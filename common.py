"""Shared Firebase settings, authenticated REST helpers, and ML feature code."""
import os
import time
import requests
import numpy as np

# Existing Realtime Database URL from the original project.
DB_URL = os.getenv(
    "FIREBASE_DATABASE_URL",
    "https://water-leak-detection-5228d-default-rtdb.asia-southeast1.firebasedatabase.app",
).rstrip("/")
FEATURES = ["inlet_flow", "outlet_flow", "pressure", "flow_diff", "flow_ratio"]

# Optional authentication for Python scripts. Set these environment variables when
# database rules require authentication. Do not commit real credentials to source control.
FIREBASE_API_KEY = os.getenv("FIREBASE_API_KEY", "").strip()
FIREBASE_EMAIL = os.getenv("FIREBASE_EMAIL", "").strip()
FIREBASE_PASSWORD = os.getenv("FIREBASE_PASSWORD", "")
_token = None
_refresh_token = None
_token_expiry = 0


def _login():
    global _token, _refresh_token, _token_expiry
    if not (FIREBASE_API_KEY and FIREBASE_EMAIL and FIREBASE_PASSWORD):
        return None
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
    resp = requests.post(url, json={"email": FIREBASE_EMAIL, "password": FIREBASE_PASSWORD, "returnSecureToken": True}, timeout=15)
    resp.raise_for_status()
    payload = resp.json()
    _token = payload["idToken"]
    _refresh_token = payload.get("refreshToken")
    _token_expiry = time.time() + int(payload.get("expiresIn", "3600")) - 60
    return _token


def _get_token():
    global _token, _refresh_token, _token_expiry
    if not (FIREBASE_API_KEY and FIREBASE_EMAIL and FIREBASE_PASSWORD):
        return None  # supports existing open/test-mode database rules
    if _token and time.time() < _token_expiry:
        return _token
    if _refresh_token:
        url = f"https://securetoken.googleapis.com/v1/token?key={FIREBASE_API_KEY}"
        resp = requests.post(url, data={"grant_type": "refresh_token", "refresh_token": _refresh_token}, timeout=15)
        if resp.ok:
            payload = resp.json()
            _token = payload.get("id_token")
            _refresh_token = payload.get("refresh_token", _refresh_token)
            _token_expiry = time.time() + int(payload.get("expires_in", "3600")) - 60
            return _token
    return _login()


def _url(path):
    path = path.strip("/")
    url = f"{DB_URL}/{path}.json"
    token = _get_token()
    if token:
        url += ("&" if "?" in url else "?") + "auth=" + token
    return url


def db_get(path, timeout=15):
    response = requests.get(_url(path), timeout=timeout)
    response.raise_for_status()
    return response.json()


def db_put(path, value, timeout=15):
    response = requests.put(_url(path), json=value, timeout=timeout)
    response.raise_for_status()
    return response.json() if response.content else None


def db_post(path, value, timeout=15):
    response = requests.post(_url(path), json=value, timeout=timeout)
    response.raise_for_status()
    return response.json() if response.content else None


def make_features(df):
    """Add the derived columns the model uses. Works on a DataFrame."""
    df = df.copy()
    df["flow_diff"] = df["inlet_flow"] - df["outlet_flow"]
    df["flow_ratio"] = df["flow_diff"] / np.maximum(df["inlet_flow"], 0.5)
    return df
