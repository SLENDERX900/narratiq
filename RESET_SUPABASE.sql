-- ============================================================
-- RESET SUPABASE TO FRESH STATE
-- Run this in Supabase SQL Editor to start completely fresh
-- ============================================================

-- Drop all tables (in reverse order of dependencies)
DROP TABLE IF EXISTS public.knowledge_graph CASCADE;
DROP TABLE IF EXISTS public.memory_logs CASCADE;
DROP TABLE IF EXISTS public.market_sessions CASCADE;
DROP TABLE IF EXISTS public.assets CASCADE;
DROP TABLE IF EXISTS public.source_reliability CASCADE;
DROP TABLE IF EXISTS public.macro_signals CASCADE;
DROP TABLE IF EXISTS public.stock_forecasts CASCADE;
DROP TABLE IF EXISTS public.stock_insights CASCADE;
DROP TABLE IF EXISTS public.agent_run_log CASCADE;
DROP TABLE IF EXISTS public.user_watchlist CASCADE;

-- Drop all functions
DROP FUNCTION IF EXISTS public.match_memory_logs CASCADE;

-- Drop vector extension (optional - uncomment if you want to remove it)
-- DROP EXTENSION IF EXISTS vector;

-- Reset sequence counters
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
        EXECUTE 'ALTER SEQUENCE ' || quote_ident(r.sequence_name) || ' RESTART WITH 1';
    END LOOP;
END
$$;

-- Now run the fresh schema from supabase_schema.sql
-- ============================================================
-- After running this reset, immediately run: supabase_schema.sql
-- ============================================================
