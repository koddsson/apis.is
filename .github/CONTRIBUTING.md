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
