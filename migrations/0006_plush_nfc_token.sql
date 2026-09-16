ALTER TABLE plushes ADD COLUMN nfc_token TEXT;
CREATE UNIQUE INDEX idx_plushes_nfc_token ON plushes(nfc_token) WHERE nfc_token IS NOT NULL;
