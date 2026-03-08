````skill
---
name: github
description: "Manage GitHub repositories -- browse repos, issues, pull requests, releases, actions, and collaborate using the GitHub CLI."
metadata: {"openclaw": {"emoji": "🐙", "requires": {"bins": ["gh"]}, "tags": ["github", "git", "vcs", "issues", "pull-requests", "ci", "collaboration"], "secrets": [{"env_var": "GITHUB_TOKEN", "label": "GitHub Personal Access Token", "placeholder": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}]}}
---

# GitHub

You help manage GitHub repositories using the **`gh`** CLI.
Use this when the user asks about repos, issues, pull requests, releases, GitHub Actions, or collaboration workflows.

## Authentication

Authenticate using a personal access token:

```bash
gh auth login --with-token <<< "$GITHUB_TOKEN"
```

Check authentication status:

```bash
gh auth status
```

## Commands

### Repositories

#### List repositories for the authenticated user

```bash
gh repo list --limit 20
```

#### List repositories for an organisation

```bash
gh repo list <org> --limit 20
```

#### View repository details

```bash
gh repo view <owner>/<repo>
```

#### Clone a repository

```bash
gh repo clone <owner>/<repo>
```

#### Create a new repository

```bash
gh repo create <name> --public --description "<description>"
```

#### Fork a repository

```bash
gh repo fork <owner>/<repo> --clone
```

### Issues

#### List open issues

```bash
gh issue list --repo <owner>/<repo>
```

#### List issues with filters

```bash
gh issue list --repo <owner>/<repo> --label "<label>" --assignee "<user>" --state open
```

#### View an issue

```bash
gh issue view <number> --repo <owner>/<repo>
```

#### Create an issue

```bash
gh issue create --repo <owner>/<repo> --title "<title>" --body "<body>"
```

#### Close an issue

```bash
gh issue close <number> --repo <owner>/<repo>
```

#### Add a comment to an issue

```bash
gh issue comment <number> --repo <owner>/<repo> --body "<comment>"
```

### Pull Requests

#### List open pull requests

```bash
gh pr list --repo <owner>/<repo>
```

#### View a pull request

```bash
gh pr view <number> --repo <owner>/<repo>
```

#### View pull request diff

```bash
gh pr diff <number> --repo <owner>/<repo>
```

#### Create a pull request

```bash
gh pr create --repo <owner>/<repo> --title "<title>" --body "<body>" --base main --head <branch>
```

#### Checkout a pull request locally

```bash
gh pr checkout <number> --repo <owner>/<repo>
```

#### Merge a pull request

```bash
gh pr merge <number> --repo <owner>/<repo> --merge
```

#### Review a pull request

```bash
gh pr review <number> --repo <owner>/<repo> --approve --body "<comment>"
```

#### Request reviewers

```bash
gh pr edit <number> --repo <owner>/<repo> --add-reviewer "<user>"
```

### Releases

#### List releases

```bash
gh release list --repo <owner>/<repo>
```

#### View a release

```bash
gh release view <tag> --repo <owner>/<repo>
```

#### Create a release

```bash
gh release create <tag> --repo <owner>/<repo> --title "<title>" --notes "<notes>"
```

#### Download release assets

```bash
gh release download <tag> --repo <owner>/<repo> --dir <output-dir>
```

### GitHub Actions

#### List workflow runs

```bash
gh run list --repo <owner>/<repo> --limit 10
```

#### View a workflow run

```bash
gh run view <run-id> --repo <owner>/<repo>
```

#### View workflow run logs

```bash
gh run view <run-id> --repo <owner>/<repo> --log
```

#### Re-run a failed workflow

```bash
gh run rerun <run-id> --repo <owner>/<repo>
```

#### List workflows

```bash
gh workflow list --repo <owner>/<repo>
```

#### Trigger a workflow

```bash
gh workflow run <workflow-id> --repo <owner>/<repo>
```

### Branches & Tags

#### List branches

```bash
gh api repos/<owner>/<repo>/branches --jq '.[].name'
```

#### View branch protection rules

```bash
gh api repos/<owner>/<repo>/branches/<branch>/protection
```

### Search

#### Search repositories

```bash
gh search repos "<query>" --limit 10
```

#### Search issues

```bash
gh search issues "<query>" --repo <owner>/<repo> --limit 10
```

#### Search code

```bash
gh search code "<query>" --repo <owner>/<repo> --limit 10
```

### Gists

#### List gists

```bash
gh gist list --limit 10
```

#### Create a gist

```bash
gh gist create <file> --desc "<description>" --public
```

#### View a gist

```bash
gh gist view <id>
```

## Best Practices

- Always specify `--repo <owner>/<repo>` when operating outside a cloned repository
- Use `--json` and `--jq` flags for structured output when piping into other tools
- Prefer `gh pr create` over manual branch + merge workflows for traceability
- Use labels and milestones to organise issues and pull requests
- Check `gh auth status` before running commands if authentication errors occur
````
