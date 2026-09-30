#!/home/waytech/virtual_envs/webscraper/bin/python

"""
webfetch.py - fetch a URL and print readable text.

Usage:
    webfetch.py <url> [--timeout SECONDS] [--ua USER_AGENT]
"""

import sys
import argparse

import requests
import trafilatura


def main():
    parser = argparse.ArgumentParser(
        description="Fetch a URL and print its readable text content."
    )
    parser.add_argument("url", help="the URL to fetch")
    parser.add_argument(
        "--timeout",
        type=int,
        default=15,
        help="seconds to wait before giving up (default: 15)",
    )
    parser.add_argument(
        "--ua",
        default="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        help="User-Agent header to send (default: a normal browser UA)",
    )
    args = parser.parse_args()

    try:
        response = requests.get(
            args.url,
            timeout=args.timeout,
            headers={"User-Agent": args.ua},
        )
    except requests.exceptions.RequestException as e:
        print(f"error: failed to fetch {args.url}: {e}", file=sys.stderr)
        sys.exit(1)

    if response.status_code != 200:
        print(
            f"error: server returned HTTP {response.status_code} for {args.url}",
            file=sys.stderr,
        )
        sys.exit(1)

    text = trafilatura.extract(response.text)

    if not text:
        print(
            f"error: no readable text found at {args.url} "
            "(page may be JavaScript-rendered or empty)",
            file=sys.stderr,
        )
        sys.exit(1)

    print(text)


if __name__ == "__main__":
    main()
