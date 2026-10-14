CREATE TABLE `meter_readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`printer_id` int NOT NULL,
	`measured_at` timestamp NOT NULL,
	`collector_hostname` varchar(255),
	`collector_ip` varchar(45),
	`printhead_id` varchar(100),
	`total_label_count` double,
	`total_print_length` double,
	`printhead_odometer` double,
	`head_usage` double,
	`ribbon_length` double,
	`media_length` double,
	`raw_meters` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `meter_readings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `printers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`printer_id` varchar(100) NOT NULL,
	`model` varchar(100) NOT NULL,
	`ip_address` varchar(45) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `printers_id` PRIMARY KEY(`id`),
	CONSTRAINT `printer_id_uq` UNIQUE(`printer_id`)
);
--> statement-breakpoint
CREATE TABLE `printhead_benchmarks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`printhead_id` varchar(100) NOT NULL,
	`first_printer_id` int,
	`last_printer_id` int,
	`first_model` varchar(100),
	`last_model` varchar(100),
	`first_seen_at` timestamp NOT NULL,
	`last_seen_at` timestamp NOT NULL,
	`reading_count` int NOT NULL,
	`lifespan_minutes` int,
	`total_label_count_first` double,
	`total_label_count_first_at` timestamp,
	`total_label_count_last` double,
	`total_label_count_last_at` timestamp,
	`total_label_count_delta` double,
	`total_print_length_first` double,
	`total_print_length_first_at` timestamp,
	`total_print_length_last` double,
	`total_print_length_last_at` timestamp,
	`total_print_length_delta` double,
	`printhead_odometer_first` double,
	`printhead_odometer_first_at` timestamp,
	`printhead_odometer_last` double,
	`printhead_odometer_last_at` timestamp,
	`printhead_odometer_delta` double,
	`head_usage_first` double,
	`head_usage_first_at` timestamp,
	`head_usage_last` double,
	`head_usage_last_at` timestamp,
	`head_usage_delta` double,
	`ribbon_length_first` double,
	`ribbon_length_first_at` timestamp,
	`ribbon_length_last` double,
	`ribbon_length_last_at` timestamp,
	`ribbon_length_delta` double,
	`media_length_first` double,
	`media_length_first_at` timestamp,
	`media_length_last` double,
	`media_length_last_at` timestamp,
	`media_length_delta` double,
	`has_negative_delta` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `printhead_benchmarks_id` PRIMARY KEY(`id`),
	CONSTRAINT `printhead_id_uq` UNIQUE(`printhead_id`)
);
--> statement-breakpoint
ALTER TABLE `meter_readings` ADD CONSTRAINT `meter_readings_printer_id_printers_id_fk` FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `printhead_benchmarks` ADD CONSTRAINT `printhead_benchmarks_first_printer_id_printers_id_fk` FOREIGN KEY (`first_printer_id`) REFERENCES `printers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `printhead_benchmarks` ADD CONSTRAINT `printhead_benchmarks_last_printer_id_printers_id_fk` FOREIGN KEY (`last_printer_id`) REFERENCES `printers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `meter_readings_measured_at_idx` ON `meter_readings` (`measured_at`);--> statement-breakpoint
CREATE INDEX `meter_readings_printer_id_idx` ON `meter_readings` (`printer_id`);--> statement-breakpoint
CREATE INDEX `printhead_bm_last_seen_idx` ON `printhead_benchmarks` (`last_seen_at`);--> statement-breakpoint
CREATE INDEX `printhead_bm_last_printer_idx` ON `printhead_benchmarks` (`last_printer_id`);--> statement-breakpoint
CREATE INDEX `printhead_bm_updated_idx` ON `printhead_benchmarks` (`updated_at`);