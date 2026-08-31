-- ==============================================================================
-- AUTOMATED SAAS SUBSCRIPTION TRIGGER UPON SUCCESSFUL M-PESA PAYMENT
-- ==============================================================================

-- 1. Create a trigger function to automatically renew/activate SaaS subscription
CREATE OR REPLACE FUNCTION public.handle_saas_subscription_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_tenant_record RECORD;
  v_subscription_days INT := 30;
  v_current_end TIMESTAMPTZ;
  v_base_time TIMESTAMPTZ;
  v_next_end TIMESTAMPTZ;
BEGIN
  -- Only act on transactions of kind 'saas_subscription' that transitioned to 'success'
  IF NEW.kind = 'saas_subscription' AND NEW.status = 'success' AND (OLD.status IS NULL OR OLD.status <> 'success') THEN
    
    -- Check if tenant exists
    SELECT id, subscription_start_at, subscription_end_at, subscription_status 
    INTO v_tenant_record 
    FROM public.tenants 
    WHERE id = NEW.tenant_id;

    IF v_tenant_record.id IS NOT NULL THEN
      -- Fetch configured subscription days from platform_settings
      SELECT COALESCE(subscription_days, 30) INTO v_subscription_days FROM public.platform_settings LIMIT 1;
      IF v_subscription_days IS NULL OR v_subscription_days <= 0 THEN
        v_subscription_days := 30;
      END IF;

      -- Calculate extension: if current subscription is still active and in future, extend from that point; otherwise start from now
      v_current_end := v_tenant_record.subscription_end_at;
      IF v_current_end IS NOT NULL AND v_current_end > now() THEN
        v_base_time := v_current_end;
      ELSE
        v_base_time := now();
      END IF;

      v_next_end := v_base_time + (v_subscription_days || ' days')::INTERVAL;

      -- Update the tenant's subscription status and validity
      UPDATE public.tenants
      SET
        is_active = true,
        subscription_status = 'active',
        subscription_start_at = COALESCE(v_tenant_record.subscription_start_at, now()),
        subscription_end_at = v_next_end,
        updated_at = now()
      WHERE id = NEW.tenant_id;

      -- Insert record into subscriptions table
      INSERT INTO public.subscriptions (
        tenant_id,
        status,
        plan_type,
        expiry_date,
        created_at,
        updated_at
      )
      VALUES (
        NEW.tenant_id,
        'active',
        'standard',
        v_next_end,
        now(),
        now()
      );

      -- Record audit log entry
      INSERT INTO public.audit_logs (
        tenant_id,
        action,
        entity_type,
        entity_id,
        metadata
      )
      VALUES (
        NEW.tenant_id,
        'subscription.renewed',
        'transaction',
        NEW.id,
        jsonb_build_object(
          'receipt', NEW.mpesa_receipt,
          'amount', NEW.amount_kes,
          'days', v_subscription_days,
          'expiry_date', v_next_end,
          'source', 'postgres_trigger'
        )
      );

    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never abort transaction updates on auxiliary logging issues
  RAISE WARNING 'handle_saas_subscription_payment error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 2. Grant execute privileges
GRANT EXECUTE ON FUNCTION public.handle_saas_subscription_payment() TO PUBLIC, anon, authenticated, service_role, postgres;

-- 3. Create or replace the trigger on transactions table
DROP TRIGGER IF EXISTS trg_saas_subscription_payment_success ON public.transactions;

CREATE TRIGGER trg_saas_subscription_payment_success
  AFTER INSERT OR UPDATE OF status ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_saas_subscription_payment();
