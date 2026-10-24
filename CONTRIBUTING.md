# Contributing Guidelines

Thank you for investing your time in contributing to the **Perimeter** project!

To ensure a smooth and consistent workflow across the team, please adhere to the following guidelines when contributing.

## The Golden Rule: Issue → Branch → PR

Every change must be traceable. We do not commit or push directly to `main`. 
Our workflow strictly follows: **Issue** → **Branch** → **Pull Request**.

### 1. Create an Issue
Before writing any code, ensure there is an open GitHub Issue for the task. 
- Use one of the standard Issue Templates (Feature, Bug, Chore, Hotfix, Data Survey).
- Ensure the issue clearly defines the Goal and Acceptance Criteria.

### 2. Branch Naming Convention
The branch name **must exactly match** the `## Set Branch Name as:` blockquote in your assigned Issue.

Common formats include:
- `feat/[short-description]`
- `fix/[bug-name]`
- `chore/[task-name]`
- `hotfix/[short-description]`
- `chore/survey-[short-description]`

Example: If you are working on Issue #42, the issue template will tell you exactly what to name your branch.

### 3. Commit Messages
We follow **Conventional Commits**:
`<type>(<optional-scope>): <imperative message> (#<issue>)`

Examples:
- `feat(api): add dynamic schedule endpoint (#12)`
- `fix(ui): resolve overlapping map markers (#15)`
- `chore: update dependencies (#18)`

*Note: Work in atomic commits and only stage files you actually touched.*

### 4. Pull Requests (PR)
When your work is ready:
1. Open a PR against the `main` branch.
2. The PR name should follow the Conventional Commits format and match the issue context.
3. Ensure the PR description fills out the provided `pull_request_template.md` (What, Why, Changes, How to verify) and links the original issue using `Closes #<issue>`.

### 5. Review Process & Merging
Before a PR can be merged into `main`:
1. **Green CI**: All GitHub Actions checks (build, test) must pass.
2. **CodeRabbit / Peer Review**: All inline comments from AI code reviewers (like CodeRabbit) or human reviewers must be addressed and resolved. 
3. **Tech Lead Sign-off**: Wait for the Tech Lead (`@PhurinKaewpuangsek`) to approve the PR.
4. **Squash Merge**: When merging, we use Squash Merge. Ensure the final commit message includes the PR number (e.g., `(#<pr-number>)`) to maintain traceability.

## Environment & Architecture (V4)
This project is a Serverless application using AWS Lambda, DynamoDB, and React.
- **Frontend**: `frontend/` (React + Vite + TypeScript + Tailwind + Three.js)
- **Backend**: `functions/<name>/` (AWS Lambda Node.js 24)
- **Infrastructure**: Managed strictly via `template.yaml` (AWS SAM). **No ClickOps.** Do not manually modify resources in the AWS Console.

By following these rules, you help keep the codebase robust, traceable, and easy to maintain. Happy coding!
