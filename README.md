# CARD Human-Likeness Study

Public, blinded Turing-test interface for comparing real credit-card Reddit
threads with CARD, OASIS, and SynthPAI outputs.

## Netlify deployment

Connect this GitHub repository to Netlify. No build command is required;
`netlify.toml` publishes the repository root.

The static form in `index.html` registers the Netlify form
`card-human-likeness`. Completed responses are submitted anonymously and are
available in the Netlify dashboard under:

`Site > Forms > card-human-likeness`

Each submission contains the participant ID, submission ID, response count,
and JSON payload. Participants are not asked for names or email addresses.

Participant links:

```text
https://<site-name>.netlify.app/?participant=P01
https://<site-name>.netlify.app/?participant=P02
https://<site-name>.netlify.app/?participant=P03
https://<site-name>.netlify.app/?participant=P04
https://<site-name>.netlify.app/?participant=P05
```

The private answer key and scoring files are intentionally excluded from this
public repository.
