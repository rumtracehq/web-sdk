# Release Flow

This package uses Changesets to collect release notes, version the package, and publish to npm from a maintainer-triggered GitHub Actions workflow.

## Feature PRs

1. Make the package change.
2. Run `npm run changeset`.
3. Select `@rumtrace/web-sdk` and the correct semver bump: `patch`, `minor`, or `major`.
4. Write a short user-facing summary for the changelog.
5. Commit the generated `.changeset/*.md` file with the code change.

Use `patch` for fixes, `minor` for backwards-compatible features, and `major` for breaking changes.

## Publishing

1. Merge feature PRs into `main`.
2. A maintainer runs the `Publish Package` workflow from the `main` branch.
3. The workflow opens or updates a `Version Packages` PR.
4. Review that PR. It contains the version bump, changelog update, and consumed changeset files.
5. Merge the `Version Packages` PR into `main`.
6. A maintainer runs the `Publish Package` workflow from `main` again.
7. The workflow publishes the package to npm with `changeset publish`.

## Security

The release workflow is intentionally not triggered by `pull_request`, so external contributor PRs do not run CI or release jobs from this setup.

Only run the `Publish Package` workflow from `rumtracehq/web-sdk` on the `main` branch. The workflow is restricted to that repository and branch, and it uses the `npm-publish` GitHub environment. Configure that environment with required reviewers so owners or maintainers must approve release execution.

Workflow actions are pinned to commit SHAs instead of mutable tags.

The workflow uses npm trusted publishing through GitHub Actions OIDC, so npm must allow this repository and `.github/workflows/publish.yml` as a trusted publisher.

## Local Commands

- `npm run changeset` creates a changeset file.
- `npm run version-packages` applies pending changesets to `package.json` and `CHANGELOG.md`.
- `npm run release` builds the package and publishes unpublished versions.
