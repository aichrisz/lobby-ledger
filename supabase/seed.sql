-- Local development seed. Synthetic data only.
insert into organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Pilothotel (lokal)');

-- Local shared user for tests/e2e. GoTrue password login needs the token/change
-- columns non-NULL ('' like API-created users), created_at/updated_at set, and a
-- matching auth.identities row — otherwise sign-in fails with a 500.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        instance_id, raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token,
                        email_change, email_change_token_new,
                        created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000aa', 'pilot@example.test',
        crypt('local-dev-only-password', gen_salt('bf')), now(), 'authenticated',
        'authenticated', '00000000-0000-0000-0000-000000000000',
        '{"provider":"email","providers":["email"]}', '{}',
        '', '', '', '',
        now(), now())
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider,
                             last_sign_in_at, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000aa',
        '{"sub":"00000000-0000-0000-0000-0000000000aa","email":"pilot@example.test","email_verified":true}',
        'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into pilot_accounts (user_id, organization_id)
values ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000001');

insert into staff_signatures (organization_id, short_code, display_name, is_admin)
values ('00000000-0000-0000-0000-000000000001', 'AB', 'Pilotleitung A', true),
       ('00000000-0000-0000-0000-000000000001', 'LK', 'Rezeption L', false);
