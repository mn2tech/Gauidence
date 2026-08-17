# Guardian Dental Pack — demo without clinical data

Use this when you have **no patient/claim files** but want to exercise Pack #002 against a real practice identity.

## Fixture

Upload this **JSON** file (Space uploads do not accept `.md`):

[`docs/fixtures/lagos-dental-centre-practice-profile.json`](../fixtures/lagos-dental-centre-practice-profile.json)

Markdown reference (for reading only): [`docs/fixtures/lagos-dental-centre-practice-profile.md`](../fixtures/lagos-dental-centre-practice-profile.md)

Content is taken from the public [Lagos Dental Centre](https://www.lagosdentalcentre.com/) website. **No PHI.**

## Steps

1. Apply migration `0084_guardian_dental_pack.sql` if not already applied.
2. Create (or open) a **business** Space named e.g. `Lagos Dental Centre`.
3. **Settings → Packs → Guardian Dental → Install** on that Space.  
   Keep default Spaces checked (Patients, Clinical, Scheduling, Insurance & Claims, Billing) or at least **Clinical**.
4. In **Files**, click **Choose a file** and upload `lagos-dental-centre-practice-profile.json` into the parent Space or **Clinical**.  
   (Do not upload the `.md` — Guardian rejects that type.)
5. Run **Analyze existing knowledge** (explicit) — Preview should show **1 document**.
6. Ask Gideon, for example:
   - Show me everything we know about Lagos Dental Centre.
   - Who is the provider at this practice?
   - What services does Lagos Dental Centre offer?
   - What are the office hours?

## Expected outcome

Ontology should pick up **organization** (practice), **provider** (Dr. Nwanya), and practice facts (address, phone, services, hours). Patient / appointment / claim dashboard cards stay empty until you add clinical or synthetic non-prod data later.
