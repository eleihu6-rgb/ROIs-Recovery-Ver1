-- CQF 6001
INSERT INTO `cqf` (id, `function`, `instance`, class, description, reference, category, store_structure, source, detail_display, filiale, division, owner, locked, modified_by, last_modified) VALUES(6001001, 6001, '001', 'Q', 'Roster Fairness Control-BH+DO', 'Roster', 'Fairness', 'Table', 'General', NULL, 'PI', 'P', 'S', '', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200000, 6001001, 1, 'tableHeader', 'Selected,Criteria,SubCriteria,Lower Range,Target,Upper Range,Weight(1-10),Historical Period(0-12 Months)', '', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200001, 6001001, 1, 'tableRow1', 'Y,Total Flying Hour,,,,,10,1', '', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200002, 6001001, 1, 'tableRow2', 'Y,Days Off,,,,,10,0', '', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200003, 6001001, 1, 'tableRow3', 'N,Fatigue,,,,,6,3', '', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200004, 6001001, 1, 'tableRow4', 'N,Layover,,,,,5,0', '', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200005, 6001001, 1, 'tableRow5', 'N,Credit Hour,,,,,4,5', '', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200006, 6001001, 1, 'tableRow6', 'N,Per-diem,,,,,4,0', '', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200022, 6001001, 1, 'tableRow7', 'Y,AssignmentFairness,IsBlankDayCount:N;Assignments:SBY,0,1,2,3,1', '', CURRENT_TIMESTAMP);


-- CQF 6002
INSERT INTO `cqf` (id, `function`, `instance`, class, description, reference, category, store_structure, source, detail_display, filiale, division, owner, locked, modified_by, last_modified) VALUES(6002001, 6002, '001', 'Q', 'Roster Fatigue Control', 'Roster', 'Fairness', 'Table', 'General', NULL, 'PI', 'P', 'S', '', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200007, 6002001, 1, 'tableHeader', 'Selected,Criteria,ID,InitialFilterName,InitialFilterParam,EntityMatchMark,PropertyExtractorName,CalculationMethod,AdditionalFilterNames,AdditionalFilterParams,AdditionalExtractorNames,ComponentIds,Target,Weight(1-10)', ' ', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200008, 6002001, 1, 'tableRow1', 'Y,Total Credit Hour,1,AirCrewFilter,Rank:FCN,AirCrew,AirCrewCreditPropertyExtractor,StandardDeviationPopulation,*,*,*,*,80,10', ' ', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200009, 6002001, 1, 'tableRow10', 'Y,Total Credit Hour,13,AirCrewFilter,Rank:*,AirCrew,AirCrewCreditPropertyExtractor,ForwardDifference,*,*,*,10+11,Y:10,10', ' ', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200010, 6002001, 1, 'tableRow11', 'Y,Total Credit Hour,9,AirCrewFilter,Rank:*,AirCrew,AirCrewCreditPropertyExtractor,ForwardDifference,*,*,*,6+7,Y:10,10', ' ', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200011, 6002001, 1, 'tableRow12', 'Y,Total Credit Hour,14,AirCrewFilter,Rank:*,AirCrew,AirCrewCreditPropertyExtractor,ForwardDifference,*,*,*,11+12,Y:10,10', ' ', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200012, 6002001, 1, 'tableRow13', 'Y,Total Credit Hour,4,AirCrewFilter,Rank:SFO|FFO,AirCrew,AirCrewCreditPropertyExtractor,Range,*,*,*,*,80,10', ' ', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200013, 6002001, 1, 'tableRow14', 'Y,Total Credit Hour,3,AirCrewFilter,Rank:FCN,AirCrew,AirCrewCreditPropertyExtractor,Range,*,*,*,*,80,10', ' ', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200014, 6002001, 1, 'tableRow2', 'Y,Total Credit Hour,5,AirCrewFilter,Rank:FCN+Fleet:777+Team:MGMT,AirCrew,AirCrewCreditPropertyExtractor,ArithmeticMean,*,*,*,*,80,0', ' ', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200015, 6002001, 1, 'tableRow3', 'Y,Total Credit Hour,10,AirCrewFilter,Rank:FCN+Fleet:330+Team:MGMT,AirCrew,AirCrewCreditPropertyExtractor,ArithmeticMean,*,*,*,*,80,0', ' ', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200016, 6002001, 1, 'tableRow4', 'Y,Total Credit Hour,2,AirCrewFilter,Rank:SFO|FFO,AirCrew,AirCrewCreditPropertyExtractor,StandardDeviationPopulation,*,*,*,*,80,10', ' ', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200017, 6002001, 1, 'tableRow5', 'Y,Total Credit Hour,6,AirCrewFilter,Rank:FCN+Fleet:777+Team:IPCK,AirCrew,AirCrewCreditPropertyExtractor,ArithmeticMean,*,*,*,*,80,0', ' ', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200018, 6002001, 1, 'tableRow6', 'Y,Total Credit Hour,11,AirCrewFilter,Rank:FCN+Fleet:330+Team:IPCK,AirCrew,AirCrewCreditPropertyExtractor,ArithmeticMean,*,*,*,*,80,0', ' ', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200019, 6002001, 1, 'tableRow7', 'Y,Total Credit Hour,7,AirCrewFilter,Rank:FCN+Fleet:777+Team:777_FCN_PURE,AirCrew,AirCrewCreditPropertyExtractor,ArithmeticMean,*,*,*,*,80,0', ' ', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200020, 6002001, 1, 'tableRow8', 'Y,Total Credit Hour,12,AirCrewFilter,Rank:FCN+Fleet:330+Team:330_FCN_PURE,AirCrew,AirCrewCreditPropertyExtractor,ArithmeticMean,*,*,*,*,80,0', ' ', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200021, 6002001, 1, 'tableRow9', 'Y,Total Credit Hour,8,AirCrewFilter,Rank:*,AirCrew,AirCrewCreditPropertyExtractor,ForwardDifference,*,*,*,5+6,Y:10,10', ' ', CURRENT_TIMESTAMP);

-- CQF 6003
INSERT INTO `cqf` (id, `function`, `instance`, class, description, reference, category, store_structure, source, detail_display, filiale, division, owner, locked, modified_by, last_modified) VALUES(6003001, 6003, '001', 'Q', 'FillBlankDay with Ground Duty', 'Roster', 'Fairness', 'Table', 'General', NULL, 'PI', 'P', 'S', '', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200022, 6003001, 1, 'tableHeader', 'Min Start Time,Max End Time,Min Length,Max Length,Shift Unit,Assignment Code,Assignment Group Code', '', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200023, 6003001, 1, 'tableRow1', '0,1439,1439,1439,0,DO,DO,N', '', CURRENT_TIMESTAMP);

-- CQF 6004
INSERT INTO `cqf` (id, `function`, `instance`, class, description, reference, category, store_structure, source, detail_display, filiale, division, owner, locked, modified_by, last_modified) VALUES(6004001, 6004, '001', 'Q', 'Pattern Dis Fairness-EVA-2', 'Roster', 'Fairness', 'Table', 'General', NULL, 'PI', 'P', 'S', '', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200024, 6004001, 1, 'tableHeader', 'Bases,CrewIds,MinSpacingPeriod,MinTransitionTime,BoundInitial,AdjacentDefinitionTime,Weight', '', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200025, 6004001, 1, 'tableRow1', ',,,,,,1', '', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200026, 6004001, 1, 'tableRow2', 'A,2,1,S', '', CURRENT_TIMESTAMP);

-- CQF 6005
INSERT INTO `cqf` (id, `function`, `instance`, class, description, reference, category, store_structure, source, detail_display, filiale, division, owner, locked, modified_by, last_modified) VALUES(6005001, 6005, '001', 'Q', 'Crew Duty Preference', 'Roster', 'Fairness', 'Table', 'General', NULL, 'PI', 'P', 'S', '', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200027, 6005001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Nationalities,Crew Teams,Preferred Pairing Attributes,Index', '', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200028, 6005001, 1, 'tableRow1', '*,*,*,CN,*,A,1', '', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200029, 6005001, 1, 'tableRow2', '*,*,*,Expat,*,E,1', '', CURRENT_TIMESTAMP);

-- CQF 5107
INSERT INTO `cqf` (id, `function`, `instance`, class, description, reference, category, store_structure, source, detail_display, filiale, division, owner, locked, modified_by, last_modified) VALUES(5107001, 5107, '001', 'C', 'Off-Duty-Period Cost', 'Pairing', 'Cost', 'Table', 'General', 'Off-Duty-Period Cost', 'PI', 'P', 'U', '', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200030, 5107001, 1, 'tableHeader', 'First Duty Type,Second Duty Type,Layover Stations,Bidirectional,Off-Duty-Period Threshold Minutes,Off-Duty-Period Lower Minutes,Off-Duty-Period Upper Minutes,Fixed Cost,Variable Cost Per Minute Beyond Threshold,Power,Off-Duty-Period Lower Local Nights,Off-Duty-Period Upper Local Nights,Off-Duty-Period Threshold Local Nights,Threshold Inclusive,Minutes Local Nights Operator', '', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200031, 5107001, 1, 'tableRow1', '*,*,*,Y,0,*,*,0,0,1,*,*,*,N,AND', '', CURRENT_TIMESTAMP);

-- CQF 5113
INSERT INTO `cqf` (id, `function`, `instance`, class, description, reference, category, store_structure, source, detail_display, filiale, division, owner, locked, modified_by, last_modified) VALUES(5113001, 5113, '001', 'C', 'Uncovered Segment Cost', 'Pairing', 'Cost', 'Table', 'General', 'Uncovered Segment Cost', 'PI', 'P', 'U', '', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200032, 5113001, 1, 'tableHeader', 'Segment Departure,Segment Arrival,Segment Airline,Segment Flight Number,Cost', '', CURRENT_TIMESTAMP);
INSERT INTO `cqf_parameter` (id, cqf_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES(200033, 5113001, 1, 'tableRow1', '*,*,*,*,100000', '', CURRENT_TIMESTAMP);

-- id max 200033
