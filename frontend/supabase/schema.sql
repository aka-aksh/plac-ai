-- ==============================================================================
-- Placement AI (plac-ai) - Complete Supabase Database Schema & RLS Policies
-- ==============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. PROFILES TABLE (Student details, education, skills, resume)
-- ------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  name text,
  email text,
  university text,
  branch text,
  graduation_year integer,
  cgpa numeric(4, 2),
  marks_10 numeric(5, 2),
  marks_12 numeric(5, 2),
  registration_number text,
  neo_id text,
  skills text[] default array[]::text[],
  resume_url text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 2. GMAIL CONNECTIONS (Encrypted AES-256-GCM tokens)
-- ------------------------------------------------------------------------------
create table if not exists public.gmail_connections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  access_token_encrypted text,
  access_token_iv text,
  access_token_auth_tag text,
  refresh_token_encrypted text,
  refresh_token_iv text,
  refresh_token_auth_tag text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 3. GMAIL SYNC STATE (Tracking Gmail historyId per user for incremental sync)
-- ------------------------------------------------------------------------------
create table if not exists public.gmail_sync_state (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  history_id text not null,
  last_synced_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 4. GMAIL RELEVANCE SETTINGS (Sender/domain whitelist and filtering mode)
-- ------------------------------------------------------------------------------
create table if not exists public.gmail_relevance_settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  mode text not null check (mode in ('strict', 'ai', 'smart')) default 'strict',
  allowed_senders text[] default array[]::text[],
  setup_completed boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 5. GMAIL MESSAGES (Synced raw emails, metadata, and AI classification)
-- ------------------------------------------------------------------------------
create table if not exists public.gmail_messages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gmail_message_id text not null,
  gmail_thread_id text,
  sender text,
  subject text,
  body_text text,
  received_at timestamp with time zone,
  relevance_status text default 'pending' check (relevance_status in ('relevant', 'irrelevant', 'pending')),
  ai_relevant boolean,
  ai_category text,
  ai_confidence numeric(4, 3),
  ai_reason text,
  ai_classified_at timestamp with time zone,
  ai_model text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_user_gmail_message unique (user_id, gmail_message_id)
);

-- ------------------------------------------------------------------------------
-- 6. GMAIL ATTACHMENTS (Discovered PDF/DOCX attachments & extracted text)
-- ------------------------------------------------------------------------------
create table if not exists public.gmail_attachments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gmail_message_id uuid not null references public.gmail_messages(id) on delete cascade,
  gmail_attachment_id text,
  filename text not null,
  mime_type text not null,
  size_bytes bigint,
  extracted_text text,
  extracted_summary text,
  processed boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_message_attachment unique (gmail_message_id, filename)
);

-- ------------------------------------------------------------------------------
-- 7. OPPORTUNITIES (Aggregated placement & job opportunities)
-- ------------------------------------------------------------------------------
create table if not exists public.opportunities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  role text,
  source_type text default 'Non-CDC' check (source_type in ('CDC', 'Non-CDC')),
  category text,
  status text default 'New',
  application_status text default 'Not Decided' check (
    application_status in (
      'Not Decided',
      'Applied',
      'Assessment',
      'Interview',
      'Offer Received',
      'Rejected',
      'Not Interested'
    )
  ),
  deadline text,
  apply_link text,
  eligibility text,
  next_action text,
  ai_confidence numeric(4, 3),
  ai_model text,
  automatic_updates boolean default true not null,
  needs_review boolean default false not null,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 8. OPPORTUNITY MESSAGES (Mapping many emails/updates to single opportunity)
-- ------------------------------------------------------------------------------
create table if not exists public.opportunity_messages (
  id uuid primary key default uuid_generate_v4(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  gmail_message_id uuid not null references public.gmail_messages(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_opportunity_message unique (opportunity_id, gmail_message_id)
);

-- ------------------------------------------------------------------------------
-- INDEXES FOR QUERY OPTIMIZATION
-- ------------------------------------------------------------------------------
create index if not exists idx_profiles_user on public.profiles(user_id);
create index if not exists idx_gmail_connections_user on public.gmail_connections(user_id);
create index if not exists idx_gmail_messages_user_received on public.gmail_messages(user_id, received_at desc);
create index if not exists idx_gmail_messages_user_classified on public.gmail_messages(user_id, ai_classified_at);
create index if not exists idx_gmail_attachments_user_processed on public.gmail_attachments(user_id, processed);
create index if not exists idx_opportunities_user_updated on public.opportunities(user_id, updated_at desc);
create index if not exists idx_opportunities_user_deadline on public.opportunities(user_id, deadline);
create index if not exists idx_opportunity_messages_opp on public.opportunity_messages(opportunity_id);

-- ------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.gmail_connections enable row level security;
alter table public.gmail_sync_state enable row level security;
alter table public.gmail_relevance_settings enable row level security;
alter table public.gmail_messages enable row level security;
alter table public.gmail_attachments enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_messages enable row level security;

-- Profiles RLS
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = user_id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = user_id);

-- Gmail Connections RLS
create policy "Users can access own gmail connections" on public.gmail_connections for all using (auth.uid() = user_id);

-- Gmail Sync State RLS
create policy "Users can access own sync state" on public.gmail_sync_state for all using (auth.uid() = user_id);

-- Relevance Settings RLS
create policy "Users can access own settings" on public.gmail_relevance_settings for all using (auth.uid() = user_id);

-- Gmail Messages RLS
create policy "Users can access own messages" on public.gmail_messages for all using (auth.uid() = user_id);

-- Gmail Attachments RLS
create policy "Users can access own attachments" on public.gmail_attachments for all using (auth.uid() = user_id);

-- Opportunities RLS
create policy "Users can access own opportunities" on public.opportunities for all using (auth.uid() = user_id);

-- Opportunity Messages RLS
create policy "Users can access own opportunity messages" on public.opportunity_messages for select using (
  exists (
    select 1 from public.opportunities where opportunities.id = opportunity_messages.opportunity_id and opportunities.user_id = auth.uid()
  )
);
create policy "Users can insert own opportunity messages" on public.opportunity_messages for insert with check (
  exists (
    select 1 from public.opportunities where opportunities.id = opportunity_messages.opportunity_id and opportunities.user_id = auth.uid()
  )
);
create policy "Users can delete own opportunity messages" on public.opportunity_messages for delete using (
  exists (
    select 1 from public.opportunities where opportunities.id = opportunity_messages.opportunity_id and opportunities.user_id = auth.uid()
  )
);
