"""Local Supabase environment plumbing; only allowlisted public keys are exported."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent


def local_environment():
    result = subprocess.run(["pnpm", "exec", "supabase", "status", "-o", "json"], cwd=ROOT, capture_output=True, text=True, check=True)
    status = json.loads(result.stdout)
    url, key = status["API_URL"], status["ANON_KEY"]
    if urlparse(url).hostname not in {"localhost", "127.0.0.1"}:
        raise SystemExit("This command only supports local Supabase.")
    return {
        "SUPABASE_URL": url, "SUPABASE_ANON_KEY": key,
        "NEXT_PUBLIC_SUPABASE_URL": url, "NEXT_PUBLIC_SUPABASE_ANON_KEY": key,
        "NEXT_PUBLIC_API_URL": "http://127.0.0.1:8000",
        "ALLOWED_ORIGINS": "http://localhost:3000,http://127.0.0.1:3000",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["env", "ci-env", "e2e"])
    parser.add_argument("--force", action="store_true", help="Explicitly replace existing local env files")
    args = parser.parse_args()
    env = local_environment()
    if args.command == "env":
        targets = {ROOT / ".env": env, ROOT / "apps/web/.env.local": {key: value for key, value in env.items() if key.startswith("NEXT_PUBLIC_")}}
        existing = [str(path.relative_to(ROOT)) for path in targets if path.exists()]
        if existing and not args.force:
            raise SystemExit(f"Already present: {', '.join(existing)}. Review them or use --force to regenerate.")
        for path, values in targets.items():
            path.write_text("".join(f"{key}={value}\n" for key, value in values.items()))
        print("Created .env and apps/web/.env.local with local public configuration.")
    elif args.command == "ci-env":
        with open(os.environ["GITHUB_ENV"], "a") as output:
            for key, value in env.items():
                output.write(f"{key}={value}\n")
    else:
        env.update({"NEXT_PUBLIC_API_URL": "http://127.0.0.1:8001", "ALLOWED_ORIGINS": "http://127.0.0.1:3100",
                    "ENVIRONMENT": "test", "REDIS_URL": "", "RATE_LIMIT_PER_MINUTE": "10000", "RATE_LIMIT_WRITES_PER_MINUTE": "10000",
                    "E2E_LOCAL_SUPABASE": "1"})
        # Prefer an already installed browser locally. CI falls back to the
        # Playwright-managed Chromium installed by its workflow.
        browser = next((shutil.which(name) for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser") if shutil.which(name)), None)
        if browser:
            env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] = browser
        raise SystemExit(subprocess.call(["pnpm", "--dir", "apps/web", "exec", "playwright", "test"], cwd=ROOT, env={**os.environ, **env}))


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError:
        sys.exit("Supabase local is unavailable. Run pnpm exec supabase start.")
