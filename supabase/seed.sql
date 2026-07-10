-- Local development seed. Synthetic data only.
insert into organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Pilothotel (lokal)');

-- Local shared user: created via supabase auth admin API in tests/e2e setup;
-- this maps any locally created user with this fixed id.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        instance_id, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000aa', 'pilot@example.test',
        crypt('local-dev-only-password', gen_salt('bf')), now(), 'authenticated',
        'authenticated', '00000000-0000-0000-0000-000000000000',
        '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

insert into pilot_accounts (user_id, organization_id)
values ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000001');

insert into staff_signatures (organization_id, short_code, display_name, is_admin)
values ('00000000-0000-0000-0000-000000000001', 'AB', 'Pilotleitung A', true),
       ('00000000-0000-0000-0000-000000000001', 'LK', 'Rezeption L', false);
