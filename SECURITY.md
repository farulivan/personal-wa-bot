# Security Policy

This bot runs in my family's WhatsApp chats. It holds a linked-device session for my number and a database of what everyone has logged, so I treat security reports seriously even though this is a personal project.

## Reporting a vulnerability

Please don't open a public issue. Report it privately instead:

**[Report a vulnerability](https://github.com/farulivan/personal-wa-bot/security/advisories/new)**

That opens a private advisory that only you and I can see. Tell me what you found, how to reproduce it, and what someone could do with it.

I'll reply within a week. If the issue is real, I'll fix it on `main`, redeploy, and credit you in the advisory unless you'd rather stay anonymous.

## In scope

The code in this repository and the way it is deployed. The reports I most want:

- Someone who isn't in `ALLOWED_WA_IDS` getting the bot to run a command
- One person's data showing up for someone else, or being changed by them
- Anything that could leak the WhatsApp session in `baileys_auth/` or any other secret
- A message that crashes the bot or keeps it offline

## Out of scope

- Bugs in WhatsApp itself or in Baileys. Please report those to [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys).
- Advisories in dependencies that Dependabot already tracks, unless you can show they are exploitable here.
- Anything that needs physical access to a family member's phone.

## Supported versions

Only `main`. It is what runs in production, and there are no releases or older branches to patch.
