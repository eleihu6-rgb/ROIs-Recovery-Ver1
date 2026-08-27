-- Init script: CQF5156 Soft Rule Penalty Cost
-- Seed rule 7421 with penalty weight 5000
-- Target DB: MySQL

START TRANSACTION;

SET @cqf_id := 5156001;
SET @header_id := (SELECT COALESCE(MAX(id), 200000000) + 1 FROM cqf_parameter);
SET @row1_id := @header_id + 1;

-- Recreate CQF5156 to keep this script idempotent.
DELETE FROM cqf_parameter WHERE cqf_id = @cqf_id;
DELETE FROM cqf WHERE id = @cqf_id;

INSERT INTO cqf
(
    id,
    `function`,
    `instance`,
    class,
    description,
    reference,
    category,
    store_structure,
    source,
    detail_display,
    filiale,
    division,
    owner,
    locked,
    modified_by,
    last_modified
)
VALUES
(
    @cqf_id,
    5156,
    '001',
    'C',
    'Soft Rule Penalty Cost',
    'Pairing',
    'Cost',
    'Table',
    'General',
    'Soft Rule Penalty Cost',
    'SQ',
    'P',
    'S',
    NULL,
    'ROIS',
    CURRENT_TIMESTAMP
);

INSERT INTO cqf_parameter
(
    id,
    cqf_id,
    phase_id,
    param_names,
    param_values,
    modified_by,
    last_modified
)
VALUES
(
    @header_id,
    @cqf_id,
    1,
    'tableHeader',
    'Rule Function,Cost',
    'ROIS',
    CURRENT_TIMESTAMP
),
(
    @row1_id,
    @cqf_id,
    1,
    'tableRow1',
    '7421,5000',
    'ROIS',
    CURRENT_TIMESTAMP
);

COMMIT;
