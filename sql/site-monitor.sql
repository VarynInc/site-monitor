CREATE DATABASE IF NOT EXISTS site_monitor;
USE site_monitor;

DROP TABLE IF EXISTS monitor_sites;
CREATE TABLE IF NOT EXISTS monitor_sites(
  monitor_site_id INT (11) NOT null AUTO_INCREMENT,
  site_name varchar (80) NOT null,
  site_url varchar (255) NOT null,
  search_token varchar(80) NOT NULL,
  max_response_time int NOT NULL DEFAULT 0,
  active int NOT NULL DEFAULT 1,
  PRIMARY KEY (monitor_site_id),
  UNIQUE INDEX site_name_ndx (site_name))
ENGINE = INNODB
CHARACTER SET utf8
COLLATE utf8_general_ci;

DROP TABLE IF EXISTS monitor_samples;
CREATE TABLE IF NOT EXISTS monitor_samples(
  monitor_sample_id INT (11) NOT null AUTO_INCREMENT,
  site_name varchar (80) NOT null,
  sample_type varchar(10) NOT NULL DEFAULT "sample", -- [sample, hourly, daily, weekly, monthly]
  sample_time timestamp NOT null,
  response_time int NOT NULL,
  status_code int NOT NULL,
  error_code varchar(20) NOT NULL DEFAULT "OK",
  error_message varchar(500) NULL DEFAULT NULL,
  sample_data varchar(500) NULL DEFAULT NULL,
  PRIMARY KEY (monitor_sample_id),
  INDEX site_time_ndx (site_name, sample_time))
ENGINE = INNODB
CHARACTER SET utf8
COLLATE utf8_general_ci;

-- Queries
SELECT MAX(sample_time), MIN(response_time), MAX(response_time), AVG(response_time), COUNT(*) FROM monitor_samples WHERE site_name="Varyn";
