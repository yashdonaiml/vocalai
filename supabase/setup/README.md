# SQL Editor migration order

For a **fresh application schema**, run `01-initialize-vocollai.sql` once, then run `02-verify-vocollai.sql`. The initializer contains the 24-migration baseline listed below. After verification, apply the incremental follow-up migrations in the next section, in timestamp order.

The initialization is for a fresh application schema and refuses an existing vocollai schema. It preserves the original migration SQL, in filename/timestamp order, inside one transaction. It does not apply anything until you run it in Supabase.

| Order | Source migration | SHA-256 (normalized SQL) |
| --- | --- | --- |
| 1 | `20261001092758_2c940d02-70e0-4c21-bc96-9a577db79621.sql` | `a2c4ba48a1da0f542e5091d3af4e0cae5bd21824ac570d4e010adf3d91fdff73` |
| 2 | `20261001092823_06b70245-283e-49be-82dd-6fd9478999cf.sql` | `0f253d0cbeced0f6b2ad9905ec0280aecc9eaeb78426dc6cdfe2ce984ad37bb0` |
| 3 | `20261001095218_254f0113-e1c1-4a26-8383-779b5dced3b6.sql` | `0f044160fcecb8901368f478f4f3d4b69a15ff43d7f52fd9436989567f1e4bd2` |
| 4 | `20261001123053_a5ca26ee-56d8-40c6-b512-8fbd4303265e.sql` | `cc9b59091f547537b3e621e50336e02c144933f4a7e93db649336b7ef36ad32c` |
| 5 | `20261003084945_a9f57b49-8274-4ed5-8dbd-4c8cfb0cbadc.sql` | `b5ce2947793ea81e76fb6a2886e4726865cc811f8b61429cd2e156047b80dda8` |
| 6 | `20261003120558_19a33d19-bf0b-45d4-a3bb-a0019556a69a.sql` | `f9392a0eb998dab0d182fc6a4a550f636e292904b8f0dcb4894b4c41b7411526` |
| 7 | `20261003120617_cc6eef9a-5541-487a-9c8c-272fd17cdbbd.sql` | `252191c1f64c2b64268a5d66d72258105804ba23a3723ac4d85cb8d702e2c920` |
| 8 | `20261003122339_fbf3c7f8-3957-4953-9ffb-187575e67110.sql` | `59ab4437c55972bdd7c3e4fce9de66c71946b14d8b3b0fd5b30601ccbe4511e4` |
| 9 | `20261003123139_4c7e0471-63bb-40dc-a010-7a62ec74969d.sql` | `d9ad149c79dd5d10251c86970d84c1ead14e89974f4c4940ce4f91ccfdb035d4` |
| 10 | `20261003124339_753338b8-ba24-4268-9f67-166137f12594.sql` | `492982d29b2c8a65ae3513b5dd24e565ac755c92c34c83bf2d6a821f3e21d5ea` |
| 11 | `20261003133842_fcdad814-626f-44a7-b044-2cc8058ce5aa.sql` | `b67f83478a2057f94a4bb6fb6c9f26b6c731782598cf7d820bb5892c9c1f1389` |
| 12 | `20261003142454_5d5b5c16-430d-419a-9716-eb670c1060c7.sql` | `611d2afbd92c58a073edbc8b8fc127592cd9cccc3bf12777754e13a69d195448` |
| 13 | `20261003145730_de9e92cd-f29d-42cd-9ba6-1a75a0ea1749.sql` | `df8dff54eeb0b4e64c3de3d1fbfdb8805cfb845ad553f346ba6c311dc471d06d` |
| 14 | `20261003152918_783395a2-0416-4a10-b58b-59d26d0ed020.sql` | `639f24cb6757d36bf047a50708c8dab9d24520acdf31f8424efad78702e1ba70` |
| 15 | `20261004060627_d97dcf0c-bf6d-4560-9d2f-743c1c953937.sql` | `fd40d7596cf5f8190c53169db9195f5d0a23e4b7ad27b1505b390d77e8e0e78c` |
| 16 | `20261004072041_286b4c42-12a9-44ad-9415-6ca00ddbb62a.sql` | `5356fc0b9de0b141c55cd3f23a8e51df4f8c15f3bd181c1f3fcf7d3d0e3ecfdd` |
| 17 | `20261004074642_c6a09a7d-e22b-4d4e-a56e-722050da84c9.sql` | `9e792397b4a7d1a1c515a84bf06dc8d36051a2be1ff98ec4ce5ccc142b08c658` |
| 18 | `20261004074658_36e2e6d9-6780-4f0f-a597-533e44945057.sql` | `7f4b84f1284d61e742529bd9c0df4b7cbba9b1beb6d00a023c76b8b92c58d9d9` |
| 19 | `20261004074846_f3153399-21c9-4c01-bd20-8040afecc0cb.sql` | `3d747765eb0e6ca5e3bbfa82b16d7dea6918293f8c539f5829f1c57336e0c2ac` |
| 20 | `20261005070733_538e0aaa-351e-4aae-a77d-9ced32d93a6a.sql` | `55a53446b3903a2168171d3e81bd8824e749691e5cf1826ec6660fb861ddedac` |
| 21 | `20261005070752_9011de2a-c579-40c7-8bb9-75befe906863.sql` | `64f7176f45521d0bbe96d7bc8eb6c3acb18a8f4d118e7d51a8234e1527e4f2ad` |
| 22 | `20261017120000_gateway_runtime_bindings.sql` | `fcf1890a6e85a1b9833db7ab14555bab5b9b135b107fe675da6ccf55f1a997d2` |
| 23 | `20261021120000_inbound_telephony.sql` | `c4c21258cd292042f9cfec75ea00290125433bfc10677bf0cd34a6c5d2c7b43b` |
| 24 | `20261022120000_managed_inbound.sql` | `aee42ef4d2543f203a7ea885e34595c7d0c2701616632d6c59bf101d288aa19f` |

The supplied API key is not a database connection password, so this preparation does not execute migrations remotely.

SQL Editor execution does not automatically record these versions in the Supabase CLI migration-history table. If you later switch to CLI migrations, reconcile/baseline all 24 versions against the schema first; do not blindly run `db push` against this initialized project.

If initialization fails, stop and retain the first error. A subsequent query in a new editor tab can check whether any vocollai tables exist; do not manually skip a failed migration or drop tables.

## Incremental follow-up migrations

These migrations were created after the baseline initializer. Apply each exactly once, in order, to the verified VocollAI schema:

1. `../migrations/20261025110000_privacy_enforcement.sql` — privacy policies, redaction, retention.
2. `../migrations/20261025120000_evals_atomic_deployments.sql` — frozen eval evidence and atomic deployment promotion.
3. `../migrations/20261025170000_environment_kind_constraint.sql` — canonical environment kinds.
4. `../migrations/20261025180000_managed_inbound_privacy_and_test_challenge.sql` — managed-number privacy grants and expiring phone verification challenges.
5. `../migrations/20261025190000_successful_action_webhook_events.sql` — successful-action webhook event linkage and delivery leases.

The privacy migration performs irreversible masking/expiry operations; inspect and back up the target before applying. These scripts are not bundled into `01-initialize-vocollai.sql`, and they have not been applied to any remote database by this repository workflow. For an existing production or SQL-Editor-initialized project, first verify the schema and reconcile CLI migration history; do not blindly use `db push` or rerun the fresh-schema initializer.
