# CODE_REVIEW.md

## Code Review Standard

Review code for correctness, regressions, maintainability, security, and test
coverage. Prioritize actionable findings over style preferences.

## Review Priorities

1. Bugs that break requested behavior.
2. Security vulnerabilities or access-control mistakes.
3. Data loss, data corruption, or privacy risks.
4. Missing tests for changed behavior.
5. Performance or reliability issues with realistic impact.
6. Maintainability issues that will make future changes risky.

## Review Checklist

### Correctness

- Does the implementation satisfy the requested behavior?
- Are edge cases handled?
- Are errors handled intentionally?
- Are public contracts, schemas, and migrations compatible?

### Testing

- Are tests added or updated for changed behavior?
- Do tests cover success, failure, and boundary cases?
- Is there a smoke test for the changed workflow?
- Are skipped tests or missing coverage explained?

### Security

- Are authentication and authorization checks correct?
- Is external input validated?
- Are secrets and sensitive data protected?
- Are dependency changes justified and reviewed?
- Are logs and error messages safe?

### Maintainability

- Does the change follow local conventions?
- Is the code simpler than the problem requires?
- Are abstractions justified by real reuse or complexity reduction?
- Are comments useful and limited to non-obvious behavior?

## Review Output Format

When asked for a review, report findings first:

- Severity.
- File and line.
- Problem.
- Impact.
- Suggested fix.

Then include:

- Open questions.
- Test gaps.
- Brief summary.

If no issues are found, say so clearly and mention residual risk.

