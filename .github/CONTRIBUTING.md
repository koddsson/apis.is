# Contributing to apis.is

Thank you for your interest in contributing to apis.is!

## Adding a Meetup

You can submit a new meetup to be added to the meetups list by creating a GitHub issue:

1. Go to the [Issues page](../../issues)
2. Click "New Issue"
3. Select the "Add Meetup" template
4. Fill in the meetup details:
   - **Title**: The name of the meetup or event (required)
   - **Description**: A brief description (optional)
   - **Event URL**: Link to the event page (required)
   - **Start Date and Time**: When the meetup starts in ISO 8601 format, e.g., `2025-11-13T16:00:00Z` (required)
   - **End Date and Time**: When the meetup ends in ISO 8601 format (optional)
5. Submit the issue

Once submitted, a maintainer will review your submission. If approved, they will add the `approved-meetup` label to the issue, which will automatically:
- Parse the issue information
- Add the meetup to the `src/data/meetups.json` file
- Create a pull request with the changes
- Close the issue when the PR is merged

## Date Format

The start and end dates should be in ISO 8601 format with timezone information. Examples:
- `2025-11-13T16:00:00Z` (UTC time)
- `2025-12-04T17:30:00Z` (UTC time)

You can use online tools to convert your local time to UTC/ISO 8601 format.

## Questions?

If you have any questions about adding a meetup, feel free to open a discussion or ask in the issue comments.

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User creates issue using "Add Meetup" template              │
│    - Fills in: title, description, url, start date, end date   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Maintainer reviews the submission                           │
│    - Checks if the meetup is appropriate                       │
│    - Verifies the information is correct                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Maintainer adds "approved-meetup" label to issue            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. GitHub Action automatically triggers                        │
│    - Parses the issue body                                     │
│    - Validates the data                                        │
│    - Adds meetup to src/data/meetups.json                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. GitHub Action creates a Pull Request                        │
│    - PR contains the updated meetups.json                      │
│    - PR title: "Add meetup: [meetup title]"                    │
│    - PR automatically references the issue                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Maintainer merges the Pull Request                          │
│    - Issue is automatically closed                             │
│    - Meetup is now live on the API!                            │
└─────────────────────────────────────────────────────────────────┘
```

## For Maintainers

To approve a meetup submission:

1. Review the issue to ensure:
   - The meetup is relevant to the Icelandic tech community
   - The information is complete and accurate
   - The dates are correct and in the future
   - The URL is valid and working

2. Add the `approved-meetup` label to the issue

3. The GitHub Action will automatically:
   - Process the issue
   - Create a PR with the changes
   - Comment on the issue with the status

4. Review and merge the automatically created PR

### Troubleshooting

If the GitHub Action fails:
- Check the Actions tab for error logs
- Common issues:
  - Invalid date format (must be ISO 8601)
  - Missing required fields
  - Invalid URL format
- You can manually run the script locally to test:
  ```bash
  ISSUE_BODY="$(cat issue-body.txt)" node .github/scripts/add-meetup.js
  ```
