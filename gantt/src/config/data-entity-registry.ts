import type { DataEntityId, DataEntityConfig, DataPageId } from '@/types/data-maintenance'

// ─── Helper to build a minimal stub entity ────────────────────────────────────
function stub(
  id: DataEntityId,
  tableName: string,
  pageId: DataPageId,
  label: string,
): DataEntityConfig {
  return {
    id,
    tableName,
    pageId,
    label,
    editable: false,
    primaryKey: 'id',
    businessKey: [id as string],
    columns: [{ key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true }],
    references: [],
  }
}

// ─── Full entity definitions ───────────────────────────────────────────────────

const base: DataEntityConfig = {
  id: 'base',
  tableName: 'base',
  pageId: 'basic.org-base',
  label: 'Base',
  editable: true,
  primaryKey: 'id',
  businessKey: ['base'],
  columns: [
    { key: 'id',           dbField: 'id',            label: 'ID',      type: 'number', readonly: true },
    { key: 'filiale',      dbField: 'filiale',       label: 'Airline', type: 'text',   maxLength: 6 },
    { key: 'base',         dbField: 'base',          label: 'Base',    type: 'text',   required: true, maxLength: 3 },
    { key: 'name',         dbField: 'name',          label: 'Name',    type: 'text',   maxLength: 20 },
    { key: 'displayOrder', dbField: 'display_order', label: 'Order',   type: 'number' },
  ],
  references: [],
}

const department: DataEntityConfig = {
  id: 'department',
  tableName: 'department',
  pageId: 'basic.org-base',
  label: 'Department',
  editable: true,
  primaryKey: 'id',
  businessKey: ['branchCode'],
  columns: [
    { key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'branchCode', dbField: 'branch_code', label: 'Branch Code', type: 'text', required: true, maxLength: 20 },
    { key: 'branchName', dbField: 'branch_name', label: 'Branch Name', type: 'text', required: true, maxLength: 100 },
    { key: 'parentCode', dbField: 'parent_code', label: 'Parent Code', type: 'text', maxLength: 20 },
    { key: 'division', dbField: 'division', label: 'Division', type: 'text', maxLength: 1 },
    { key: 'filiale', dbField: 'filiale', label: 'Filiale', type: 'text' },
  ],
  references: [],
}

const division: DataEntityConfig = {
  id: 'division',
  tableName: 'division',
  pageId: 'basic.org-base',
  label: 'Division',
  editable: true,
  primaryKey: 'id',
  businessKey: ['division'],
  columns: [
    { key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'division', dbField: 'division', label: 'Division', type: 'text', required: true, maxLength: 1 },
    { key: 'description', dbField: 'description', label: 'Description', type: 'text', maxLength: 20 },
  ],
  references: [],
}

const rank: DataEntityConfig = {
  id: 'rank',
  tableName: 'rank',
  pageId: 'basic.rank',
  label: 'Rank',
  editable: true,
  primaryKey: 'id',
  businessKey: ['rank'],
  columns: [
    { key: 'id',           dbField: 'id',            label: 'ID',          type: 'number', readonly: true },
    { key: 'rank',         dbField: 'rank',          label: 'Rank',        type: 'text',   required: true, maxLength: 10 },
    { key: 'division',     dbField: 'division',      label: 'Div',         type: 'text',   required: true, maxLength: 1 },
    { key: 'displayOrder', dbField: 'display_order', label: 'Order',       type: 'number' },
    { key: 'description',  dbField: 'description',   label: 'Description', type: 'text',   maxLength: 100 },
  ],
  references: [],
}

const fleet: DataEntityConfig = {
  id: 'fleet',
  tableName: 'fleet',
  pageId: 'basic.fleet-aircraft',
  label: 'Fleet',
  editable: true,
  primaryKey: 'id',
  businessKey: ['fleet'],
  columns: [
    { key: 'id',           dbField: 'id',           label: 'ID',          type: 'number', readonly: true },
    { key: 'fleet',        dbField: 'fleet',         label: 'Fleet',       type: 'text',   required: true, maxLength: 10 },
    { key: 'description',  dbField: 'description',   label: 'Description', type: 'text',   maxLength: 30 },
    { key: 'fleetGrp',     dbField: 'fleet_grp',     label: 'Group',       type: 'text',   maxLength: 20 },
    { key: 'acType',       dbField: 'ac_type',       label: 'A/C Type',    type: 'text',   maxLength: 10 },
    { key: 'displayOrder', dbField: 'display_order', label: 'Order',       type: 'number' },
  ],
  references: [],
}

const aircraft: DataEntityConfig = {
  id: 'aircraft',
  tableName: 'aircraft',
  pageId: 'basic.fleet-aircraft',
  label: 'Aircraft',
  editable: true,
  primaryKey: 'id',
  businessKey: ['acReg'],
  columns: [
    { key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'filiale', dbField: 'filiale', label: 'Filiale', type: 'text' },
    { key: 'acReg', dbField: 'ac_reg', label: 'AC Reg', type: 'text', required: true, maxLength: 20 },
    { key: 'fleet', dbField: 'fleet', label: 'Fleet', type: 'select', required: true, maxLength: 12, referenceEntity: 'fleet' },
    { key: 'acType', dbField: 'ac_type', label: 'AC Type', type: 'text', maxLength: 12 },
  ],
  references: [],
}

const airport: DataEntityConfig = {
  id: 'airport',
  tableName: 'airport',
  pageId: 'basic.location-route',
  label: 'Airport',
  editable: true,
  primaryKey: 'id',
  businessKey: ['airport'],
  columns: [
    { key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'airport', dbField: 'airport', label: 'Airport', type: 'text', required: true, maxLength: 3 },
    { key: 'airportName', dbField: 'airport_name', label: 'Airport Name', type: 'text', maxLength: 100 },
    { key: 'city', dbField: 'city', label: 'City', type: 'text', required: true, maxLength: 3 },
    { key: 'country', dbField: 'country', label: 'Country', type: 'text', maxLength: 2 },
  ],
  references: [],
}

// ── Assignment (task-type definition — 41 columns) ──
const assignmentEntity: DataEntityConfig = {
  id: 'assignment',
  tableName: 'assignment',
  pageId: 'basic.assignment',
  label: 'Assignment',
  editable: true,
  primaryKey: 'id',
  businessKey: ['assignment'],
  filterFields: [
    {
      key: 'type',
      label: 'Type',
      type: 'select',
      options: [
        { label: 'L - Leave', value: 'L' },
        { label: 'O - Off', value: 'O' },
        { label: 'W - Work', value: 'W' },
        { label: 'T - Training', value: 'T' },
        { label: 'S - Reserve', value: 'S' },
      ],
    },
  ],
  columns: [
    { key: 'id',                        dbField: 'id',                            label: 'ID',                 type: 'number',  readonly: true },
    { key: 'assignment',                dbField: 'assignment',                    label: 'Code',               type: 'text',    required: true, maxLength: 20 },
    { key: 'description',               dbField: 'description',                   label: 'Description',        type: 'text',    required: true, maxLength: 100 },
    { key: 'type',                      dbField: 'type',                          label: 'Type',               type: 'text',    required: true, maxLength: 1 },
    { key: 'isRest',                    dbField: 'is_rest',                       label: 'Rest',               type: 'boolean', inputKind: 'boolean' },
    { key: 'colorHex',                  dbField: 'color_hex',                     label: 'Color',              type: 'text',    required: true, maxLength: 6, inputKind: 'colorHex', placeholder: '8B7BD8' },
    { key: 'label',                     dbField: 'label',                         label: 'Label',              type: 'text',    maxLength: 100 },
    { key: 'standalone',                dbField: 'standalone',                    label: 'Standalone',         type: 'text',    maxLength: 1 },
    { key: 'btPct',                     dbField: 'bt_pct',                        label: 'BT %',               type: 'number',  inputKind: 'percentRatio', min: 0, max: 1, step: 0.01, placeholder: '0.33', helpText: 'Enter a ratio from 0 to 1. Use 0.33 for 33%.' },
    { key: 'fixedCreditMin',            dbField: 'fixed_credit_min',              label: 'Fixed Credit (min)', type: 'number',  inputKind: 'integer', min: 0, step: 1 },
    { key: 'fdpPct',                    dbField: 'fdp_pct',                       label: 'FDP %',              type: 'number',  inputKind: 'percentRatio', min: 0, max: 1, step: 0.01, placeholder: '0.33', helpText: 'Enter a ratio from 0 to 1. Use 0.33 for 33%.' },
    { key: 'dpPct',                     dbField: 'dp_pct',                        label: 'DP %',               type: 'number',  inputKind: 'percentRatio', min: 0, max: 1, step: 0.01, placeholder: '0.33', helpText: 'Enter a ratio from 0 to 1. Use 0.33 for 33%.' },
    { key: 'isAdhoc',                   dbField: 'is_adhoc',                      label: 'Adhoc',              type: 'boolean', inputKind: 'boolean' },
    { key: 'defaultLocation',           dbField: 'default_location',              label: 'Def Loc',            type: 'text',    maxLength: 3 },
    { key: 'isRecency',                 dbField: 'is_recency',                    label: 'Recency',            type: 'boolean', inputKind: 'boolean' },
    { key: 'fixedStrTm',                dbField: 'fixed_str_tm',                  label: 'Fixed Start',        type: 'text',    maxLength: 5, inputKind: 'time', placeholder: '04:00' },
    { key: 'fixedEndTm',                dbField: 'fixed_end_tm',                  label: 'Fixed End',          type: 'text',    maxLength: 5, inputKind: 'time', placeholder: '16:00' },
    { key: 'fixedDurationMin',          dbField: 'fixed_duration_min',            label: 'Fixed Dur (min)',    type: 'number',  inputKind: 'integer', min: 0, step: 1 },
    { key: 'displayLabelWhenAvailable', dbField: 'display_label_when_available',  label: 'Disp Label',         type: 'text',    maxLength: 1 },
    { key: 'defaultAssignmentGroup',    dbField: 'default_assignment_group',      label: 'Def Group',          type: 'text',    maxLength: 20 },
    { key: 'ftPct',                     dbField: 'ft_pct',                        label: 'FT %',               type: 'number',  inputKind: 'percentRatio', min: 0, max: 1, step: 0.01, placeholder: '0.33', helpText: 'Enter a ratio from 0 to 1. Use 0.33 for 33%.' },
    { key: 'isQualifier',               dbField: 'is_qualifier',                  label: 'Qualifier',          type: 'boolean', inputKind: 'boolean' },
    { key: 'wpPct',                     dbField: 'wp_pct',                        label: 'WP %',               type: 'number',  inputKind: 'percentRatio', min: 0, max: 1, step: 0.01, placeholder: '0.33', helpText: 'Enter a ratio from 0 to 1. Use 0.33 for 33%.' },
    { key: 'restTime',                  dbField: 'rest_time',                     label: 'Rest (min)',          type: 'number',  inputKind: 'integer', min: 0, step: 1 },
    { key: 'divideCrewManday',          dbField: 'divide_crew_manday',            label: 'Divide MD',          type: 'text',    maxLength: 1 },
    { key: 'recaLabel',                 dbField: 'reca_label',                    label: 'Reca Label',         type: 'text',    maxLength: 1 },
    { key: 'orientation',               dbField: 'orientation',                   label: 'Orientation',        type: 'text',    maxLength: 20 },
    { key: 'pairingLabelColorHex',      dbField: 'pairing_label_color_hex',       label: 'Pairing Color',      type: 'text',    maxLength: 6, inputKind: 'colorHex', placeholder: '8B7BD8' },
    { key: 'segmentLabelColorHex',      dbField: 'segment_label_color_hex',       label: 'Segment Color',      type: 'text',    maxLength: 6, inputKind: 'colorHex', placeholder: '8B7BD8' },
    { key: 'tmCreditFlag',              dbField: 'tm_credit_flag',                label: 'TM Credit',          type: 'boolean', inputKind: 'boolean' },
    { key: 'assignmentUnitType',        dbField: 'assignment_unit_type',          label: 'Unit Type',          type: 'text',    maxLength: 20 },
    { key: 'dpGap',                     dbField: 'dp_gap',                        label: 'DP Gap (min)',        type: 'number',  inputKind: 'integer', min: 0, step: 1 },
    { key: 'beforePctDpGapMin',         dbField: 'before_pct_dp_gap_min',         label: 'Before Gap (min)',   type: 'number',  inputKind: 'integer', min: 0, step: 1 },
    { key: 'afterPctDpGapMin',          dbField: 'after_pct_dp_gap_min',          label: 'After Gap (min)',    type: 'number',  inputKind: 'integer', min: 0, step: 1 },
  ],
  references: [],
}

const assignmentGroupEntity: DataEntityConfig = {
  id: 'assignment_group',
  tableName: 'assignment_group',
  pageId: 'basic.assignment',
  label: 'Assignment Group',
  editable: true,
  primaryKey: 'id',
  businessKey: ['assignmentGroup'],
  columns: [
    { key: 'id',                 dbField: 'id',                  label: 'ID',         type: 'number', readonly: true },
    { key: 'assignmentGroup',    dbField: 'assignment_group',    label: 'Group',      type: 'text',   required: true, maxLength: 15 },
    { key: 'name',               dbField: 'name',                label: 'Name',       type: 'text',   required: true, maxLength: 100 },
    { key: 'color',              dbField: 'color',               label: 'Color',      type: 'text',   maxLength: 7 },
    { key: 'allowOverlap',       dbField: 'allow_overlap',       label: 'Overlap',    type: 'boolean' },
    { key: 'optimizerIndicator', dbField: 'optimizer_indicator', label: 'Optimizer',  type: 'boolean' },
  ],
  references: [],
}

const assignmentGroupMapEntity: DataEntityConfig = {
  id: 'assignment_group_map',
  tableName: 'assignment_group_map',
  pageId: 'basic.assignment',
  label: 'Assignment Group Map',
  editable: false,
  primaryKey: 'id',
  businessKey: ['groupCode', 'assignmentCode'],
  // Show resolved codes/names rather than the raw FK ids (server-side join).
  columns: [
    { key: 'id',             dbField: 'id',               label: 'ID',          type: 'number', readonly: true },
    { key: 'groupCode',      dbField: 'assignment_group', label: 'Group',       type: 'text' },
    { key: 'groupName',      dbField: 'name',             label: 'Group Name',  type: 'text' },
    { key: 'assignmentCode', dbField: 'assignment',       label: 'Assignment',  type: 'text' },
    { key: 'assignmentDesc', dbField: 'description',      label: 'Description',  type: 'text' },
  ],
  references: [],
}

const qualificationEntity: DataEntityConfig = {
  id: 'qualification',
  tableName: 'qualification',
  pageId: 'basic.qualification',
  label: 'Qualification',
  editable: true,
  primaryKey: 'id',
  businessKey: ['qualification'],
  columns: [
    { key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'qualification', dbField: 'qualification', label: 'Qualification', type: 'text', required: true, maxLength: 20 },
    { key: 'description', dbField: 'description', label: 'Description', type: 'text', maxLength: 100 },
    { key: 'filiale', dbField: 'filiale', label: 'Filiale', type: 'text' },
    { key: 'division', dbField: 'division', label: 'Division', type: 'text', maxLength: 1 },
    { key: 'qualificationGroup', dbField: 'qualification_group', label: 'Group', type: 'text', maxLength: 40 },
  ],
  references: [],
}

const dictionaryEntity: DataEntityConfig = {
  id: 'dictionary',
  tableName: 'dictionary',
  pageId: 'basic.config-dictionary',
  label: 'Dictionary',
  editable: true,
  primaryKey: 'id',
  businessKey: ['code'],
  filterFields: [
    {
      key: 'parentCode',
      label: 'Category',
      type: 'select',
      options: [
        { label: 'ASSIGN_TYPE', value: 'ASSIGN_TYPE' },
        { label: 'BID_CONTEXT', value: 'BID_CONTEXT' },
        { label: 'BODY_TYPE', value: 'BODY_TYPE' },
        { label: 'CERT_TYPE', value: 'CERT_TYPE' },
        { label: 'CONNECTOR_SYNC', value: 'CONNECTOR_SYNC' },
        { label: 'CREW_STATUS', value: 'CREW_STATUS' },
        { label: 'DEFAULT', value: 'DEFAULT' },
        { label: 'DIR', value: 'DIR' },
        { label: 'DIVISION', value: 'DIVISION' },
        { label: 'DOW', value: 'DOW' },
        { label: 'FLT_TYPE', value: 'FLT_TYPE' },
        { label: 'FUNC_CONFIG', value: 'FUNC_CONFIG' },
        { label: 'GENDER', value: 'GENDER' },
        { label: 'HOLIDAY_TYPE', value: 'HOLIDAY_TYPE' },
        { label: 'LANG_LEVEL', value: 'LANG_LEVEL' },
        { label: 'LOGIN_TYPE', value: 'LOGIN_TYPE' },
        { label: 'MARITAL', value: 'MARITAL' },
        { label: 'PBS_STATUS', value: 'PBS_STATUS' },
        { label: 'PLATEAU_TYPE', value: 'PLATEAU_TYPE' },
        { label: 'PROJ_TYPE', value: 'PROJ_TYPE' },
        { label: 'QUAL_TYPE', value: 'QUAL_TYPE' },
        { label: 'REST_FACILITY', value: 'REST_FACILITY' },
        { label: 'RULE_SEV', value: 'RULE_SEV' },
        { label: 'SCENARIO_ST', value: 'SCENARIO_ST' },
        { label: 'SEG_TYPE', value: 'SEG_TYPE' },
        { label: 'SYS_PARAM', value: 'SYS_PARAM' },
      ],
    },
  ],
  columns: [
    { key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'parentCode', dbField: 'parent_code', label: 'Parent Code', type: 'text', maxLength: 40 },
    { key: 'code', dbField: 'code', label: 'Code', type: 'text', required: true, maxLength: 100 },
    { key: 'name', dbField: 'name', label: 'Name', type: 'text', maxLength: 500 },
    { key: 'codeValue', dbField: 'code_value', label: 'Code Value', type: 'text', maxLength: 50 },
  ],
  references: [],
}

const holidayEntity: DataEntityConfig = {
  id: 'holiday',
  tableName: 'holiday',
  pageId: 'basic.holiday',
  label: 'Holiday',
  editable: true,
  primaryKey: 'id',
  businessKey: ['filiale', 'country', 'city', 'holiday'],
  defaultSort: 'strDt',
  pageSize: 2000,
  filterFields: [
    {
      key: 'year',
      label: 'Year',
      type: 'select',
      options: [
        { label: '2026', value: '2026' }, { label: '2027', value: '2027' },
        { label: '2028', value: '2028' }, { label: '2029', value: '2029' },
        { label: '2030', value: '2030' }, { label: '2031', value: '2031' },
        { label: '2032', value: '2032' }, { label: '2033', value: '2033' },
        { label: '2034', value: '2034' }, { label: '2035', value: '2035' },
        { label: '2036', value: '2036' },
      ],
    },
    {
      key: 'city',
      label: 'City',
      type: 'select',
      options: [
        { label: 'YEG — Edmonton',   value: 'YEG' },
        { label: 'YKF — Waterloo',   value: 'YKF' },
        { label: 'YLW — Kelowna',    value: 'YLW' },
        { label: 'YOW — Ottawa',     value: 'YOW' },
        { label: 'YUL — Montreal',   value: 'YUL' },
        { label: 'YVR — Vancouver',  value: 'YVR' },
        { label: 'YXX — Abbotsford', value: 'YXX' },
        { label: 'YYC — Calgary',    value: 'YYC' },
        { label: 'YYZ — Toronto',    value: 'YYZ' },
      ],
    },
  ],
  columns: [
    { key: 'id',      dbField: 'id',       label: 'ID',       type: 'number', readonly: true },
    { key: 'city',    dbField: 'city',      label: 'City',     type: 'text',   required: true, maxLength: 3 },
    { key: 'strDt',   dbField: 'str_dt',    label: 'Date',     type: 'date',   required: true },
    { key: 'holiday', dbField: 'holiday',   label: 'Holiday',  type: 'text',   required: true, maxLength: 80 },
    { key: 'doType',  dbField: 'do_type',   label: 'Type',     type: 'text',   maxLength: 6 },
    { key: 'mark',    dbField: 'mark',      label: 'Authority', type: 'text',  maxLength: 50 },
    { key: 'country', dbField: 'country',   label: 'Country',  type: 'text',   required: true, maxLength: 2 },
    { key: 'filiale', dbField: 'filiale',   label: 'Filiale',  type: 'text' },
  ],
  references: [],
}

const composition: DataEntityConfig = {
  id: 'composition',
  tableName: 'composition',
  pageId: 'basic.composition',
  label: 'Composition',
  editable: true,
  primaryKey: 'id',
  businessKey: ['name', 'division'],
  columns: [
    { key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'name', dbField: 'name', label: 'Name', type: 'text', required: true, maxLength: 30 },
    { key: 'division', dbField: 'division', label: 'Division', type: 'text', required: true, maxLength: 2 },
    { key: 'displayOrder', dbField: 'display_order', label: 'Order', type: 'number' },
  ],
  references: [],
}

const composition_rank: DataEntityConfig = {
  id: 'composition_rank',
  tableName: 'composition_rank',
  pageId: 'basic.composition',
  label: 'Composition Rank',
  editable: true,
  primaryKey: 'id',
  businessKey: ['compId', 'rank'],
  columns: [
    { key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'compId', dbField: 'comp_id', label: 'Comp ID', type: 'number', readonly: true, referenceEntity: 'composition' },
    { key: 'rank', dbField: 'rank', label: 'Rank', type: 'select', required: true, referenceEntity: 'rank' },
    { key: 'planValue', dbField: 'plan_value', label: 'Plan', type: 'number' },
  ],
  references: [
    { childField: 'compId', parentEntity: 'composition', parentField: 'id', required: true },
  ],
}

const composition_load: DataEntityConfig = {
  id: 'composition_load',
  tableName: 'composition_load',
  pageId: 'basic.composition',
  label: 'Composition Load',
  editable: true,
  primaryKey: 'id',
  businessKey: ['compId', 'sequence'],
  columns: [
    { key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'compId', dbField: 'comp_id', label: 'Comp ID', type: 'number', readonly: true, referenceEntity: 'composition' },
    { key: 'fleet', dbField: 'fleet', label: 'Fleet', type: 'select', referenceEntity: 'fleet' },
    { key: 'sequence', dbField: 'sequence', label: 'Seq', type: 'number', required: true },
    { key: 'effDt', dbField: 'eff_dt', label: 'Eff Date', type: 'date' },
    { key: 'expDt', dbField: 'exp_dt', label: 'Exp Date', type: 'date' },
  ],
  references: [],
}

const crew: DataEntityConfig = {
  id: 'crew',
  tableName: 'crew',
  pageId: 'crew.master',
  label: 'Crew Basic',
  editable: false,
  primaryKey: 'id',
  businessKey: ['crewId'],
  columns: [
    { key: 'crewId',    dbField: 'crew_id',    label: 'Crew ID',   type: 'text',   required: true, maxLength: 30 },
    { key: 'lastName',  dbField: 'last_name',  label: 'Last Name', type: 'text',   required: true, maxLength: 100 },
    { key: 'firstName', dbField: 'first_name', label: 'First Name',type: 'text',   required: true, maxLength: 100 },
    { key: 'division',  dbField: 'division',   label: 'Div',       type: 'text',   maxLength: 1 },
    { key: 'filiale',   dbField: 'filiale',    label: 'Airline',   type: 'text',   maxLength: 6 },
    { key: 'gender',    dbField: 'gender',     label: 'Gender',    type: 'text',   maxLength: 1 },
    { key: 'grade',     dbField: 'grade',      label: 'Grade',     type: 'text',   maxLength: 20 },
    { key: 'emplDt',    dbField: 'empl_dt',    label: 'Empl Date', type: 'date',   readonly: true, align: 'left' },
    { key: 'retireDt',  dbField: 'retire_dt',  label: 'Retire',    type: 'date',   readonly: true, align: 'left' },
    { key: 'status',    dbField: 'status',     label: 'Status',    type: 'number', readonly: true, align: 'left' },
  ],
  references: [],
}

const crew_base: DataEntityConfig = {
  id: 'crew_base',
  tableName: 'crew_base',
  pageId: 'crew.master',
  label: 'Crew Base',
  editable: false,
  primaryKey: 'id',
  businessKey: ['crewId', 'effDt'],
  columns: [
    { key: 'crewId', dbField: 'crew_id', label: 'Crew ID', type: 'text', readonly: true },
    { key: 'base', dbField: 'base', label: 'Base', type: 'select', required: true, referenceEntity: 'base' },
    { key: 'effDt', dbField: 'eff_dt', label: 'Eff Date', type: 'date', required: true, align: 'left' },
    { key: 'expDt', dbField: 'exp_dt', label: 'Exp Date', type: 'date', align: 'left' },
  ],
  references: [],
  effectiveDate: { effField: 'effDt', expField: 'expDt', overlapKey: ['crewId'] },
}

const crew_rank: DataEntityConfig = {
  id: 'crew_rank',
  tableName: 'crew_rank',
  pageId: 'crew.master',
  label: 'Crew Rank',
  editable: false,
  primaryKey: 'id',
  businessKey: ['crewId', 'effDt'],
  columns: [
    { key: 'crewId', dbField: 'crew_id', label: 'Crew ID', type: 'text', readonly: true },
    { key: 'rank', dbField: 'rank', label: 'Rank', type: 'select', required: true, referenceEntity: 'rank' },
    { key: 'effDt', dbField: 'eff_dt', label: 'Eff Date', type: 'date', required: true, align: 'left' },
    { key: 'expDt', dbField: 'exp_dt', label: 'Exp Date', type: 'date', align: 'left' },
  ],
  references: [],
  effectiveDate: { effField: 'effDt', expField: 'expDt', overlapKey: ['crewId'] },
}

const crew_fleet: DataEntityConfig = {
  id: 'crew_fleet',
  tableName: 'crew_fleet',
  pageId: 'crew.master',
  label: 'Crew Fleet',
  editable: false,
  primaryKey: 'id',
  businessKey: ['crewId', 'effDt'],
  columns: [
    { key: 'crewId', dbField: 'crew_id', label: 'Crew ID', type: 'text', readonly: true },
    { key: 'fleetSpecific', dbField: 'fleet_specific', label: 'Fleet', type: 'select', referenceEntity: 'fleet' },
    { key: 'effDt', dbField: 'eff_dt', label: 'Eff Date', type: 'date', align: 'left' },
    { key: 'expDt', dbField: 'exp_dt', label: 'Exp Date', type: 'date', align: 'left' },
  ],
  references: [],
}

const crew_qualification: DataEntityConfig = {
  id: 'crew_qualification',
  tableName: 'crew_qualification',
  pageId: 'crew.master',
  label: 'Crew Qualification',
  editable: false,
  primaryKey: 'id',
  businessKey: ['crewId', 'qualification'],
  columns: [
    { key: 'crewId', dbField: 'crew_id', label: 'Crew ID', type: 'text', readonly: true },
    { key: 'qualification', dbField: 'qualification', label: 'Qualification', type: 'select', required: true, referenceEntity: 'qualification' },
    { key: 'bases', dbField: 'bases', label: 'Bases', type: 'multi-code' },
    { key: 'ranks', dbField: 'ranks', label: 'Ranks', type: 'multi-code' },
    { key: 'effDt', dbField: 'eff_dt', label: 'Eff Date', type: 'date', align: 'left' },
    { key: 'expDt', dbField: 'exp_dt', label: 'Exp Date', type: 'date', align: 'left' },
  ],
  references: [],
}

const crew_team: DataEntityConfig = {
  id: 'crew_team',
  tableName: 'crew_team',
  pageId: 'crew.master',
  label: 'Crew Team',
  editable: false,
  primaryKey: 'id',
  businessKey: ['crewId', 'team'],
  columns: [
    { key: 'crewId', dbField: 'crew_id', label: 'Crew ID', type: 'text', readonly: true },
    { key: 'team', dbField: 'team', label: 'Team Code', type: 'text', required: true, maxLength: 50 },
    { key: 'remarks', dbField: 'remarks', label: 'Team Name', type: 'text', maxLength: 512 },
    { key: 'effDt', dbField: 'eff_dt', label: 'Eff Date', type: 'date', align: 'left' },
    { key: 'expDt', dbField: 'exp_dt', label: 'Exp Date', type: 'date', align: 'left' },
  ],
  references: [],
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const DATA_ENTITY_REGISTRY: Record<DataEntityId, DataEntityConfig> = {
  // ── Basic: Org & Base ──
  filiale:              stub('filiale', 'filiale', 'basic.org-base', 'Filiale'),
  base,
  department,
  division,
  division_construction: stub('division_construction', 'division_construction', 'basic.org-base', 'Division Construction'),
  team: {
    ...stub('team', 'team', 'basic.org-base', 'Team'),
    editable: true,
    businessKey: ['filiale', 'team', 'division'],
    columns: [
      { key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true },
      { key: 'filiale', dbField: 'filiale', label: 'Airline', type: 'text', required: true, maxLength: 6 },
      { key: 'team', dbField: 'team', label: 'Team Code', type: 'text', required: true, maxLength: 50 },
      { key: 'description', dbField: 'description', label: 'Description', type: 'text', maxLength: 100 },
      { key: 'displayOrder', dbField: 'display_order', label: 'Order', type: 'number' },
      { key: 'headColor', dbField: 'head_color', label: 'Head Color', type: 'text', maxLength: 20 },
      { key: 'division', dbField: 'division', label: 'Div', type: 'text', required: true, maxLength: 1 },
      { key: 'teamGroup', dbField: 'team_group', label: 'Group', type: 'text', maxLength: 40 },
    ],
  },

  // ── Basic: Rank ──
  rank,
  rank_acting:          stub('rank_acting', 'rank_acting', 'basic.rank', 'Rank Acting'),
  rank_position:        stub('rank_position', 'rank_position', 'basic.rank', 'Rank Position'),

  // ── Basic: Fleet & Aircraft ──
  fleet,
  aircraft,

  // ── Basic: Location & Route ──
  airport,
  route:                stub('route', 'route', 'basic.location-route', 'Route'),
  hotel:                stub('hotel', 'hotel', 'basic.location-route', 'Hotel'),

  // ── Basic: Assignment ──
  assignment:           assignmentEntity,
  assignment_group:     assignmentGroupEntity,
  assignment_group_map: assignmentGroupMapEntity,

  // ── Basic: Qualification ──
  qualification:        qualificationEntity,
  qualification_projection: stub('qualification_projection', 'qualification_projection', 'basic.qualification', 'Qualification Projection'),
  certificate:          stub('certificate', 'certificate', 'basic.qualification', 'Certificate'),
  language:             stub('language', 'language', 'basic.qualification', 'Language'),
  port_qual_reqmnt:     stub('port_qual_reqmnt', 'port_qual_reqmnt', 'basic.qualification', 'Port Qual Requirement'),

  // ── Basic: Composition ──
  composition,
  composition_rank,
  composition_load,

  // ── Basic: Roster Period ──
  roster_period: {
    id: 'roster_period',
    tableName: 'roster_period',
    pageId: 'basic.roster-period',
    label: 'Roster Period',
    editable: true,
    creatable: true,
    deletable: true,
    primaryKey: 'id',
    businessKey: ['rosterPeriod'],
    filterFields: [
      {
        key: 'year',
        label: 'Year',
        type: 'select',
        options: [
          { label: '2026', value: '2026' },
          { label: '2027', value: '2027' },
          { label: '2028', value: '2028' },
          { label: '2029', value: '2029' },
          { label: '2030', value: '2030' },
          { label: '2031', value: '2031' },
          { label: '2032', value: '2032' },
          { label: '2033', value: '2033' },
          { label: '2034', value: '2034' },
          { label: '2035', value: '2035' },
          { label: '2036', value: '2036' },
        ],
      },
      {
        key: 'lockStatus',
        label: 'Status',
        type: 'select',
        options: [
          { label: 'Unlocked', value: '0' },
          { label: 'Locked',   value: '1' },
        ],
      },
    ],
    columns: [
      { key: 'id',                   dbField: 'id',                      label: 'ID',               type: 'number',   readonly: true },
      { key: 'rosterPeriod',         dbField: 'roster_period',           label: 'RP Code',          type: 'text',     required: true },
      { key: 'name',                 dbField: 'name',                    label: 'Name',             type: 'text',     required: true },
      { key: 'year',                 dbField: 'year',                    label: 'Year',             type: 'text',     required: true },
      { key: 'rpStart',              dbField: 'rp_start',                label: 'Start',            type: 'datetime', required: true },
      { key: 'rpEnd',                dbField: 'rp_end',                  label: 'End',              type: 'datetime', required: true },
      { key: 'rosterPublicationDate', dbField: 'roster_publication_date', label: 'Publication Date', type: 'datetime' },
      { key: 'paidDate',             dbField: 'paid_date',               label: 'Paid Date',        type: 'datetime' },
      { key: 'lockStatus',           dbField: 'lock_status',             label: 'Lock',             type: 'number' },
    ],
    references: [],
  } as DataEntityConfig,
  roster_period_config: {
    id: 'roster_period_config',
    tableName: 'roster_period_config',
    pageId: 'basic.roster-period',
    label: 'Roster Period Config',
    editable: true,
    creatable: true,
    deletable: true,
    primaryKey: 'id',
    businessKey: ['name'],
    filterFields: [
      {
        key: 'rpType',
        label: 'RP Type',
        type: 'select',
        options: [
          { label: 'Monthly',   value: '1' },
          { label: 'Quarterly', value: '2' },
        ],
      },
      {
        key: 'periodType',
        label: 'Period Type',
        type: 'select',
        options: [
          { label: 'Day',   value: '1' },
          { label: 'Week',  value: '2' },
          { label: 'Month', value: '3' },
        ],
      },
    ],
    columns: [
      { key: 'id',         dbField: 'id',          label: 'ID',          type: 'number',   readonly: true },
      { key: 'name',       dbField: 'name',        label: 'Name',        type: 'text',     maxLength: 100 },
      { key: 'nameType',   dbField: 'name_type',   label: 'Name Type',   type: 'number' },
      { key: 'rpType',     dbField: 'rp_type',     label: 'RP Type',     type: 'number' },
      { key: 'period',     dbField: 'period',      label: 'Period',      type: 'number' },
      { key: 'periodType', dbField: 'period_type', label: 'Period Type', type: 'number' },
      { key: 'startTime',  dbField: 'start_time',  label: 'Start Time',  type: 'datetime' },
      { key: 'endTime',    dbField: 'end_time',    label: 'End Time',    type: 'datetime' },
    ],
    references: [],
    defaultSort: 'id',
  } as DataEntityConfig,

  // ── Basic: Config Dictionary ──
  dictionary:           dictionaryEntity,
  attribute:            stub('attribute', 'attribute', 'basic.config-dictionary', 'Attribute'),
  live_config:          stub('live_config', 'live_config', 'basic.config-dictionary', 'Live Config'),
  severity:             stub('severity', 'severity', 'basic.config-dictionary', 'Severity'),
  pane_header:          stub('pane_header', 'pane_header', 'basic.config-dictionary', 'Pane Header'),

  // ── Basic: Query ──
  query_criteria:       stub('query_criteria', 'query_criteria', 'basic.query', 'Query Criteria'),
  sort_criteria:        stub('sort_criteria', 'sort_criteria', 'basic.query', 'Sort Criteria'),
  user_query:           stub('user_query', 'user_query', 'basic.query', 'User Query'),
  query:                stub('query', 'query', 'basic.query', 'Query'),

  // ── Basic: Holiday ──
  holiday:              holidayEntity,

  // ── Crew ──
  crew,
  crew_base,
  crew_rank,
  crew_fleet,
  crew_qualification,
  crew_team,
  crew_status:          { ...stub('crew_status', 'crew_status', 'crew.master', 'Crew Status'), columns: [{ key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true, align: 'left' }, { key: 'crewId', dbField: 'crew_id', label: 'Crew ID', type: 'text', readonly: true }, { key: 'status', dbField: 'status', label: 'Status', type: 'text' }], businessKey: ['crewId'] },
  crew_certificate:     { ...stub('crew_certificate', 'crew_certificate', 'crew.master', 'Crew Certificate'), columns: [{ key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true, align: 'left' }, { key: 'crewId', dbField: 'crew_id', label: 'Crew ID', type: 'text', readonly: true }, { key: 'certificate', dbField: 'certificate', label: 'Certificate', type: 'text' }, { key: 'expDt', dbField: 'exp_dt', label: 'Exp Date', type: 'date', align: 'left' }], businessKey: ['crewId', 'certificate'] },
  crew_license:         { ...stub('crew_license', 'crew_license', 'crew.master', 'Crew License'), columns: [{ key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true }, { key: 'crewId', dbField: 'crew_id', label: 'Crew ID', type: 'text', readonly: true }, { key: 'licenseNo', dbField: 'license_no', label: 'License No', type: 'text' }, { key: 'expDt', dbField: 'exp_dt', label: 'Exp Date', type: 'date' }], businessKey: ['crewId', 'licenseNo'] },
  crew_lic_instructor:  { ...stub('crew_lic_instructor', 'crew_lic_instructor', 'crew.master', 'Crew License Instructor'), columns: [{ key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true }, { key: 'crewId', dbField: 'crew_id', label: 'Crew ID', type: 'text', readonly: true }], businessKey: ['crewId'] },
  crew_language:        { ...stub('crew_language', 'crew_language', 'crew.master', 'Crew Language'), columns: [{ key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true }, { key: 'crewId', dbField: 'crew_id', label: 'Crew ID', type: 'text', readonly: true }, { key: 'language', dbField: 'language', label: 'Language', type: 'text' }, { key: 'proficiency', dbField: 'proficiency', label: 'Proficiency', type: 'text' }], businessKey: ['crewId', 'language'] },
  crew_entitlement:     { ...stub('crew_entitlement', 'crew_entitlement', 'crew.master', 'Crew Entitlement'), columns: [{ key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true }, { key: 'crewId', dbField: 'crew_id', label: 'Crew ID', type: 'text', readonly: true }, { key: 'entitlement', dbField: 'entitlement', label: 'Entitlement', type: 'text' }, { key: 'effDt', dbField: 'eff_dt', label: 'Eff Date', type: 'date' }, { key: 'expDt', dbField: 'exp_dt', label: 'Exp Date', type: 'date' }], businessKey: ['crewId', 'entitlement'] },
  crew_memo:            { ...stub('crew_memo', 'crew_memo', 'crew.master', 'Crew Memo'), columns: [{ key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true, align: 'left' }, { key: 'crewId', dbField: 'crew_id', label: 'Crew ID', type: 'text', readonly: true }, { key: 'memo', dbField: 'memo', label: 'Memo', type: 'text' }], businessKey: ['crewId'] },
  crew_profile:         { ...stub('crew_profile', 'crew_profile', 'crew.master', 'Crew Profile'), columns: [{ key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true }, { key: 'crewId', dbField: 'crew_id', label: 'Crew ID', type: 'text', readonly: true }, { key: 'profileKey', dbField: 'profile_key', label: 'Key', type: 'text' }, { key: 'profileValue', dbField: 'profile_value', label: 'Value', type: 'text' }], businessKey: ['crewId', 'profileKey'] },
  crew_seniority:       { ...stub('crew_seniority', 'crew_seniority', 'crew.master', 'Crew Seniority'), columns: [{ key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true }, { key: 'crewId', dbField: 'crew_id', label: 'Crew ID', type: 'text', readonly: true }, { key: 'seniorityNo', dbField: 'seniority_no', label: 'Seniority No', type: 'number' }], businessKey: ['crewId'] },
  crew_kpi_adjust:      { ...stub('crew_kpi_adjust', 'crew_kpi_adjust', 'crew.master', 'Crew KPI Adjust'), columns: [{ key: 'id', dbField: 'id', label: 'ID', type: 'number', readonly: true }, { key: 'crewId', dbField: 'crew_id', label: 'Crew ID', type: 'text', readonly: true }, { key: 'kpiCode', dbField: 'kpi_code', label: 'KPI Code', type: 'text' }, { key: 'adjustValue', dbField: 'adjust_value', label: 'Adjust Value', type: 'number' }], businessKey: ['crewId', 'kpiCode'] },
}

for (const config of Object.values(DATA_ENTITY_REGISTRY)) {
  config.editable = true
  config.creatable = true
  config.deletable = true
  for (const column of config.columns) {
    if (column.inputKind) continue
    if (column.type === 'boolean') {
      column.inputKind = 'boolean'
    } else if (column.type === 'date') {
      column.inputKind = 'date'
    } else if (column.type === 'datetime') {
      column.inputKind = 'datetime'
    } else if (column.type === 'select') {
      column.inputKind = 'select'
    } else if (column.type === 'number') {
      column.inputKind = column.key === 'id' || /(?:id|order|count|num|value|period|type|status|seq|no)$/i.test(column.key)
        ? 'integer'
        : 'decimal'
      if (column.inputKind === 'integer') column.step = column.step ?? 1
    } else {
      column.inputKind = 'text'
    }
  }
}

// ─── Page → entity mapping ────────────────────────────────────────────────────

// Maps each pageId to the ordered list of entityIds it contains
export const PAGE_ENTITY_MAP: Record<DataPageId, DataEntityId[]> = {
  'basic.org-base':          ['base', 'department', 'division'],
  'basic.rank':              ['rank'],
  'basic.fleet-aircraft':    ['fleet', 'aircraft'],
  'basic.location-route':    ['airport'],
  'basic.assignment':        ['assignment', 'assignment_group', 'assignment_group_map'],
  'basic.qualification':     ['qualification'],
  'basic.composition':       ['composition', 'composition_rank', 'composition_load'],
  'basic.roster-period':     ['roster_period'],
  'basic.config-dictionary': ['dictionary'],
  'basic.query':             ['query'],
  'basic.holiday':           ['holiday'],
  'crew.master':             [
    'crew', 'crew_base', 'crew_rank', 'crew_fleet', 'crew_qualification', 'crew_team',
    'crew_status', 'crew_certificate', 'crew_license', 'crew_lic_instructor', 'crew_language',
    'crew_entitlement', 'crew_memo', 'crew_profile', 'crew_seniority', 'crew_kpi_adjust',
  ],
  'crew.workload-summary':   [],
  'metadata.live':           [],
  'metadata.scenario':       [],
}

// ─── Navigation tree ──────────────────────────────────────────────────────────

export interface DataTreeNode {
  id: DataPageId | DataRootId
  label: string
  isRoot?: boolean
  children?: DataTreeNode[]
  icon?: string
}

type DataRootId = 'basic' | 'crew' | 'metadata'

export const DATA_TREE: DataTreeNode[] = [
  {
    id: 'basic',
    label: 'Basic',
    isRoot: true,
    children: [
      { id: 'basic.org-base', label: 'Org & Base' },
      { id: 'basic.rank', label: 'Rank' },
      { id: 'basic.fleet-aircraft', label: 'Fleet & Aircraft' },
      { id: 'basic.location-route', label: 'Location & Route' },
      { id: 'basic.assignment', label: 'Assignment' },
      { id: 'basic.qualification', label: 'Qualification' },
      { id: 'basic.composition', label: 'Composition' },
      { id: 'basic.roster-period', label: 'Roster Period' },
      { id: 'basic.config-dictionary', label: 'Configuration Dictionary' },
      { id: 'basic.query', label: 'Query' },
      { id: 'basic.holiday', label: 'Holiday Calendar' },
    ],
  },
  {
    id: 'crew',
    label: 'Crew',
    isRoot: true,
    children: [
      { id: 'crew.master', label: 'Crew Master' },
      { id: 'crew.workload-summary', label: 'Crew Workload Summary' },
    ],
  },
]
