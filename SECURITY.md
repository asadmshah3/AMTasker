# Security policy

## Supported versions

Security fixes are made for the latest release on the `main` branch.

## How AMTasker handles data

AMTasker has no server component. All data is stored in the user's browser (IndexedDB and localStorage) and is never
sent over the network. The optional profile PIN is a convenience lock: only a salted SHA-256 hash is stored, and the
data itself is not encrypted, so it does not protect against someone with access to the computer's browser profile.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Report them privately through GitHub: **Security →
Report a vulnerability** on this repository
([private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)).

Include what you found, how to reproduce it and the impact you expect. You can expect a first reply within a week.
