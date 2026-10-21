# Retired personal training website

The training website and its API were removed on October 21, 2026, in favor of
the standalone offline app. The former `/train` and `/api/train` routes now
return 404.

The [native Android build prompt](training-android-build-prompt.md) remains
available as a self-contained offline app specification.

The historical `supabase/training_schema.sql` is retained for existing records;
removing the website does not drop database tables or delete stored data.

The website no longer requires `TRAIN_USER_ID`.
