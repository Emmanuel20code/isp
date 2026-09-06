DROP POLICY IF EXISTS "No client access to platform mpesa config" ON public.platform_mpesa_config;

CREATE POLICY "platform_mpesa_config_admin_manage"
  ON public.platform_mpesa_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
