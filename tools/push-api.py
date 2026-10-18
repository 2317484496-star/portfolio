#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
push-api.py —— 只走 api.github.com 的仓库同步通道

用途：本机 github.com:443 被代理拦死（CONNECT tunnel 502），git push 不可用，
但 api.github.com 通。这个脚本用 Git Data API 直接推文件，不依赖本地 git 历史：

  拉远端 main 的 tree → 逐文件算 git blob 哈希比对 → 只上传真正变了的文件
  → 建 tree → 建 commit → 前移 main

幂等：内容一致时直接退出，不会产生空提交。

用法：
  python tools/push-api.py --token <PAT> "提交说明"
  python tools/push-api.py --token <PAT> --dry-run          # 只看差异，不写入
  set GITHUB_TOKEN=xxx && python tools/push-api.py "说明"   # 也可用环境变量
  echo <PAT> > %USERPROFILE%\.workbuddy\github_token.txt     # 或存成文件，之后可省略 --token

Token 需要 fine-grained PAT：Contents = Read and write
（若还要开 Pages，加 Pages = Read and write）
"""

import argparse
import base64
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.github.com"
DEFAULT_REPO = "2317484496-star/portfolio"
BRANCH = "main"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN_FILE = os.path.join(os.path.expanduser("~"), ".workbuddy", "github_token.txt")

SKIP_DIRS = {".git", "node_modules", ".tools", "__pycache__", ".idea", ".vscode"}
SKIP_FILES = {"Thumbs.db", ".DS_Store"}
TEXT_EXT = {
    ".html", ".htm", ".css", ".js", ".mjs", ".json", ".md", ".txt", ".svg",
    ".webmanifest", ".yml", ".yaml", ".gitignore", ".gitattributes",
}


def log(msg):
    print(msg, flush=True)


def api(method, path, token=None, payload=None):
    url = path if path.startswith("http") else API + path
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "portfolio-push-api")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            body = r.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:600]
        raise SystemExit("GitHub API %s %s 失败：%s %s" % (method, path, e.code, detail))


def blob_sha(path):
    """按 git 的规则算 blob 哈希：sha1('blob <len>\\0' + content)"""
    with open(path, "rb") as f:
        raw = f.read()
    ext = os.path.splitext(path)[1].lower()
    if ext in TEXT_EXT and b"\r\n" in raw:
        raw = raw.replace(b"\r\n", b"\n")  # 仓库一律存 LF
    head = ("blob %d\0" % len(raw)).encode("utf-8")
    return hashlib.sha1(head + raw).hexdigest(), raw


def walk_local():
    out = {}
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if name in SKIP_FILES or name.endswith((".pyc", ".log")):
                continue
            full = os.path.join(base, name)
            rel = os.path.relpath(full, ROOT).replace("\\", "/")
            out[rel] = full
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("message", nargs="?", default="sync via push-api")
    ap.add_argument("--token", default=os.environ.get("GITHUB_TOKEN", ""))
    ap.add_argument("--repo", default=DEFAULT_REPO)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    owner, repo = args.repo.split("/", 1)
    token = (args.token or "").strip()
    if not token and os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "r", encoding="utf-8") as f:
            token = f.read().strip()
    if not token and not args.dry_run:
        raise SystemExit("缺少 token：用 --token 传入，或设置环境变量 GITHUB_TOKEN，"
                         "或把 token 写进 %s（可先 --dry-run 看差异）" % TOKEN_FILE)

    log("仓库：%s    目录：%s" % (args.repo, ROOT))

    ref = api("GET", "/repos/%s/%s/git/ref/heads/%s" % (owner, repo, BRANCH), token)
    head_sha = ref["object"]["sha"]
    commit = api("GET", "/repos/%s/%s/git/commits/%s" % (owner, repo, head_sha), token)
    base_tree = commit["tree"]["sha"]
    tree = api("GET", "/repos/%s/%s/git/trees/%s?recursive=1" % (owner, repo, base_tree), token)
    remote = {n["path"]: n["sha"] for n in tree.get("tree", []) if n["type"] == "blob"}
    log("远端 main：%s（%d 个文件）" % (head_sha[:8], len(remote)))

    local = walk_local()
    log("本地：%d 个文件" % len(local))

    changed, same = [], 0
    for rel, full in sorted(local.items()):
        sha, _ = blob_sha(full)
        if remote.get(rel) == sha:
            same += 1
        else:
            changed.append((rel, full))
    deleted = sorted(set(remote) - set(local))

    log("未变 %d ｜ 变更 %d ｜ 远端多出 %d" % (same, len(changed), len(deleted)))
    for rel, _ in changed:
        log(("  %s %s") % ("改" if rel in remote else "增", rel))
    for rel in deleted:
        log("  删 " + rel)

    if not changed and not deleted:
        log("已经和远端一致，无需提交。")
        return
    if args.dry_run:
        log("（dry-run，未写入）")
        return

    entries = []
    for rel, full in changed:
        sha, raw = blob_sha(full)
        if len(raw) > 45 * 1024 * 1024:
            log("跳过超大文件（>45MB）：" + rel)
            continue
        b = api("POST", "/repos/%s/%s/git/blobs" % (owner, repo), token,
                {"content": base64.b64encode(raw).decode("ascii"), "encoding": "base64"})
        entries.append({"path": rel, "mode": "100755" if os.access(full, os.X_OK) and rel.endswith(".sh") else "100644",
                        "type": "blob", "sha": b["sha"]})
        log("  上传 blob " + rel)
    for rel in deleted:
        entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": None})

    if not entries:
        log("没有可提交的内容。")
        return

    new_tree = api("POST", "/repos/%s/%s/git/trees" % (owner, repo), token,
                   {"base_tree": base_tree, "tree": entries})
    new_commit = api("POST", "/repos/%s/%s/git/commits" % (owner, repo), token,
                     {"message": args.message, "tree": new_tree["sha"], "parents": [head_sha]})
    api("PATCH", "/repos/%s/%s/git/refs/heads/%s" % (owner, repo, BRANCH), token,
        {"sha": new_commit["sha"], "force": False})
    log("已推送：%s → %s" % (head_sha[:8], new_commit["sha"][:8]))
    log("https://github.com/%s/%s/commit/%s" % (owner, repo, new_commit["sha"]))


if __name__ == "__main__":
    sys.exit(main())
