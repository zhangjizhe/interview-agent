#!/usr/bin/env python3
"""Upload three frontend trees to Tencent COS. Secrets from env only; never printed."""
from __future__ import annotations

import argparse
import mimetypes
import os
import sys
from pathlib import Path

secret_id = os.environ.get("COS_SECRET_ID") or os.environ.get("TENCENTCLOUD_SECRETID")
secret_key = os.environ.get("COS_SECRET_KEY") or os.environ.get("TENCENTCLOUD_SECRETKEY")
if not secret_id or not secret_key:
    print("Missing COS_SECRET_ID / COS_SECRET_KEY in environment.", file=sys.stderr)
    sys.exit(2)

# Drop from env after reading so child processes and crash dumps are less likely to inherit
os.environ.pop("COS_SECRET_ID", None)
os.environ.pop("COS_SECRET_KEY", None)
os.environ.pop("TENCENTCLOUD_SECRETID", None)
os.environ.pop("TENCENTCLOUD_SECRETKEY", None)

from qcloud_cos import CosConfig, CosS3Client
from qcloud_cos.cos_exception import CosClientError, CosServiceError

REGION = os.environ.get("COS_REGION", "ap-hongkong")
BUCKETS = {
    "site": os.environ.get("COS_BUCKET_SITE", "zhezone-site-1258856416"),
    "interview": os.environ.get("COS_BUCKET_INTERVIEW", "zhezone-interview-1258856416"),
    "lab": os.environ.get("COS_BUCKET_LAB", "zhezone-lab-1258856416"),
}

EXTRA_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".map": "application/json",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ico": "image/x-icon",
    ".webmanifest": "application/manifest+json",
}


def content_type(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in EXTRA_TYPES:
        return EXTRA_TYPES[ext]
    guessed, _ = mimetypes.guess_type(str(path))
    return guessed or "application/octet-stream"


def cache_control(path: Path) -> str:
    if path.name == "index.html" or path.suffix.lower() in {".html", ".json"}:
        return "public, max-age=60"
    if path.suffix.lower() in {".js", ".css", ".svg", ".woff", ".woff2", ".png", ".jpg", ".webp"}:
        return "public, max-age=31536000, immutable"
    return "public, max-age=3600"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Upload static site, interview, and lab trees to Tencent COS")
    parser.add_argument(
        "--root",
        default=os.environ.get("COS_UPLOAD_ROOT", ""),
        help="Directory that contains site/, interview/, and lab/ subfolders",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.root:
        print("Pass --root or set COS_UPLOAD_ROOT to the directory with site/, interview/, and lab/.", file=sys.stderr)
        return 2
    root = Path(args.root).expanduser().resolve()
    if not root.is_dir():
        print(f"Upload root is not a directory: {root}", file=sys.stderr)
        return 2

    config = CosConfig(Region=REGION, SecretId=secret_id, SecretKey=secret_key, Scheme="https")
    client = CosS3Client(config)

    for folder, bucket in BUCKETS.items():
        src = root / folder
        if not src.is_dir():
            print(f"Missing source folder: {src}", file=sys.stderr)
            return 2
        files = sorted(p for p in src.rglob("*") if p.is_file())
        if not files:
            print(f"No files under {src}", file=sys.stderr)
            return 2
        print(f"== {folder} -> {bucket} ({len(files)} files)")
        try:
            loc = client.get_bucket_location(Bucket=bucket)
            print(f"   location: {loc}")
        except (CosClientError, CosServiceError) as e:
            print(f"   ERROR listing bucket: {type(e).__name__}: {e}")
            return 1

        for path in files:
            key = path.relative_to(src).as_posix()
            typ = content_type(path)
            cache = cache_control(path)
            try:
                resp = client.upload_file(
                    Bucket=bucket,
                    LocalFilePath=str(path),
                    Key=key,
                    ContentType=typ,
                    CacheControl=cache,
                    EnableMD5=True,
                )
                etag = resp.get("ETag") if isinstance(resp, dict) else None
                print(f"   uploaded {key} ({path.stat().st_size} bytes, {typ}) etag={etag}")
            except (CosClientError, CosServiceError) as e:
                print(f"   ERROR uploading {key}: {type(e).__name__}: {e}")
                return 1

        try:
            client.put_bucket_website(
                Bucket=bucket,
                WebsiteConfiguration={
                    "IndexDocument": {"Suffix": "index.html"},
                    "ErrorDocument": {"Key": "index.html"},
                },
            )
            print("   static website configured")
        except (CosClientError, CosServiceError) as e:
            print(f"   website config skipped: {type(e).__name__}: {e}")

        try:
            head = client.head_object(Bucket=bucket, Key="index.html")
            print(f"   verified index.html Content-Length={head.get('Content-Length')} type={head.get('Content-Type')}")
        except (CosClientError, CosServiceError) as e:
            print(f"   ERROR verifying index.html: {type(e).__name__}: {e}")
            return 1

        try:
            listing = client.list_objects(Bucket=bucket, MaxKeys=100)
            contents = listing.get("Contents") or []
            if isinstance(contents, dict):
                contents = [contents]
            print(f"   objects now: {len(contents)}")
            for obj in contents:
                print(f"     {obj.get('Key')} {obj.get('Size')}")
        except (CosClientError, CosServiceError) as e:
            print(f"   list skipped: {type(e).__name__}: {e}")

        website = f"{bucket}.cos-website.{REGION}.myqcloud.com"
        rest = f"{bucket}.cos.{REGION}.myqcloud.com"
        print(f"   rest endpoint: https://{rest}/index.html")
        print(f"   website endpoint: http://{website}/")

    print("ALL_UPLOADS_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
