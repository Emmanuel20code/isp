-- Migration to grant super_admin role to emmanueloyaro123@gmail.com and emmanueloyaro3@gmail.com

INSERT INTO public.user_roles (user_id, role, tenant_id)
SELECT u.id, 'super_admin'::public.app_role, NULL
FROM auth.users u
WHERE LOWER(u.email) IN ('emmanueloyaro123@gmail.com', 'emmanueloyaro3@gmail.com')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = u.id AND r.role = 'super_admin'::public.app_role
  );
