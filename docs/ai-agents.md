# Using AI agents with Canutin

Every Canutin server publishes a live instruction manual for AI agents. Point an agent at it and the agent learns how to read and write your financial data through Canutin's API: importing transactions from a bank statement, labeling spending, answering questions about your net worth, or filling in balance history.

This works with any agent that can fetch a URL and make HTTP requests, such as Claude, ChatGPT, or a coding agent running on your machine.

## Find your instructions URL

Go to **Settings → Imports**. The **AI agents** section shows your server's **Instructions URL**, which looks like:

```
https://<your-pocketbase-host>/api/canutin/skill
```

The page behind that URL is generated on the fly from your server's actual database schema, so it always matches the version of Canutin you are running. You can open it in a browser to see exactly what an agent gets.

## Give it to an agent

Tell the agent the URL and how to sign in. For example:

> Read https://pb.example.com/api/canutin/skill and follow it. Log into my Canutin as user@example.com with password ..., then import the transactions from this CSV into my checking account.

The instructions tell the agent to authenticate with your regular Canutin email and password, and every API request it makes is scoped to your user. It can only see and change your own data, the same as you can when signed in.

Some things agents are good at with this:

- Importing a bank statement (CSV, PDF, or even a screenshot) as transactions, with automatic labeling.
- Backfilling years of balance history for an account or asset.
- Answering questions like "what did I spend on restaurants last quarter?"
- Reverting an import that went wrong, since every bulk import is tracked and undoable.

## A note on credentials

The agent acts with your full user account, so treat it like handing your Canutin password to a very fast assistant. Prefer agents that run on your own machine or that you otherwise trust with credentials, and change your password if you ever want to cut off access.
