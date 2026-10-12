-- ============================================================
-- ZebraMeter — MySQL EVENT: ev_refresh_printhead_benchmarks
-- ------------------------------------------------------------
-- Cron di dalam database: panggil SP agregat tiap 15 menit agar
-- tabel `printhead_benchmarks` selalu segar mengikuti collector
-- (collect-zebra.ps1 juga jalan tiap 15 menit via Task Scheduler).
--
-- Jadwal : EVERY 15 MINUTE (offset +5 menit dari jam bulat agar
--          jalan SETELAH collector menit :00/:15/:30/:45 —
--          contoh :05/:20/:35/:50).
-- Idempoten: DROP IF EXISTS + CREATE (aman dijalankan berulang).
-- SP sendiri idempoten (UPSERT per printhead_id).
--
-- Syarat: event_scheduler = ON.
--   Dev/Prod (Docker): sudah diaktifkan via --event-scheduler=ON
--     di command service mysql (lihat dev.docker-compose.yaml dan
--     docker-compose.yaml).
--   MySQL manual: SET GLOBAL event_scheduler = ON;
--     (atau tambah --event-scheduler=ON saat start mysqld).
--
-- Cek status:
--   SHOW EVENTS LIKE 'ev_refresh_printhead_benchmarks'\G
--   SELECT EVENT_SCHEMA, EVENT_NAME, STATUS, LAST_EXECUTED
--   FROM INFORMATION_SCHEMA.EVENTS
--   WHERE EVENT_NAME = 'ev_refresh_printhead_benchmarks';
--
-- Matikan sementara (tanpa hapus):
--   ALTER EVENT ev_refresh_printhead_benchmarks DISABLE;
-- Nyalakan lagi:
--   ALTER EVENT ev_refresh_printhead_benchmarks ENABLE;
-- ============================================================

DROP EVENT IF EXISTS `ev_refresh_printhead_benchmarks`;

CREATE EVENT `ev_refresh_printhead_benchmarks`
  ON SCHEDULE EVERY 15 MINUTE
  STARTS (TIMESTAMP(CURRENT_DATE, '00:05:00') + INTERVAL
    CASE
      WHEN TIME(NOW(3)) < '00:05:00' THEN 0
      ELSE TIMESTAMPDIFF(MINUTE, TIMESTAMP(CURRENT_DATE, '00:05:00'), NOW(3)) DIV 15 + 1
    END * 15 MINUTE)
  ON COMPLETION PRESERVE
  ENABLE
  COMMENT 'Refresh printhead_benchmarks via SP tiap 15 menit (offset +5 mnt setelah collector)'
DO
  CALL `sp_refresh_printhead_benchmarks`(NULL, 0);
