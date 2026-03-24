alter table public.reading_articles
add column if not exists cover_image_url text,
add column if not exists content_blocks jsonb;
