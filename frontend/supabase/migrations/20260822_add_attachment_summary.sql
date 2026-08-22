-- Run this in Supabase SQL Editor before using attachment summaries.
alter table public.gmail_attachments
  add column if not exists extracted_summary text;
