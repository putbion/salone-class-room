-- ==============================================================================
-- Salone Class Room — Supabase Database Security & Row Level Security (RLS) Hardening
-- Execute this script in the Supabase Dashboard SQL Editor (Project -> SQL Editor)
-- ==============================================================================

-- 1. ENABLE ROW LEVEL SECURITY (RLS) ON ALL PLATFORM TABLES
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.platform_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.curriculum_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.learning_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.practice_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tool_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.announcements ENABLE ROW LEVEL SECURITY;

-- 2. REVOKE ALL DEFAULT PERMISSIONS FROM UNTRUSTED ROLES (anon, authenticated)
-- All frontend access routes strictly through Netlify Serverless Functions using service_role.
-- Direct queries using anon key will be blocked by default.
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.user_profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.user_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_users FROM anon, authenticated;
REVOKE ALL ON TABLE public.payment_requests FROM anon, authenticated;
REVOKE ALL ON TABLE public.platform_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.platform_features FROM anon, authenticated;
REVOKE ALL ON TABLE public.practice_attempts FROM anon, authenticated;
REVOKE ALL ON TABLE public.app_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.support_messages FROM anon, authenticated;
REVOKE ALL ON TABLE public.ai_usage_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.password_reset_requests FROM anon, authenticated;
REVOKE ALL ON TABLE public.tool_usage FROM anon, authenticated;

-- 3. GRANT SERVICE ROLE ACCESS
-- ------------------------------------------------------------------------------
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 4. DROP EXISTING POLICIES (TO AVOID CONFLICTS)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    tbl text;
    pol text;
BEGIN
    FOR tbl, pol IN
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
    END LOOP;
END $$;

-- 5. SERVICE ROLE POLICIES (FULL UNRESTRICTED ACCESS FOR SERVERLESS BACKEND)
-- ------------------------------------------------------------------------------
CREATE POLICY "service_role_all_user_profiles" ON public.user_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_user_sessions" ON public.user_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_admin_users" ON public.admin_users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_payment_requests" ON public.payment_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_platform_settings" ON public.platform_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_platform_features" ON public.platform_features FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_curriculum_topics" ON public.curriculum_topics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_learning_content" ON public.learning_content FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_practice_attempts" ON public.practice_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_app_events" ON public.app_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_support_messages" ON public.support_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_ai_usage_log" ON public.ai_usage_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_password_reset_requests" ON public.password_reset_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_tool_usage" ON public.tool_usage FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_announcements" ON public.announcements FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. PUBLIC READ POLICIES (FOR NON-SENSITIVE CURRICULUM AND ACTIVE ANNOUNCEMENTS ONLY)
-- In case public clients read curriculum or announcements directly
-- ------------------------------------------------------------------------------
GRANT SELECT ON public.curriculum_topics TO anon, authenticated;
GRANT SELECT ON public.learning_content TO anon, authenticated;
GRANT SELECT ON public.announcements TO anon, authenticated;

CREATE POLICY "public_read_active_curriculum" ON public.curriculum_topics FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "public_read_active_learning_content" ON public.learning_content FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "public_read_active_announcements" ON public.announcements FOR SELECT TO anon, authenticated USING (active = true);

-- 7. DATA INTEGRITY AND CONSTRAINT VALIDATIONS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    -- user_profiles category check
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_user_category') THEN
        ALTER TABLE public.user_profiles
        ADD CONSTRAINT check_user_category
        CHECK (category IN ('primary', 'jss', 'sss', 'teacher', 'university'));
    END IF;

    -- user_profiles status check
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_user_status') THEN
        ALTER TABLE public.user_profiles
        ADD CONSTRAINT check_user_status
        CHECK (account_status IN ('active', 'blocked'));
    END IF;

    -- payment_requests status check
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_payment_status') THEN
        ALTER TABLE public.payment_requests
        ADD CONSTRAINT check_payment_status
        CHECK (status IN ('pending', 'verified', 'rejected'));
    END IF;

    -- payment_requests non-negative amount check
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_payment_amount') THEN
        ALTER TABLE public.payment_requests
        ADD CONSTRAINT check_payment_amount
        CHECK (amount >= 0);
    END IF;

    -- admin_users role check
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_admin_role') THEN
        ALTER TABLE public.admin_users
        ADD CONSTRAINT check_admin_role
        CHECK (role IN ('owner', 'assistant'));
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Constraint setup notice: %', SQLERRM;
END $$;
