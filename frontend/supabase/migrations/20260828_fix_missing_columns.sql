-- ==============================================================================
-- Placement AI - Migration: Add missing columns & ensure full schema sync
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query -> Run)
-- ==============================================================================

-- 1. Ensure public.opportunities has all required columns
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'Non-CDC';
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS status text DEFAULT 'New';
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS application_status text DEFAULT 'Not Decided';
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS deadline text;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS apply_link text;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS eligibility text;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS next_action text;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS ai_confidence numeric(4, 3);
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS ai_model text;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS automatic_updates boolean DEFAULT true;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS needs_review boolean DEFAULT false;

-- 2. Ensure public.gmail_attachments has all required columns
ALTER TABLE public.gmail_attachments ADD COLUMN IF NOT EXISTS extracted_summary text;
ALTER TABLE public.gmail_attachments ADD COLUMN IF NOT EXISTS extracted_text text;
ALTER TABLE public.gmail_attachments ADD COLUMN IF NOT EXISTS processed boolean DEFAULT false;

-- 3. Ensure public.gmail_messages has all required columns
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS ai_relevant boolean;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS ai_category text;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS ai_confidence numeric(4, 3);
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS ai_reason text;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS ai_classified_at timestamp with time zone;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS relevance_status text DEFAULT 'pending';

-- 4. Ensure public.gmail_relevance_settings has sync_scope column
ALTER TABLE public.gmail_relevance_settings ADD COLUMN IF NOT EXISTS sync_scope text DEFAULT 'all';
