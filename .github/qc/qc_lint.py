#!/usr/bin/env python3
"""qc_lint.py - DRAFT deterministic QC lint (2026-10-21). Free to run; no network, no secrets.

Usage:
  python3 qc_lint.py --config qc-lint.config.yml --packs common,njere --diff origin/main   # PR mode: added lines only
  python3 qc_lint.py --config qc-lint.config.yml --packs common,affiliate posts/x.post.md     # file mode
Outputs a Markdown summary (stdout) and, with --json PATH, a machine-readable verdict for the log sync.
Verdict: BLOCK if any BLOCK hit; FIX if any FIX hit; else PASS. FLAG hits add "judgement needed".
"""
import argparse, fnmatch, hashlib, json, os, re, subprocess, sys
import yaml

AFF_LAST = "#ad · We or our related company Njere L.L.C. may earn a commission"
VOICES = {"njere": "tJvgmaVM5tDwPVrtn8TA", "michaelt": "6UyZtQtUA012b3SZDNTx", "affiliate": "6UyZtQtUA012b3SZDNTx"}

def globmatch(path, globs):
    return any(fnmatch.fnmatch(path, g) or fnmatch.fnmatch(path, g.replace("**/", "")) for g in globs)

def added_lines(base):
    out = subprocess.run(["git", "diff", "--unified=0", "--no-color", f"{base}...HEAD"], capture_output=True, text=True, check=True).stdout
    files, cur, ln = {}, None, 0
    for line in out.splitlines():
        if line.startswith("+++ "):
            cur = line[6:] if line.startswith("+++ b/") else None
            if cur: files.setdefault(cur, [])
        elif line.startswith("@@") and cur:
            ln = int(re.search(r"\+(\d+)", line).group(1))
        elif cur and line.startswith("+") and not line.startswith("+++"):
            files[cur].append((ln, line[1:])); ln += 1
    return files

def front_matter(text):
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m: return {}, text
    try: return yaml.safe_load(m.group(1)) or {}, m.group(2)
    except yaml.YAMLError: return {"_fm_error": True}, m.group(2)

def compile_rules(cfg, packs, root):
    rules = []
    for p in packs:
        for r in cfg["packs"].get(p, []):
            r = dict(r, pack=p)
            if "list_file" in r:
                lf = os.path.join(root, r["list_file"])
                if not os.path.exists(lf): continue
                terms = [t.strip() for t in open(lf, encoding="utf-8") if t.strip() and not t.startswith("#")]
                r["rx"] = re.compile(r"(?i)\b(" + "|".join(re.escape(t) for t in terms) + r")\b")
            else:
                r["rx"] = re.compile(r["re"])
            r["allow_rx"] = re.compile(r["allow"]) if r.get("allow") else None
            rules.append(r)
    return rules

def scan(path, lines, rules, cfg):
    hits = []
    content_file = globmatch(path, cfg["content_globs"]) and not globmatch(path, cfg["exclude_globs"])
    for r in rules:
        if not r.get("all_files") and not content_file: continue
        if r.get("scope") and not globmatch(path, r["scope"]): continue
        for ln, text in lines:
            if r["rx"].search(text) and not (r["allow_rx"] and r["allow_rx"].search(text)):
                hits.append({"id": r["id"], "sev": r["sev"], "file": path, "line": ln,
                             "text": text.strip()[:160], "msg": r["msg"], "fix": r.get("fix", "")})
    return hits

def content_checks(path, fm, body):
    """Front-matter checks for qc-content drafts (distro-content.md DC-*, statute.md ST-2x)."""
    h = []
    def add(i, s, m, f=""): h.append({"id": i, "sev": s, "file": path, "line": 1, "text": "", "msg": m, "fix": f})
    lines = [l for l in body.splitlines() if l.strip()]
    if fm.get("type") == "affiliate":
        if not lines or not lines[0].startswith("#ad ·"): add("ST-20", "FIX", "Line 1 must open '#ad ·' (CR-054)")
        if not lines or not lines[-1].startswith(AFF_LAST): add("ST-21", "FIX", "Last line must be the commission sentence (CR-054)", AFF_LAST + " ...")
        for url in re.findall(r"https://\S+", body):
            i = body.find(url)
            if "(affiliate link)" not in body[max(0, i - 60): i + len(url) + 60] and "utm_" not in url:
                add("ST-22", "FIX", f"'(affiliate link)' not beside {url[:60]}")
    if fm.get("type") == "organic":
        assets = fm.get("assets") or []
        if not assets: add("DC-02", "FIX", "Non-affiliate post needs a visual of our people at work (text-only = FAIL)")
        for a in assets:
            if a.get("people") in ("stock", "ai"): add("DC-01", "FIX", f"{a.get('path')}: stock/AI people not allowed on non-affiliate posts (QC-REQ-023)")
            if a.get("people") == "real-staff" and not a.get("release"): add("DC-01", "BLOCK", f"{a.get('path')}: signed release not referenced")
    if fm.get("voice_id"):
        want = VOICES.get(fm.get("type") if fm.get("type") == "affiliate" else fm.get("entity"))
        if want and fm["voice_id"] != want: add("DC-03", "BLOCK", f"voice_id {fm['voice_id']} is not the approved voice for this post")
        if not fm.get("music_licence"): add("DC-05", "BLOCK", "Music licence path missing")
    if fm.get("paid") and str(fm.get("vendor", "")).lower() == "make" and not fm.get("vendor_consent"):
        add("DC-10", "BLOCK", "Paid Make ad needs prior written Celonis consent on file")
    if re.search(r"(?i)(\bfree plan\b|\$\d|\bper month\b|\bfree trial\b)", re.sub(r"https?://\S+", "", body)) and not fm.get("pricing_capture"):
        add("DC-17", "BLOCK", "Plan/price claim needs a posting-date pricing capture")
    if fm.get("_fm_error"): add("QC-01", "FIX", "Front matter is not valid YAML")
    return h

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True); ap.add_argument("--packs", default="common")
    ap.add_argument("--diff"); ap.add_argument("--json"); ap.add_argument("--root", default=".")
    ap.add_argument("files", nargs="*")
    a = ap.parse_args()
    cfg = yaml.safe_load(open(a.config, encoding="utf-8"))
    base_packs = [p.strip() for p in a.packs.split(",") if p.strip()]
    targets = added_lines(a.diff) if a.diff else {f: list(enumerate(open(f, encoding="utf-8", errors="replace").read().splitlines(), 1)) for f in a.files}
    hits, shas = [], {}
    for path, lines in targets.items():
        packs = list(base_packs)
        full = open(os.path.join(a.root, path), encoding="utf-8", errors="replace").read() if os.path.exists(os.path.join(a.root, path)) else ""
        shas[path] = hashlib.sha256(full.encode()).hexdigest()[:8]
        fm, body = front_matter(full) if path.endswith(".md") else ({}, full)
        if fm:
            ent = fm.get("entity")
            if ent in cfg["packs"] and ent not in packs: packs.append(ent if ent != "michaelt" else "michaelt")
            if fm.get("type") == "affiliate" and "affiliate" not in packs: packs.append("affiliate")
            if fm.get("paid") and "paid" not in packs: packs.append("paid")
            hits += content_checks(path, fm, body)
        hits += scan(path, lines, compile_rules(cfg, packs, a.root), cfg)
    sev = {h["sev"] for h in hits}
    verdict = "BLOCK" if "BLOCK" in sev else "FIX" if "FIX" in sev else "PASS"
    flags = sorted({h["id"] for h in hits if h["sev"] == "FLAG"})
    md = [f"### qc-gate (deterministic): **{verdict}**" + (" · judgement needed: " + ", ".join(flags) if flags else ""),
          f"Packs: {', '.join(base_packs)} · files: {len(targets)} · hits: {len(hits)}", ""]
    if hits:
        md += ["| # | Sev | Rule | Where | Finding | Exact fix |", "|---|---|---|---|---|---|"]
        for i, h in enumerate(sorted(hits, key=lambda x: ["BLOCK", "FIX", "FLAG"].index(x["sev"])), 1):
            md.append(f"| {i} | {h['sev']} | {h['id']} | `{h['file']}:{h['line']}` | {h['msg']}: `{h['text'].replace('|','/')}` | {h['fix'].replace('|','/')} |")
    md.append("\n_Draft automation. Brand/legal final PASS stays with REGIS-PIXEL / STATUTE until Alex confirms HQ-GOV-REG-001 §1a._")
    print("\n".join(md))
    if a.json:
        json.dump({"verdict": verdict, "flags": flags, "hits": hits, "file_sha8": shas, "packs": base_packs}, open(a.json, "w"), indent=1)
    sys.exit(0)  # never fail the job on FIX/FLAG; the qc-gate job decides via verdict output

if __name__ == "__main__":
    main()
