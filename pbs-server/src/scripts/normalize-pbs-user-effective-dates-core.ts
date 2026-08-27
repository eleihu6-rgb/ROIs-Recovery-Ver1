import { z } from "zod";

export const PBS_USER_NORMALIZATION_ENVIRONMENTS = {
  development: "f8_pbs",
  sit: "f8_pbs",
  uat: "f8_pbs",
} as const;

export type PbsUserNormalizationEnvironment =
  keyof typeof PBS_USER_NORMALIZATION_ENVIRONMENTS;

export type PbsUserNormalizationCommand = {
  apply: boolean;
  environment: PbsUserNormalizationEnvironment;
  expectedCount: number | null;
};

const environmentSchema = z.enum(["development", "sit", "uat"]);

const readArgumentValue = (args: string[], name: string): string | null => {
  const index = args.indexOf(name);

  if (index < 0) {
    return null;
  }

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
};

export const parsePbsUserNormalizationCommand = (
  args: string[],
): PbsUserNormalizationCommand => {
  const supportedArguments = new Set([
    "--apply",
    "--environment",
    "--expected-count",
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (!argument.startsWith("--")) {
      continue;
    }
    if (!supportedArguments.has(argument)) {
      throw new Error(`Unsupported argument: ${argument}`);
    }
    if (argument !== "--apply") {
      index += 1;
    }
  }

  const environment = environmentSchema.parse(
    readArgumentValue(args, "--environment"),
  );
  const apply = args.includes("--apply");
  const expectedCountValue = readArgumentValue(args, "--expected-count");
  const expectedCount = expectedCountValue === null
    ? null
    : z.coerce.number().int().nonnegative().parse(expectedCountValue);

  if (apply && expectedCount === null) {
    throw new Error("--apply requires --expected-count.");
  }

  return { apply, environment, expectedCount };
};

export const expectedPbsUserNormalizationSchema = (
  environment: PbsUserNormalizationEnvironment,
): string => PBS_USER_NORMALIZATION_ENVIRONMENTS[environment];
