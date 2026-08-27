export const buildPairingExternalLabelExpression = (alias = "p") => `
  coalesce(
    nullif(trim(
      case
        when upper(coalesce(${alias}.interface_id, '')) ~ '^[A-Z]+[A-Z0-9]*[0-9][A-Z0-9]*$'
          then ${alias}.interface_id
        else null
      end
    ), ''),
    nullif(trim(${alias}.pairing_label), '')
  )
`;

export const buildPairingDisplayLabelExpression = (alias = "p") => `
  coalesce(
    ${buildPairingExternalLabelExpression(alias)},
    ${alias}.id::text
  )
`;
