-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Jul 21, 2026 at 09:09 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `gym_db`
--

DELIMITER $$
--
-- Procedures
--
CREATE DEFINER=`root`@`localhost` PROCEDURE `proc_expire_enrollments` ()   BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE v_enroll_id INT;
  DECLARE v_end_date DATE;

  DECLARE cur_exp CURSOR FOR
    SELECT enrollment_id, end_date
    FROM enrollment
    WHERE end_date < CURDATE()
      AND status = 'Active';

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  OPEN cur_exp;

  exp_loop: LOOP
    FETCH cur_exp INTO v_enroll_id, v_end_date;

    IF done = 1 THEN 
      LEAVE exp_loop; 
    END IF;

    UPDATE enrollment
    SET status = 'Expired'
    WHERE enrollment_id = v_enroll_id;

    SELECT v_enroll_id AS enrollment_id,
           v_end_date AS expired_on,
           'Status set to Expired' AS action;
  END LOOP;

  CLOSE cur_exp;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `proc_member_status` ()   BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE v_member_id INT;
  DECLARE v_name VARCHAR(100);
  DECLARE v_status VARCHAR(20);

  DECLARE cur_members CURSOR FOR
    SELECT m.member_id, m.name,
           IFNULL(p.status, 'No Payment') AS status
    FROM member m
    LEFT JOIN payment p 
    ON m.member_id = p.member_id;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  OPEN cur_members;

  read_loop: LOOP
    FETCH cur_members INTO v_member_id, v_name, v_status;

    IF done = 1 THEN 
      LEAVE read_loop; 
    END IF;

    SELECT v_member_id AS member_id,
           v_name AS name,
           v_status AS member_status;
  END LOOP;

  CLOSE cur_members;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `proc_plan_revenue` ()   BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE v_plan_id INT;
  DECLARE v_plan_name VARCHAR(100);
  DECLARE v_total DECIMAL(12,2);

  DECLARE cur_plans CURSOR FOR
    SELECT mp.plan_id, mp.plan_name,
           IFNULL(SUM(p.amount), 0) AS total_revenue
    FROM membership_plan mp
    LEFT JOIN payment p 
    ON mp.plan_id = p.plan_id
    GROUP BY mp.plan_id, mp.plan_name;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  OPEN cur_plans;

  plan_loop: LOOP
    FETCH cur_plans INTO v_plan_id, v_plan_name, v_total;

    IF done = 1 THEN 
      LEAVE plan_loop; 
    END IF;

    SELECT v_plan_id AS plan_id,
           v_plan_name AS plan_name,
           v_total AS total_revenue_collected;
  END LOOP;

  CLOSE cur_plans;
END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `attendance`
--

CREATE TABLE `attendance` (
  `attendance_id` int(11) NOT NULL,
  `date` date DEFAULT NULL,
  `status` varchar(20) DEFAULT NULL,
  `member_id` int(11) DEFAULT NULL,
  `class_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `attendance`
--

INSERT INTO `attendance` (`attendance_id`, `date`, `status`, `member_id`, `class_id`) VALUES
(1, '2026-03-01', 'Present', 1, 1),
(2, '2026-03-02', 'Present', 2, 2),
(3, '2026-03-03', 'Absent', 3, 2);

-- --------------------------------------------------------

--
-- Table structure for table `branch`
--

CREATE TABLE `branch` (
  `branch_id` int(11) NOT NULL,
  `gym_id` int(11) DEFAULT NULL,
  `branch_name` varchar(50) DEFAULT NULL,
  `phone` varchar(15) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `branch`
--

INSERT INTO `branch` (`branch_id`, `gym_id`, `branch_name`, `phone`) VALUES
(1, 1, 'Dwarka Branch', '8888888888'),
(2, 1, 'Janakpuri', '8881111111'),
(3, 2, 'Andheri', '8882222222');

-- --------------------------------------------------------

--
-- Table structure for table `class`
--

CREATE TABLE `class` (
  `class_id` int(11) NOT NULL,
  `branch_id` int(11) DEFAULT NULL,
  `gym_id` int(11) DEFAULT NULL,
  `capacity` int(11) DEFAULT 25
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `class`
--

INSERT INTO `class` (`class_id`, `branch_id`, `gym_id`, `capacity`) VALUES
(1, 1, 1, 20),
(2, 1, 1, 25),
(3, 2, 2, 25);

-- --------------------------------------------------------

--
-- Table structure for table `class_enrollment`
--

CREATE TABLE `class_enrollment` (
  `class_enrollment_id` int(11) NOT NULL,
  `enrollment_date` date DEFAULT NULL,
  `member_id` int(11) DEFAULT NULL,
  `class_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `class_enrollment`
--

INSERT INTO `class_enrollment` (`class_enrollment_id`, `enrollment_date`, `member_id`, `class_id`) VALUES
(1, '2026-01-02', 1, 1),
(2, '2026-02-02', 2, 2),
(3, '2026-03-05', 3, 2);

--
-- Triggers `class_enrollment`
--
DELIMITER $$
CREATE TRIGGER `trg_check_class_capacity` BEFORE INSERT ON `class_enrollment` FOR EACH ROW BEGIN
  DECLARE current_count INT;
  DECLARE max_capacity INT;

  SELECT COUNT(*) INTO current_count
  FROM class_enrollment
  WHERE class_id = NEW.class_id;

  SELECT capacity INTO max_capacity
  FROM class
  WHERE class_id = NEW.class_id;

  IF current_count >= max_capacity THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Class is full';
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `enrollment`
--

CREATE TABLE `enrollment` (
  `enrollment_id` int(11) NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `plan_id` int(11) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'Active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `enrollment`
--

INSERT INTO `enrollment` (`enrollment_id`, `start_date`, `end_date`, `plan_id`, `status`) VALUES
(1, '2026-01-01', '2026-06-01', 1, ''),
(2, '2026-02-01', '2026-07-01', 2, ''),
(3, '2026-03-01', '2026-09-01', 3, '');

-- --------------------------------------------------------

--
-- Table structure for table `gym`
--

CREATE TABLE `gym` (
  `gym_id` int(11) NOT NULL,
  `gym_name` varchar(50) DEFAULT NULL,
  `address` varchar(100) DEFAULT NULL,
  `contact_no` varchar(15) DEFAULT NULL,
  `email` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `gym`
--

INSERT INTO `gym` (`gym_id`, `gym_name`, `address`, `contact_no`, `email`) VALUES
(1, 'FitZone', 'Delhi', '9999999999', 'fitzone@gmail.com'),
(2, 'PowerHouse', 'Mumbai', '9123456780', 'power@gmail.com');

-- --------------------------------------------------------

--
-- Table structure for table `locker`
--

CREATE TABLE `locker` (
  `locker_id` int(11) NOT NULL,
  `branch_id` int(11) DEFAULT NULL,
  `locker_number` int(11) DEFAULT NULL,
  `locker_status` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `locker`
--

INSERT INTO `locker` (`locker_id`, `branch_id`, `locker_number`, `locker_status`) VALUES
(1, 1, 101, 'Available'),
(2, 1, 102, 'Occupied'),
(3, 2, 201, 'Available');

-- --------------------------------------------------------

--
-- Table structure for table `member`
--

CREATE TABLE `member` (
  `member_id` int(11) NOT NULL,
  `branch_id` int(11) DEFAULT NULL,
  `name` varchar(50) DEFAULT NULL,
  `gender` varchar(10) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `phone` varchar(15) DEFAULT NULL,
  `email` varchar(50) DEFAULT NULL,
  `address` varchar(100) DEFAULT NULL,
  `gym_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `member`
--

INSERT INTO `member` (`member_id`, `branch_id`, `name`, `gender`, `date_of_birth`, `phone`, `email`, `address`, `gym_id`) VALUES
(1, 2, 'Rohan', 'Male', '2000-08-20', '9123456780', 'rohan@gmail.com', 'Mumbai', 2),
(2, 1, 'Rohit', 'Male', '2001-02-10', '6661111111', 'rohit@gmail.com', 'Delhi', 1),
(3, 2, 'Priya', 'Female', '2003-08-15', '6662222222', 'priya@gmail.com', 'Mumbai', 2),
(4, 2, 'Karan', 'Male', '2000-12-20', '6663333333', 'karan@gmail.com', 'Mumbai', 2),
(5, 1, 'Neha', 'Female', '2002-07-12', '9991111111', 'neha@gmail.com', 'Delhi', 1),
(6, 1, 'Sahil', 'Male', '2001-03-22', '9992222222', 'sahil@gmail.com', 'Delhi', 1),
(7, 2, 'Ankit', 'Male', '1999-11-10', '9993333333', 'ankit@gmail.com', 'Mumbai', 2),
(20, 1, 'Rohit Sharma', 'Male', '2001-05-15', '9876543210', 'rohit.sharma@gmail.com', 'Delhi', 1),
(30, 2, 'Nikhil', 'Male', '2000-08-20', '9123456780', 'nikhil@gmail.com', 'Mumbai', 2);

-- --------------------------------------------------------

--
-- Table structure for table `membership`
--

CREATE TABLE `membership` (
  `membership_id` int(11) NOT NULL,
  `plan_id` int(11) DEFAULT NULL,
  `class_name` varchar(50) DEFAULT NULL,
  `schedule` varchar(50) DEFAULT NULL,
  `trainer_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `membership`
--

INSERT INTO `membership` (`membership_id`, `plan_id`, `class_name`, `schedule`, `trainer_id`) VALUES
(1, 1, 'Morning Fitness', '6AM-8AM', 1),
(2, 2, 'Evening Fitness', '6PM-8PM', 2),
(3, 3, 'Advanced Training', '7AM-9AM', 3);

-- --------------------------------------------------------

--
-- Table structure for table `membership_plan`
--

CREATE TABLE `membership_plan` (
  `plan_id` int(11) NOT NULL,
  `plan_name` varchar(50) DEFAULT NULL,
  `branch_id` int(11) DEFAULT NULL,
  `fee` decimal(10,2) NOT NULL,
  `Description` varchar(100) DEFAULT NULL,
  `duration` int(11) DEFAULT NULL
) ;

--
-- Dumping data for table `membership_plan`
--

INSERT INTO `membership_plan` (`plan_id`, `plan_name`, `branch_id`, `fee`, `Description`, `duration`) VALUES
(1, 'Gold Plan', 1, 3000.00, NULL, 30),
(2, 'Silver Plan', 1, 5000.00, NULL, 60),
(3, 'Platinum Plan', 2, 9000.00, NULL, 90),
(402, 'Quarterly Plan', 1, 5000.00, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `member_1nf`
--

CREATE TABLE `member_1nf` (
  `member_id` int(11) NOT NULL,
  `member_name` varchar(50) NOT NULL,
  `plan` varchar(50) NOT NULL,
  `trainer` varchar(50) NOT NULL,
  `payment` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `member_1nf`
--

INSERT INTO `member_1nf` (`member_id`, `member_name`, `plan`, `trainer`, `payment`) VALUES
(1, 'Aman', 'Gold', 'Rahul', 5000),
(1, 'Aman', 'Silver', 'Arjun', 1000);

-- --------------------------------------------------------

--
-- Table structure for table `member_2nf`
--

CREATE TABLE `member_2nf` (
  `member_id` int(11) NOT NULL,
  `member_name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `member_2nf`
--

INSERT INTO `member_2nf` (`member_id`, `member_name`) VALUES
(1, 'Aman');

-- --------------------------------------------------------

--
-- Table structure for table `member_plan_2nf`
--

CREATE TABLE `member_plan_2nf` (
  `member_id` int(11) NOT NULL,
  `plan` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `member_plan_2nf`
--

INSERT INTO `member_plan_2nf` (`member_id`, `plan`) VALUES
(1, 'Gold'),
(1, 'Silver'),
(20, 'Gold');

-- --------------------------------------------------------

--
-- Table structure for table `payment`
--

CREATE TABLE `payment` (
  `payment_id` int(11) NOT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `payment_mode` varchar(20) DEFAULT NULL,
  `status` varchar(20) DEFAULT NULL,
  `member_id` int(11) DEFAULT NULL,
  `plan_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `payment`
--

INSERT INTO `payment` (`payment_id`, `amount`, `payment_mode`, `status`, `member_id`, `plan_id`) VALUES
(1, 5000.00, 'UPI', 'Paid', 1, 1),
(2, 3000.00, 'Cash', 'Paid', 2, 2),
(3, 7000.00, 'Card', 'Pending', 3, 3),
(4, 9000.00, 'UPI', 'Paid', 4, 3),
(5, 4000.00, 'Cash', 'Paid', 2, 1),
(6, 8000.00, 'UPI', 'Paid', 3, 2),
(7, 2000.00, 'Card', 'Pending', 5, 1),
(200, 6000.00, NULL, NULL, 20, NULL),
(902, 5000.00, 'Cash', 'Paid', 1, 1);

--
-- Triggers `payment`
--
DELIMITER $$
CREATE TRIGGER `trg_payment_audit` AFTER INSERT ON `payment` FOR EACH ROW INSERT INTO payment_audit
(payment_id, member_id, amount, action_time, action_type)
VALUES
(NEW.payment_id, NEW.member_id, NEW.amount, NOW(), 'INSERT')
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `payment_audit`
--

CREATE TABLE `payment_audit` (
  `audit_id` int(11) NOT NULL,
  `payment_id` int(11) DEFAULT NULL,
  `member_id` int(11) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `action_time` datetime DEFAULT NULL,
  `action_type` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `payment_audit`
--

INSERT INTO `payment_audit` (`audit_id`, `payment_id`, `member_id`, `amount`, `action_time`, `action_type`) VALUES
(1, 902, 1, 5000.00, '2026-03-20 01:50:56', 'INSERT'),
(2, 200, 20, 5000.00, '2026-04-15 01:47:51', 'INSERT'),
(3, 200, 20, 5000.00, '2026-04-15 02:07:16', 'INSERT');

-- --------------------------------------------------------

--
-- Table structure for table `plan_2nf`
--

CREATE TABLE `plan_2nf` (
  `plan` varchar(50) NOT NULL,
  `trainer` varchar(50) NOT NULL,
  `payment` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `plan_2nf`
--

INSERT INTO `plan_2nf` (`plan`, `trainer`, `payment`) VALUES
('Gold', 'Rahul', 5000),
('Silver', 'Arjun', 1000);

-- --------------------------------------------------------

--
-- Table structure for table `trainer`
--

CREATE TABLE `trainer` (
  `trainer_id` int(11) NOT NULL,
  `name` varchar(50) DEFAULT NULL,
  `specialization` varchar(50) DEFAULT NULL,
  `phone` varchar(15) DEFAULT NULL,
  `email` varchar(50) DEFAULT NULL,
  `experience` int(11) DEFAULT NULL,
  `gym_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `trainer`
--

INSERT INTO `trainer` (`trainer_id`, `name`, `specialization`, `phone`, `email`, `experience`, `gym_id`) VALUES
(1, 'Rahul', 'Weight Training', '7777777777', 'rahul@gmail.com', 5, 1),
(2, 'Arjun', 'Cardio', '7771111111', 'arjun@gmail.com', 3, 1),
(3, 'Vikram', 'Crossfit', '7772222222', 'vikram@gmail.com', 7, 2);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vw_active_members`
-- (See below for the actual view)
--
CREATE TABLE `vw_active_members` (
`member_id` int(11)
,`name` varchar(50)
,`phone` varchar(15)
,`email` varchar(50)
,`plan_name` varchar(50)
,`fee` decimal(10,2)
,`status` varchar(20)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vw_gym_payment_summary`
-- (See below for the actual view)
--
CREATE TABLE `vw_gym_payment_summary` (
`gym_id` int(11)
,`gym_name` varchar(50)
,`total_transactions` bigint(21)
,`total_revenue` decimal(32,2)
,`avg_payment` decimal(14,6)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vw_trainer_workload`
-- (See below for the actual view)
--
CREATE TABLE `vw_trainer_workload` (
`trainer_id` int(11)
,`name` varchar(50)
,`specialization` varchar(50)
,`schedules_assigned` bigint(21)
,`memberships_assigned` bigint(21)
);

-- --------------------------------------------------------

--
-- Table structure for table `workout_schedule`
--

CREATE TABLE `workout_schedule` (
  `schedule_id` int(11) NOT NULL,
  `time` varchar(20) DEFAULT NULL,
  `member_id` int(11) DEFAULT NULL,
  `trainer_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `workout_schedule`
--

INSERT INTO `workout_schedule` (`schedule_id`, `time`, `member_id`, `trainer_id`) VALUES
(1, '7AM', 1, 1),
(2, '6AM', 2, 2),
(3, '8AM', 3, 3);

-- --------------------------------------------------------

--
-- Structure for view `vw_active_members`
--
DROP TABLE IF EXISTS `vw_active_members`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_active_members`  AS SELECT `m`.`member_id` AS `member_id`, `m`.`name` AS `name`, `m`.`phone` AS `phone`, `m`.`email` AS `email`, `mp`.`plan_name` AS `plan_name`, `mp`.`fee` AS `fee`, `p`.`status` AS `status` FROM ((`member` `m` join `payment` `p` on(`m`.`member_id` = `p`.`member_id`)) join `membership_plan` `mp` on(`p`.`plan_id` = `mp`.`plan_id`)) WHERE `p`.`status` = 'Paid' ;

-- --------------------------------------------------------

--
-- Structure for view `vw_gym_payment_summary`
--
DROP TABLE IF EXISTS `vw_gym_payment_summary`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_gym_payment_summary`  AS SELECT `g`.`gym_id` AS `gym_id`, `g`.`gym_name` AS `gym_name`, count(`p`.`payment_id`) AS `total_transactions`, sum(`p`.`amount`) AS `total_revenue`, avg(`p`.`amount`) AS `avg_payment` FROM (((`gym` `g` left join `branch` `b` on(`g`.`gym_id` = `b`.`gym_id`)) left join `member` `m` on(`b`.`branch_id` = `m`.`branch_id`)) left join `payment` `p` on(`m`.`member_id` = `p`.`member_id`)) GROUP BY `g`.`gym_id`, `g`.`gym_name` ;

-- --------------------------------------------------------

--
-- Structure for view `vw_trainer_workload`
--
DROP TABLE IF EXISTS `vw_trainer_workload`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_trainer_workload`  AS SELECT `t`.`trainer_id` AS `trainer_id`, `t`.`name` AS `name`, `t`.`specialization` AS `specialization`, count(distinct `ws`.`schedule_id`) AS `schedules_assigned`, count(distinct `m`.`membership_id`) AS `memberships_assigned` FROM ((`trainer` `t` left join `workout_schedule` `ws` on(`t`.`trainer_id` = `ws`.`trainer_id`)) left join `membership` `m` on(`t`.`trainer_id` = `m`.`trainer_id`)) GROUP BY `t`.`trainer_id`, `t`.`name`, `t`.`specialization` ;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `attendance`
--
ALTER TABLE `attendance`
  ADD PRIMARY KEY (`attendance_id`),
  ADD KEY `member_id` (`member_id`),
  ADD KEY `class_id` (`class_id`);

--
-- Indexes for table `branch`
--
ALTER TABLE `branch`
  ADD PRIMARY KEY (`branch_id`),
  ADD KEY `gym_id` (`gym_id`);

--
-- Indexes for table `class`
--
ALTER TABLE `class`
  ADD PRIMARY KEY (`class_id`),
  ADD KEY `branch_id` (`branch_id`),
  ADD KEY `gym_id` (`gym_id`);

--
-- Indexes for table `class_enrollment`
--
ALTER TABLE `class_enrollment`
  ADD PRIMARY KEY (`class_enrollment_id`),
  ADD KEY `member_id` (`member_id`),
  ADD KEY `class_id` (`class_id`);

--
-- Indexes for table `enrollment`
--
ALTER TABLE `enrollment`
  ADD PRIMARY KEY (`enrollment_id`),
  ADD KEY `plan_id` (`plan_id`);

--
-- Indexes for table `gym`
--
ALTER TABLE `gym`
  ADD PRIMARY KEY (`gym_id`);

--
-- Indexes for table `locker`
--
ALTER TABLE `locker`
  ADD PRIMARY KEY (`locker_id`),
  ADD KEY `branch_id` (`branch_id`);

--
-- Indexes for table `member`
--
ALTER TABLE `member`
  ADD PRIMARY KEY (`member_id`),
  ADD KEY `branch_id` (`branch_id`),
  ADD KEY `gym_id` (`gym_id`);

--
-- Indexes for table `membership`
--
ALTER TABLE `membership`
  ADD PRIMARY KEY (`membership_id`),
  ADD KEY `plan_id` (`plan_id`),
  ADD KEY `trainer_id` (`trainer_id`);

--
-- Indexes for table `membership_plan`
--
ALTER TABLE `membership_plan`
  ADD PRIMARY KEY (`plan_id`),
  ADD KEY `branch_id` (`branch_id`);

--
-- Indexes for table `member_1nf`
--
ALTER TABLE `member_1nf`
  ADD PRIMARY KEY (`member_id`,`plan`);

--
-- Indexes for table `member_2nf`
--
ALTER TABLE `member_2nf`
  ADD PRIMARY KEY (`member_id`);

--
-- Indexes for table `member_plan_2nf`
--
ALTER TABLE `member_plan_2nf`
  ADD PRIMARY KEY (`member_id`,`plan`);

--
-- Indexes for table `payment`
--
ALTER TABLE `payment`
  ADD PRIMARY KEY (`payment_id`),
  ADD KEY `member_id` (`member_id`),
  ADD KEY `plan_id` (`plan_id`);

--
-- Indexes for table `payment_audit`
--
ALTER TABLE `payment_audit`
  ADD PRIMARY KEY (`audit_id`);

--
-- Indexes for table `plan_2nf`
--
ALTER TABLE `plan_2nf`
  ADD PRIMARY KEY (`plan`);

--
-- Indexes for table `trainer`
--
ALTER TABLE `trainer`
  ADD PRIMARY KEY (`trainer_id`),
  ADD UNIQUE KEY `uq_trainer_email` (`email`),
  ADD KEY `gym_id` (`gym_id`);

--
-- Indexes for table `workout_schedule`
--
ALTER TABLE `workout_schedule`
  ADD PRIMARY KEY (`schedule_id`),
  ADD KEY `trainer_id` (`trainer_id`),
  ADD KEY `fk_ws_member` (`member_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `attendance`
--
ALTER TABLE `attendance`
  MODIFY `attendance_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `branch`
--
ALTER TABLE `branch`
  MODIFY `branch_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `class`
--
ALTER TABLE `class`
  MODIFY `class_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=501;

--
-- AUTO_INCREMENT for table `class_enrollment`
--
ALTER TABLE `class_enrollment`
  MODIFY `class_enrollment_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `enrollment`
--
ALTER TABLE `enrollment`
  MODIFY `enrollment_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `gym`
--
ALTER TABLE `gym`
  MODIFY `gym_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `locker`
--
ALTER TABLE `locker`
  MODIFY `locker_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `member`
--
ALTER TABLE `member`
  MODIFY `member_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=31;

--
-- AUTO_INCREMENT for table `membership`
--
ALTER TABLE `membership`
  MODIFY `membership_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `membership_plan`
--
ALTER TABLE `membership_plan`
  MODIFY `plan_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payment`
--
ALTER TABLE `payment`
  MODIFY `payment_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=903;

--
-- AUTO_INCREMENT for table `payment_audit`
--
ALTER TABLE `payment_audit`
  MODIFY `audit_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `trainer`
--
ALTER TABLE `trainer`
  MODIFY `trainer_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=51;

--
-- AUTO_INCREMENT for table `workout_schedule`
--
ALTER TABLE `workout_schedule`
  MODIFY `schedule_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `attendance`
--
ALTER TABLE `attendance`
  ADD CONSTRAINT `attendance_ibfk_1` FOREIGN KEY (`member_id`) REFERENCES `member` (`member_id`),
  ADD CONSTRAINT `attendance_ibfk_2` FOREIGN KEY (`class_id`) REFERENCES `class` (`class_id`);

--
-- Constraints for table `branch`
--
ALTER TABLE `branch`
  ADD CONSTRAINT `branch_ibfk_1` FOREIGN KEY (`gym_id`) REFERENCES `gym` (`gym_id`);

--
-- Constraints for table `class`
--
ALTER TABLE `class`
  ADD CONSTRAINT `class_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branch` (`branch_id`),
  ADD CONSTRAINT `class_ibfk_2` FOREIGN KEY (`gym_id`) REFERENCES `gym` (`gym_id`);

--
-- Constraints for table `class_enrollment`
--
ALTER TABLE `class_enrollment`
  ADD CONSTRAINT `class_enrollment_ibfk_1` FOREIGN KEY (`member_id`) REFERENCES `member` (`member_id`),
  ADD CONSTRAINT `class_enrollment_ibfk_2` FOREIGN KEY (`class_id`) REFERENCES `class` (`class_id`);

--
-- Constraints for table `enrollment`
--
ALTER TABLE `enrollment`
  ADD CONSTRAINT `enrollment_ibfk_1` FOREIGN KEY (`plan_id`) REFERENCES `membership_plan` (`plan_id`);

--
-- Constraints for table `locker`
--
ALTER TABLE `locker`
  ADD CONSTRAINT `locker_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branch` (`branch_id`);

--
-- Constraints for table `member`
--
ALTER TABLE `member`
  ADD CONSTRAINT `member_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branch` (`branch_id`),
  ADD CONSTRAINT `member_ibfk_2` FOREIGN KEY (`gym_id`) REFERENCES `gym` (`gym_id`);

--
-- Constraints for table `membership`
--
ALTER TABLE `membership`
  ADD CONSTRAINT `membership_ibfk_1` FOREIGN KEY (`plan_id`) REFERENCES `membership_plan` (`plan_id`),
  ADD CONSTRAINT `membership_ibfk_2` FOREIGN KEY (`trainer_id`) REFERENCES `trainer` (`trainer_id`);

--
-- Constraints for table `membership_plan`
--
ALTER TABLE `membership_plan`
  ADD CONSTRAINT `membership_plan_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branch` (`branch_id`);

--
-- Constraints for table `payment`
--
ALTER TABLE `payment`
  ADD CONSTRAINT `payment_ibfk_1` FOREIGN KEY (`member_id`) REFERENCES `member` (`member_id`),
  ADD CONSTRAINT `payment_ibfk_2` FOREIGN KEY (`plan_id`) REFERENCES `membership_plan` (`plan_id`);

--
-- Constraints for table `trainer`
--
ALTER TABLE `trainer`
  ADD CONSTRAINT `trainer_ibfk_1` FOREIGN KEY (`gym_id`) REFERENCES `gym` (`gym_id`);

--
-- Constraints for table `workout_schedule`
--
ALTER TABLE `workout_schedule`
  ADD CONSTRAINT `fk_ws_member` FOREIGN KEY (`member_id`) REFERENCES `member` (`member_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `workout_schedule_ibfk_2` FOREIGN KEY (`trainer_id`) REFERENCES `trainer` (`trainer_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
