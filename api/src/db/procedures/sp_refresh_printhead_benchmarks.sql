-- ============================================================
-- ZebraMeter — Stored Procedure: sp_refresh_printhead_benchmarks
-- ------------------------------------------------------------
-- Agregasi data olahan per printhead dari tabel `meter_readings`
-- ke tabel `printhead_benchmarks` (1 baris per printhead_id).
--
-- Sumber : meter_readings (hanya row dengan printhead_id NOT NULL
--          dan tidak kosong setelah TRIM).
-- Tujuan : printhead_benchmarks (UPSERT per printhead_id).
--
-- Cara pakai:
--   CALL sp_refresh_printhead_benchmarks(NULL, 0);       -- refresh SEMUA head
--   CALL sp_refresh_printhead_benchmarks('PHxxx', 0);    -- refresh 1 head
--   CALL sp_refresh_printhead_benchmarks(NULL, 1);       -- rebuild penuh:
--      hapus baris benchmark yang head-nya sudah tidak punya
--      reading, lalu refresh semua.
--
-- Parameter:
--   p_printhead_id VARCHAR(100) — NULL/'' = semua head,
--                                 selain itu = 1 head spesifik.
--   p_rebuild      TINYINT(1)   — 0 = UPSERT biasa (default),
--                                 1 = DELETE baris yatim dulu.
--
-- Aturan kalkulasi (disepakati):
--   * first/last diambil dari BARIS MIN/MAX(measured_at) per head,
--     tiebreak: id terkecil untuk first, id terbesar untuk last.
--   * delta = last - first; NULL bila salah satu NULL;
--     dibiarkan NEGATIF bila counter reset (ditandai flag).
--   * CATATAN METER NON-MONOTON: `mediaLength` (dan kadang
--     `ribbonLength`) adalah SISA roll, bukan odometer — nilainya
--     naik-turun wajar sehingga delta negatif pada meter tsb adalah
--     NORMAL (flag tetap dinyalakan sebagai info kualitas data).
--     Acuan utama count/benchmark head = `head_usage_delta` dan
--     `printhead_odometer_delta` (keduanya odometer monoton naik).
--   * reading_count = COUNT(*) row valid per head.
--   * lifespan_minutes = TIMESTAMPDIFF(MINUTE, first_seen, last_seen).
--   * has_negative_delta = 1 bila ada delta < 0.
--   * status (ACTIVE/INACTIVE) dihitung ulang di akhir prosedur
--     via `sp_flag_printhead_status` (last_seen < 3 hari = ACTIVE,
--     > 7 hari = INACTIVE, 3-7 hari buffer default ACTIVE).
--
-- Butuh MySQL 8 (window function ROW_NUMBER).
-- Apply:
--   mysql -h <host> -u <user> -p <db> < sp_refresh_printhead_benchmarks.sql
-- ============================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_refresh_printhead_benchmarks` $$

CREATE PROCEDURE `sp_refresh_printhead_benchmarks`(
  IN p_printhead_id VARCHAR(100),
  IN p_rebuild TINYINT(1)
)
BEGIN
  -- ----------------------------------------------------------
  -- Normalisasi parameter
  -- ----------------------------------------------------------
  DECLARE v_filter VARCHAR(100) DEFAULT NULL;
  DECLARE v_rebuild TINYINT(1) DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_printhead_id IS NOT NULL AND TRIM(p_printhead_id) <> '' THEN
    SET v_filter = TRIM(p_printhead_id);
  END IF;

  IF p_rebuild IS NOT NULL AND p_rebuild <> 0 THEN
    SET v_rebuild = 1;
  END IF;

  START TRANSACTION;

  -- ----------------------------------------------------------
  -- Mode rebuild: hapus baris benchmark yang sudah yatim
  -- (head-nya tidak lagi punya reading valid).
  -- ----------------------------------------------------------
  IF v_rebuild = 1 THEN
    IF v_filter IS NULL THEN
      DELETE b
      FROM `printhead_benchmarks` b
      LEFT JOIN (
        SELECT DISTINCT `printhead_id`
        FROM `meter_readings`
        WHERE `printhead_id` IS NOT NULL
          AND TRIM(`printhead_id`) <> ''
      ) r ON r.`printhead_id` = b.`printhead_id`
      WHERE r.`printhead_id` IS NULL;
    ELSE
      DELETE b
      FROM `printhead_benchmarks` b
      LEFT JOIN (
        SELECT DISTINCT `printhead_id`
        FROM `meter_readings`
        WHERE `printhead_id` = v_filter
      ) r ON r.`printhead_id` = b.`printhead_id`
      WHERE b.`printhead_id` = v_filter
        AND r.`printhead_id` IS NULL;
    END IF;
  END IF;
  INSERT INTO `printhead_benchmarks` (
    `printhead_id`, `first_printer_id`, `last_printer_id`,
    `first_model`, `last_model`,
    `first_seen_at`, `last_seen_at`,
    `reading_count`, `lifespan_minutes`,
    `total_label_count_first`, `total_label_count_first_at`,
    `total_label_count_last`, `total_label_count_last_at`,
    `total_label_count_delta`,
    `total_print_length_first`, `total_print_length_first_at`,
    `total_print_length_last`, `total_print_length_last_at`,
    `total_print_length_delta`,
    `printhead_odometer_first`, `printhead_odometer_first_at`,
    `printhead_odometer_last`, `printhead_odometer_last_at`,
    `printhead_odometer_delta`,
    `head_usage_first`, `head_usage_first_at`,
    `head_usage_last`, `head_usage_last_at`,
    `head_usage_delta`,
    `ribbon_length_first`, `ribbon_length_first_at`,
    `ribbon_length_last`, `ribbon_length_last_at`,
    `ribbon_length_delta`,
    `media_length_first`, `media_length_first_at`,
    `media_length_last`, `media_length_last_at`,
    `media_length_delta`, `has_negative_delta`
  )
  WITH ranked AS (
    SELECT m.`printhead_id`, m.`id`, m.`printer_id`, m.`measured_at`,
      m.`total_label_count`, m.`total_print_length`,
      m.`printhead_odometer`, m.`head_usage`,
      m.`ribbon_length`, m.`media_length`,
      ROW_NUMBER() OVER (PARTITION BY m.`printhead_id`
        ORDER BY m.`measured_at` ASC, m.`id` ASC) AS rn_asc,
      ROW_NUMBER() OVER (PARTITION BY m.`printhead_id`
        ORDER BY m.`measured_at` DESC, m.`id` DESC) AS rn_desc,
      COUNT(*) OVER (PARTITION BY m.`printhead_id`) AS cnt,
      MIN(m.`measured_at`) OVER (PARTITION BY m.`printhead_id`) AS min_at,
      MAX(m.`measured_at`) OVER (PARTITION BY m.`printhead_id`) AS max_at
    FROM `meter_readings` m
    WHERE m.`printhead_id` IS NOT NULL
      AND TRIM(m.`printhead_id`) <> ''
      AND (v_filter IS NULL OR m.`printhead_id` = v_filter)
  ),
  agg AS (
    SELECT r.`printhead_id` AS ph,
      MAX(r.`cnt`) AS reading_count,
      MAX(r.`min_at`) AS first_seen_at,
      MAX(r.`max_at`) AS last_seen_at,
      MAX(CASE WHEN r.rn_asc = 1 THEN r.`printer_id` END) AS f_pid,
      MAX(CASE WHEN r.rn_desc = 1 THEN r.`printer_id` END) AS l_pid,
      MAX(CASE WHEN r.rn_asc = 1 THEN r.`total_label_count` END) AS tlc_f,
      MAX(CASE WHEN r.rn_desc = 1 THEN r.`total_label_count` END) AS tlc_l,
      MAX(CASE WHEN r.rn_asc = 1 THEN r.`total_print_length` END) AS tpl_f,
      MAX(CASE WHEN r.rn_desc = 1 THEN r.`total_print_length` END) AS tpl_l,
      MAX(CASE WHEN r.rn_asc = 1 THEN r.`printhead_odometer` END) AS odo_f,
      MAX(CASE WHEN r.rn_desc = 1 THEN r.`printhead_odometer` END) AS odo_l,
      MAX(CASE WHEN r.rn_asc = 1 THEN r.`head_usage` END) AS hu_f,
      MAX(CASE WHEN r.rn_desc = 1 THEN r.`head_usage` END) AS hu_l,
      MAX(CASE WHEN r.rn_asc = 1 THEN r.`ribbon_length` END) AS rib_f,
      MAX(CASE WHEN r.rn_desc = 1 THEN r.`ribbon_length` END) AS rib_l,
      MAX(CASE WHEN r.rn_asc = 1 THEN r.`media_length` END) AS med_f,
      MAX(CASE WHEN r.rn_desc = 1 THEN r.`media_length` END) AS med_l
    FROM ranked r
    GROUP BY r.`printhead_id`
  )
  SELECT a.ph,
    a.f_pid, a.l_pid, pf.`model`, pl.`model`,
    a.first_seen_at, a.last_seen_at, a.reading_count,
    TIMESTAMPDIFF(MINUTE, a.first_seen_at, a.last_seen_at),
    a.tlc_f, CASE WHEN a.tlc_f IS NULL THEN NULL ELSE a.first_seen_at END,
    a.tlc_l, CASE WHEN a.tlc_l IS NULL THEN NULL ELSE a.last_seen_at END,
    CASE WHEN a.tlc_f IS NULL OR a.tlc_l IS NULL THEN NULL ELSE a.tlc_l - a.tlc_f END,
    a.tpl_f, CASE WHEN a.tpl_f IS NULL THEN NULL ELSE a.first_seen_at END,
    a.tpl_l, CASE WHEN a.tpl_l IS NULL THEN NULL ELSE a.last_seen_at END,
    CASE WHEN a.tpl_f IS NULL OR a.tpl_l IS NULL THEN NULL ELSE a.tpl_l - a.tpl_f END,
    a.odo_f, CASE WHEN a.odo_f IS NULL THEN NULL ELSE a.first_seen_at END,
    a.odo_l, CASE WHEN a.odo_l IS NULL THEN NULL ELSE a.last_seen_at END,
    CASE WHEN a.odo_f IS NULL OR a.odo_l IS NULL THEN NULL ELSE a.odo_l - a.odo_f END,
    a.hu_f, CASE WHEN a.hu_f IS NULL THEN NULL ELSE a.first_seen_at END,
    a.hu_l, CASE WHEN a.hu_l IS NULL THEN NULL ELSE a.last_seen_at END,
    CASE WHEN a.hu_f IS NULL OR a.hu_l IS NULL THEN NULL ELSE a.hu_l - a.hu_f END,
    a.rib_f, CASE WHEN a.rib_f IS NULL THEN NULL ELSE a.first_seen_at END,
    a.rib_l, CASE WHEN a.rib_l IS NULL THEN NULL ELSE a.last_seen_at END,
    CASE WHEN a.rib_f IS NULL OR a.rib_l IS NULL THEN NULL ELSE a.rib_l - a.rib_f END,
    a.med_f, CASE WHEN a.med_f IS NULL THEN NULL ELSE a.first_seen_at END,
    a.med_l, CASE WHEN a.med_l IS NULL THEN NULL ELSE a.last_seen_at END,
    CASE WHEN a.med_f IS NULL OR a.med_l IS NULL THEN NULL ELSE a.med_l - a.med_f END,
    CASE WHEN (
      (a.tlc_f IS NOT NULL AND a.tlc_l IS NOT NULL AND a.tlc_l - a.tlc_f < 0)
      OR (a.tpl_f IS NOT NULL AND a.tpl_l IS NOT NULL AND a.tpl_l - a.tpl_f < 0)
      OR (a.odo_f IS NOT NULL AND a.odo_l IS NOT NULL AND a.odo_l - a.odo_f < 0)
      OR (a.hu_f IS NOT NULL AND a.hu_l IS NOT NULL AND a.hu_l - a.hu_f < 0)
      OR (a.rib_f IS NOT NULL AND a.rib_l IS NOT NULL AND a.rib_l - a.rib_f < 0)
      OR (a.med_f IS NOT NULL AND a.med_l IS NOT NULL AND a.med_l - a.med_f < 0)
    ) THEN 1 ELSE 0 END
  FROM agg a
  LEFT JOIN `printers` pf ON pf.`id` = a.f_pid
  LEFT JOIN `printers` pl ON pl.`id` = a.l_pid
  ON DUPLICATE KEY UPDATE
    `first_printer_id` = VALUES(`first_printer_id`),
    `last_printer_id` = VALUES(`last_printer_id`),
    `first_model` = VALUES(`first_model`),
    `last_model` = VALUES(`last_model`),
    `first_seen_at` = VALUES(`first_seen_at`),
    `last_seen_at` = VALUES(`last_seen_at`),
    `reading_count` = VALUES(`reading_count`),
    `lifespan_minutes` = VALUES(`lifespan_minutes`),
    `total_label_count_first` = VALUES(`total_label_count_first`),
    `total_label_count_first_at` = VALUES(`total_label_count_first_at`),
    `total_label_count_last` = VALUES(`total_label_count_last`),
    `total_label_count_last_at` = VALUES(`total_label_count_last_at`),
    `total_label_count_delta` = VALUES(`total_label_count_delta`),
    `total_print_length_first` = VALUES(`total_print_length_first`),
    `total_print_length_first_at` = VALUES(`total_print_length_first_at`),
    `total_print_length_last` = VALUES(`total_print_length_last`),
    `total_print_length_last_at` = VALUES(`total_print_length_last_at`),
    `total_print_length_delta` = VALUES(`total_print_length_delta`),
    `printhead_odometer_first` = VALUES(`printhead_odometer_first`),
    `printhead_odometer_first_at` = VALUES(`printhead_odometer_first_at`),
    `printhead_odometer_last` = VALUES(`printhead_odometer_last`),
    `printhead_odometer_last_at` = VALUES(`printhead_odometer_last_at`),
    `printhead_odometer_delta` = VALUES(`printhead_odometer_delta`),
    `head_usage_first` = VALUES(`head_usage_first`),
    `head_usage_first_at` = VALUES(`head_usage_first_at`),
    `head_usage_last` = VALUES(`head_usage_last`),
    `head_usage_last_at` = VALUES(`head_usage_last_at`),
    `head_usage_delta` = VALUES(`head_usage_delta`),
    `ribbon_length_first` = VALUES(`ribbon_length_first`),
    `ribbon_length_first_at` = VALUES(`ribbon_length_first_at`),
    `ribbon_length_last` = VALUES(`ribbon_length_last`),
    `ribbon_length_last_at` = VALUES(`ribbon_length_last_at`),
    `ribbon_length_delta` = VALUES(`ribbon_length_delta`),
    `media_length_first` = VALUES(`media_length_first`),
    `media_length_first_at` = VALUES(`media_length_first_at`),
    `media_length_last` = VALUES(`media_length_last`),
    `media_length_last_at` = VALUES(`media_length_last_at`),
    `media_length_delta` = VALUES(`media_length_delta`),
    `has_negative_delta` = VALUES(`has_negative_delta`),
    `updated_at` = NOW(3);

  COMMIT;

  -- ----------------------------------------------------------
  -- Pemeliharaan lanjutan: status head (ACTIVE/INACTIVE) ikut
  -- dihitung ulang tiap refresh — flagging tidur tak pernah telat.
  -- Param threshold NULL = default SP (3 hari / 7 hari).
  -- SP ini sudah di-COMMIT, jadi COMMIT di dalam flagger aman.
  -- ----------------------------------------------------------
  CALL `sp_flag_printhead_status`(v_filter, NULL, NULL);
END $$

DELIMITER ;



