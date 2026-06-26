"""test_auth.py · /api/auth/login JWT 登录"""


def test_login_returns_valid_jwt(client):
    """/api/auth/login 200 + JWT accessToken"""
    resp = client.post("/api/auth/login", json={
        "email": "user@example.com",
        "password": "any-password",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "accessToken" in data
    assert data["tokenType"] == "Bearer"
    assert data["expiresIn"] == "7d"


def test_login_default_email(client):
    """不传 email 用默认值"""
    resp = client.post("/api/auth/login", json={})
    assert resp.status_code == 200
    assert "accessToken" in resp.json()


def test_login_jwt_decodable(client):
    """JWT payload 可解码，包含 email + exp"""
    from jose import jwt
    from app.config import settings

    resp = client.post("/api/auth/login", json={"email": "test@example.com"})
    token = resp.json()["accessToken"]

    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    assert payload["email"] == "test@example.com"
    assert "exp" in payload
    assert "iat" in payload