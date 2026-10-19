"""Safe exception details for the bundled Foundation/Prism runtime."""

import re


def verification_error_detail(error, data=None, secrets=()):
    message = str(error)
    values = list(secrets)

    def collect(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if re.search(r'password|token|secret|api[_-]?key', str(key), re.I):
                    if isinstance(item, str):
                        values.append(item)
                else:
                    collect(item)
        elif isinstance(value, (list, tuple)):
            for item in value:
                collect(item)

    collect(data)
    for value in sorted((v for v in values if isinstance(v, str) and v), key=len, reverse=True):
        message = message.replace(value, '<redacted>')
    message = re.sub(r'''(?i)(authorization["']?\s*[:=]\s*["']?)(?:basic|bearer)\s+[^\s,;"']+''', r'\1<redacted>', message)
    message = re.sub(
        r'''(?ix)((?:[\w-]*(?:password|token|secret)|api[_-]?key)["']?\s*[:=]\s*)
        (?:"[^"]*"|'[^']*'|[^\s,;}]+)''',
        r'\1<redacted>', message,
    )
    message = re.sub(r'(https?://)[^\s/@]+:[^\s/@]+@', r'\1<redacted>@', message)
    return f'{type(error).__name__}: {message}'.replace('\r', ' ').replace('\n', ' ')[:2000]
