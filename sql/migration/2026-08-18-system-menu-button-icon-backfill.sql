-- Backfill Lucide icon names for button rows stored in system_menu.
UPDATE system_menu
SET icon = CASE
  WHEN menu_code IN ('BTN_ADD', 'BTN_ADD_RULES', 'BTN_ADD_TO_SET', 'BTN_NEW_RULESET', 'SCENARIO_NEW', 'LIVE_CREATE_GROUND', 'LIVE_FLIGHT_CREATE_PAIRING') THEN 'Plus'
  WHEN menu_code IN ('BTN_EDIT', 'BTN_EDIT_META', 'BTN_EDIT_PARAM', 'BTN_EDIT_SCHEDULE', 'LIVE_CM_EDIT_GROUND', 'LIVE_CM_EDIT_MEMO', 'LIVE_CM_EDIT_TASK', 'SCENARIO_RENAME') THEN 'Pencil'
  WHEN menu_code IN ('BTN_DELETE', 'BTN_REMOVE_RULE', 'LIVE_DELETE', 'LIVE_PAIRING_DELETE', 'SCENARIO_DELETE', 'SCENARIO_REMOVE_RESULT') THEN 'Trash2'
  WHEN menu_code IN ('BTN_COPY', 'SCENARIO_DUPLICATE') THEN 'Copy'
  WHEN menu_code IN ('BTN_REFRESH', 'LIVE_REFRESH') THEN 'RefreshCw'
  WHEN menu_code IN ('BTN_SAVE', 'LIVE_SAVE', 'SCENARIO_SAVE') THEN 'Save'
  WHEN menu_code IN ('LIVE_LOCK', 'SCENARIO_LOCK') THEN 'Lock'
  WHEN menu_code = 'BTN_ENABLE' THEN 'Unlock'
  WHEN menu_code = 'BTN_DISABLE' THEN 'Ban'
  WHEN menu_code IN ('BTN_IMPORT', 'SCENARIO_IMPORT_PBS', 'SCENARIO_IMPORT_S3') THEN 'Upload'
  WHEN menu_code IN ('BTN_EXPORT', 'SCENARIO_EXPORT') THEN 'Download'
  WHEN menu_code IN ('BTN_RUN_NOW', 'SCENARIO_RUN') THEN 'Play'
  WHEN menu_code IN ('BTN_VIEW_RUNS', 'LIVE_CM_VIEW_PAIRING', 'SCENARIO_OPEN', 'SCENARIO_PO_ACCESS', 'SCENARIO_RO_ACCESS', 'SCENARIO_BIDS_ACCESS', 'LIVE_CM_CREW_INFO', 'LIVE_CM_MANDAY') THEN 'Eye'
  WHEN menu_code IN ('BTN_RECHECK', 'LIVE_RULE_CHECK') THEN 'SearchCheck'
  WHEN menu_code = 'BTN_RESET_PWD' THEN 'KeyRound'
  WHEN menu_code = 'BTN_ROLLBACK' THEN 'RotateCcw'
  WHEN menu_code = 'LIVE_REDO' THEN 'RotateCw'
  WHEN menu_code = 'LIVE_UNDO' THEN 'History'
  WHEN menu_code IN ('BTN_DRY_RUN', 'BTN_SIMULATE') THEN 'FlaskConical'
  WHEN menu_code IN ('BTN_SET', 'BTN_CLEAR') THEN 'SlidersHorizontal'
  WHEN menu_code = 'BTN_GENERATE_YEAR' THEN 'CalendarPlus'
  WHEN menu_code = 'LIVE_CM_SWAP' THEN 'ArrowLeftRight'
  WHEN menu_code = 'LIVE_PUBLISH' OR menu_code = 'LIVE_PUBLISH_APPLY' OR menu_code = 'SCENARIO_PUBLISH' THEN 'Upload'
  WHEN menu_code = 'LIVE_PUBLISH_SEARCH' OR menu_code = 'LIVE_FILTER' THEN 'Search'
  WHEN menu_code = 'LIVE_CM_ADD_MEMO' OR menu_code = 'SCENARIO_NOTES' OR menu_code = 'BTN_LOG' THEN 'FileText'
  WHEN menu_code = 'SCENARIO_PATCH' THEN 'GitBranch'
  ELSE 'ClipboardCheck'
END,
updated_by = 'system',
updated_at = now()
WHERE system_type = 'B' AND icon IS NULL;
