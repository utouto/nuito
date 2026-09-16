ALTER TABLE user_settings ADD COLUMN show_map_companion_icons INTEGER NOT NULL DEFAULT 1 CHECK(show_map_companion_icons IN (0, 1));
