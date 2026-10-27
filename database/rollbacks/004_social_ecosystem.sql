-- Guarded compensation for migration 004. The rollback runner already requires
-- ALLOW_DATABASE_ROLLBACK=1 and takes the database advisory lock.
DROP TABLE IF EXISTS social_reports;
DROP TABLE IF EXISTS social_notifications;
DROP TABLE IF EXISTS official_accounts;
DROP TABLE IF EXISTS social_messages;
DROP TABLE IF EXISTS conversation_members;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS travel_group_members;
DROP TABLE IF EXISTS travel_groups;
DROP TABLE IF EXISTS friend_relations;
DROP TABLE IF EXISTS social_follows;
DROP TABLE IF EXISTS travel_records;
DROP TABLE IF EXISTS travel_check_ins;
DROP TABLE IF EXISTS social_reactions;
DROP TABLE IF EXISTS social_comments;
DROP TABLE IF EXISTS social_post_tags;
DROP TABLE IF EXISTS social_post_media;
DROP TABLE IF EXISTS social_posts;
ALTER TABLE IF EXISTS social_profiles DROP CONSTRAINT IF EXISTS social_profiles_avatar_fk;
DROP TABLE IF EXISTS social_media_assets;
DROP TABLE IF EXISTS place_communities;
DROP TABLE IF EXISTS social_profiles;
