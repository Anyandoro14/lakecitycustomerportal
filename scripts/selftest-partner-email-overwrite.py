#!/usr/bin/env python3
"""Self-test for partner email overwrite rules (mirrors controllers/api.py helpers)."""


def is_placeholder_email(email):
    e = (email or "").strip().lower()
    if not e:
        return False
    if e.endswith("@lakecity.portal"):
        return True
    if "placeholder" in e:
        return True
    if e.startswith("stand-") and "@" in e and e.endswith(".portal"):
        return True
    return False


def normalize_partner_email(email):
    return (email or "").strip().lower()


def should_overwrite_partner_email(existing_email, new_email):
    existing = normalize_partner_email(existing_email)
    new = normalize_partner_email(new_email)

    if not new:
        return False, "skip_blank_new"
    if is_placeholder_email(new):
        return False, "skip_placeholder_new"

    if not existing:
        return True, "write_blank_existing"
    if is_placeholder_email(existing):
        return True, "write_placeholder_existing"
    if existing == new:
        return False, "write_same"
    return False, "conflict_real_email"


def main():
    cases = [
        (False, "a@b.com", True, "write_blank_existing"),
        ("", "a@b.com", True, "write_blank_existing"),
        ("stand-1321@lakecity.portal", "a@b.com", True, "write_placeholder_existing"),
        ("x@placeholder.local", "a@b.com", True, "write_placeholder_existing"),
        ("real@gmail.com", "a@b.com", False, "conflict_real_email"),
        ("real@gmail.com", "stand-1@lakecity.portal", False, "skip_placeholder_new"),
        ("real@gmail.com", "", False, "skip_blank_new"),
        ("a@b.com", "a@b.com", False, "write_same"),
        ("stand-1@lakecity.portal", "stand-2@lakecity.portal", False, "skip_placeholder_new"),
    ]
    failed = 0
    for existing, new, expect_write, expect_reason in cases:
        got_write, got_reason = should_overwrite_partner_email(existing, new)
        ok = got_write is expect_write and got_reason == expect_reason
        status = "OK" if ok else "FAIL"
        if not ok:
            failed += 1
        print(f"{status}: existing={existing!r} new={new!r} → {got_write},{got_reason} (want {expect_write},{expect_reason})")
    if failed:
        raise SystemExit(f"{failed} case(s) failed")
    print("all passed")


if __name__ == "__main__":
    main()
