-- ============================================================
-- ZebraMeter — Stored Procedure: sp_flag_printhead_status
-- ------------------------------------------------------------
-- Pemeliharaan tabel `printhead_benchmarks`: menghitung ulang
-- kolom `status` (ACTIVE / INACTIVE) tiap head berdasarkan
-- selisih `last_seen_at` vs waktu saat ini.
--
-- Kategori flagging (atasan = yang lebih baru):
--   1. ACTIVE   — selisih last_seen < 3 hari dari NOW().
--   2. INACTIVE — selisih last_seen > 7 hari dari NOW().
--   Rentang 3–7 hari tidak dispesifikasi di atas → buffer,
--   default tetap ACTIVE (head dianggap aktif sampai benar-benar
--   lewat 7 hari). Nilai kontroversialnya bisa diubah via
--   parameter, contoh: lebih ketat? CALL(NULL, 1, 4);
--
-- Cara pakai:
--   CALL sp_flag_printhead_status(NULL, 3, 7);     -- flag SEMUA head (default)
--   CALL sp_flag_printhead_status('PHxxx', 3, 7);  -- flag 1 head spesifik
--
-- Parameter:
--   p_printhead_id   VARCHAR(100) — NULL/'' = semua head,
--                                  selain itu = 1 head spesifik.
--   p_active_days    INT          — batas hari "pasti aktif"
--                                  (NULL = default 3).
--   p_inactive_days  INT          — batas hari "nonaktif"
--                                  (NULL = default 7); harus
--                                  >= p_active_days.
--
-- Catatan:
--   * SP TIDAK menulis ulang baris yang statusnya sudah benar
--     (guard WHERE) → tidak memeningkatkan updated_at & tidak
--     membebani replikasi untuk run yang hanya no-op.
--   * Idempoten: hasil sama untuk state database sama.
--   * Dipanggil otomatis di akhir `sp_refresh_printhead_benchmarks`
--     (tiap refresh benchmark langsung menyegarkan status) dan bisa
--     di-CALL manual / scheduler kapan pun.
--
-- Apply:
--   mysql -h <host> -u <user> -p <db> < sp_flag_printhead_status.sql
-- ============================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_flag_printhead_status` $$

CREATE PROCEDURE `sp_flag_printhead_status`(
  IN p_printhead_id VARCHAR(100),
  IN p_active_days INT,
  IN p_inactive_days INT
)
BEGIN
  -- ----------------------------------------------------------
  -- Normalisasi parameter
  -- ----------------------------------------------------------
  DECLARE v_filter VARCHAR(100) DEFAULT NULL;
  DECLARE v_active_days INT DEFAULT 3;
  DECLARE v_inactive_days INT DEFAULT 7;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_printhead_id IS NOT NULL AND TRIM(p_printhead_id) <> '' THEN
    SET v_filter = TRIM(p_printhead_id);
  END IF;

  IF p_active_days IS NOT NULL AND p_active_days >= 0 THEN
    SET v_active_days = p_active_days;
  END IF;

  IF p_inactive_days IS NOT NULL AND p_inactive_days > 0 THEN
    SET v_inactive_days = p_inactive_days;
  END IF;

  -- Konfigurasi absurd == salah pakai: gagal cepat & jelas.
  IF v_inactive_days < v_active_days THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT =
        'p_inactive_days harus >= p_active_days (default 3 & 7)';
  END IF;

  START TRANSACTION;

  -- ----------------------------------------------------------
  -- Hitung status berikutnya per head (buffer 3-7 hari = ACTIVE),
  -- lalu hanya update baris yang statusnya memang berubah.
  -- ----------------------------------------------------------
  UPDATE `printhead_benchmarks` b
  JOIN (
    SELECT
      `id`,
      CASE
        -- selisih < p_active_days hari => pasti ACTIVE
        WHEN `last_seen_at` >= NOW(3) - INTERVAL v_active_days DAY
          THEN 'ACTIVE'
        -- selisih > p_inactive_days hari => INACTIVE
        WHEN `last_seen_at` < NOW(3) - INTERVAL v_inactive_days DAY
          THEN 'INACTIVE'
        -- buffer di antara threshold => tetap ACTIVE
        ELSE 'ACTIVE'
      END AS next_status
    FROM `printhead_benchmarks`
    WHERE (v_filter IS NULL OR `printhead_id` = v_filter)
  ) next ON next.`id` = b.`id`
  SET b.`status` = next.`next_status`
  WHERE b.`status` <> next.`next_status`;

  COMMIT;
END $$

DELIMITER ;
