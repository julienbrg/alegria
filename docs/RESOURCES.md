# Alegria legal constraints and resources

The legal and regulatory constraints a classroom AI assistant must meet in French schools, how Rukh meets each one, and reference resources.

## Why these constraints

The French Ministry of Education's [cadre d'usage de l'IA en éducation](https://www.education.gouv.fr/cadre-d-usage-de-l-ia-en-education-450647) (June 2025) sets two constraints that consumer AI services don't meet:

- « Il ne faut en aucun cas demander aux élèves de se créer un compte personnel auprès de services d'IA. »
- Consumer services « ne garantissent pas la non-réutilisation des données saisies ».

On top of that, no student personal data may pass through the assistant ([GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj) data minimisation principle). The teacher keeps control of the scope: the AI assists, and replaces neither the teacher's professional judgement nor the student's own intellectual effort.

So Rukh is an assistant with no student account, a scope set by the teacher, and no stored messages. In Alegria, students sign in through the ENT they already use, so they still never create an account.

## Requirements

| Requirement | Source | Rukh's answer |
| --- | --- | --- |
| No personal student account | Cadre d'usage | Access by link, no student authentication (Alegria: ENT identity only) |
| Data minimisation, no personal data | GDPR art. 5 | Masking in the browser, raw message never stored |
| History and model improvement off by default | [CNIL](https://www.cnil.fr/fr/intelligence-artificielle) | Message content is never kept |
| No transfer outside the EU/EEA | GDPR chapter V | Inference hosted in the EU, whatever model the teacher picks |
| Transparency: users know they are talking to an AI | [AI Act](https://eur-lex.europa.eu/eli/reg/2024/1689/oj) art. 50 | Explicit interface, answers attributed to the assistant |
| No emotion recognition at school | AI Act art. 5 | No analysis of attention, engagement or expression |
| Frugal use, free software preferred | Cadre d'usage | Open source code ([rukh-ui](https://github.com/w3hc/rukh-ui), [rukh](https://github.com/w3hc/rukh)), an open model available ([Mistral](https://mistral.ai/)), a scope that limits web calls |
| AI supervised by the teacher, not a substitute | Cadre d'usage | The teacher sets the corpus, scope, model and allowed exercises |

Sources: Cadre d'usage de l'IA en éducation (MENJ, June 2025), CNIL, GDPR, AI Act (Regulation (EU) 2024/1689).

## GAR requirements

The [GAR](https://gar.education.fr/) (*Gestionnaire d'accès aux ressources*) is the Ministry of Education's access manager for digital educational resources. It sits between the ENT, which provides identities, and the resource providers, and passes on only the attributes the Ministry has approved for each resource, over [SAML, CAS or OIDC](https://gar.education.fr/wp-content/uploads/2025/04/GAR_RTFS_8.2_Contrat_SSO_FR.pdf).

A GAR adapter is therefore more than an identity option. The provider signs the [contrat d'adhésion](https://gar.education.fr/wp-content/uploads/2026/06/Contrat-GAR_v2026.pdf) (v2026), becomes the Ministry's GDPR processor (*sous-traitant*) and files a compliance declaration (*déclaration de conformité applicative*) for each resource. The table lists what that contract requires and where Alegria stands. "Missing" marks work not yet done or not yet specified.

| Requirement | Source | Alegria's answer |
| --- | --- | --- |
| A legal entity signs the contract | Annex 2, §3 | Missing: a legal entity to act as publisher |
| A resource designed for school use, with its own editorial unity and a ScoLOMFR record. Resources that are only services, such as office tools, are excluded | Annex 3, §1.1 | Assistants are built by teachers for their courses, but Alegria itself ships no content. Missing: eligibility to confirm with the GAR team, and a ScoLOMFR record |
| Distribute exclusively through the GAR to every school that has it, and only to schools with a subscription, even when free | Art. 3 §15; Annex 2, §3 | Missing: in a GAR school, access must go through the GAR and not through a direct Edifice connector. Subscriptions are not handled |
| Request only the attributes strictly needed, and justify categories 3 and 4 | Art. 4 §25; Annex 3, §1.3 | Needs the opaque id, school code (UAI) and profile, plus classes (category 3) for visibility. No name or email (category 4) |
| No new sign-in prompt and no identifier or access code given to users | Annex 3, §1.2 | No account, password or code. Identity comes from the single sign-on only |
| No data collected beyond the GAR attributes and what the declaration justifies | Annex 3, §1.2 | Conversation text is user-produced data and must be declared. Message content is not logged (`ENT_LOG_QUERIES=false`) |
| No processing outside the resource's purpose, no transfer to third parties not needed for the service | Art. 4 §30; Annex 3, §1.2; Annex 4, III.1 | Student messages go to the assistant's model provider only. Missing: a guarantee that providers neither keep nor train on the data, and `anthropic-web-search` disabled for GAR schools |
| Subprocessors approved in writing by the Ministry beforehand | Annex 4, III.1 | Missing: OVHcloud and each model provider declared as subprocessors |
| No transfer outside the EU without the Ministry's written approval; hosting preferably in the EU | Art. 4 §31; Annex 4, III.6 | Hosted on an OVHcloud VPS in the EU. Anthropic, OpenAI and DeepSeek process data outside the EU. Missing: `ENT_ALLOWED_MODELS` limited to EU-hosted models for GAR schools |
| No change of hosting without prior approval | Annex 3, §1.2 | Single VPS. To declare before any move |
| Delete data received from the GAR at the end of each school year (15 August), keep user data for the declared periods, and send a purge certificate once a year | Art. 3 §21; Annex 3, §1.2; Annex 4, II | Missing: a scheduled purge of conversations and chat history. Assistants are teachers' work, which may be kept longer |
| Give users their data in a machine-readable format on request, before deletion | Art. 3 §22; Annex 4, III.7 | Missing: an export route |
| Keep data continuity when a user enters or leaves the GAR, without merging GAR and non-GAR accounts unless approved | Annex 3, §1.5 | Missing: assistants are owned by the ENT user id, while the GAR gives an opaque id. Ownership needs a mapping |
| Features outside the GAR framework only for teachers, declared beforehand. The provider becomes data controller for them | Art. 4 §26–28 | The MCP endpoint and its OAuth server fit here. Restrict `MCP_ROLES` to teachers in GAR schools |
| No social network links. External links follow the CNIL recommendations of October 2021: in primary and lower secondary schools only institutional sites, in upper secondary an information notice before leaving | Annex 3, §1.2; Annex 5 | No social links. Assistant links and model answers can contain external links. Missing: link filtering by school level and the information notice |
| Analytics and trackers only if exempt from consent | Annex 3, §2.2 | No analytics. One session cookie, cleared when the browser closes |
| Connection data kept no more than 12 months, navigation data no longer than the school year, cookies no more than 13 months | Annex 4, II | Session cookie: 8 hours at most. Missing: a retention period for reverse-proxy logs |
| Security measures under GDPR art. 32 and the RTFS, privacy by design and by default | Annex 4, III.1 and III.5 | See [Security and privacy](../.claude/spec.md#security-and-privacy). Missing: regular testing and access traceability for administrators |
| Report a data breach to the Ministry within 48 hours | Art. 3 §18; Annex 4, III.4 | Missing: a breach procedure and contact |
| Forward data-subject requests to the Ministry and answer within 15 working days | Annex 4, III.3 | Missing: a procedure |
| Name the data protection officer, keep a record of processing, accept audits | Annex 4, III.8–10 | Missing |
| Stay compliant with each new RTFS version, at the provider's own cost | Art. 3 §13; Art. 7 §40 | Accepted. The GAR adapter stays behind the ENT provider interface |
| Inform the GAR before closing the service, so users can retrieve their data | Art. 3 §20 | Missing: a closing procedure |

Sources: [Contrat d'adhésion au GAR](https://gar.education.fr/wp-content/uploads/2026/06/Contrat-GAR_v2026.pdf) (v2026) and its annexes: 1 ethics charter, 2 RTFS extract, 3 compliance commitments, 4 GDPR processing, 5 external content.

## Resources

- [L'école peut-elle survivre à l'IA ?](https://youtu.be/PyreD4605dQ), talk by [Philippe Meirieu](https://fr.wikipedia.org/wiki/Philippe_Meirieu)
- [L'IA en éducation : cadre d'usage](https://www.education.gouv.fr/cadre-d-usage-de-l-ia-en-education-450647), French Ministry of Education, June 2025
- [GAR documentation for resource providers](https://gar.education.fr/fournisseurs-de-ressources/documentation/): contract, technical reference (RTFS), legal and administrative reference, SSO interface contract
- [GAR legal framework](https://gar.education.fr/cadre-juridique/)
- [Rukh source code](https://github.com/w3hc/rukh)
- [Rukh demo video](https://youtu.be/5NGApe0T2Ao)
- [Example classroom activities](https://julienberanger.com/ia-exemples-d-activites)
