import { gzipSync } from "node:zlib";

type TarFile = {
  name: string;
  content: Buffer;
};

const TAR_BLOCK_SIZE = 512;

const writeOctal = (
  header: Buffer,
  value: number,
  offset: number,
  length: number,
) => {
  const octal = value.toString(8).padStart(length - 1, "0").slice(-(length - 1));
  header.write(`${octal}\0`, offset, length, "ascii");
};

const buildHeader = (file: TarFile) => {
  if (Buffer.byteLength(file.name, "utf8") > 100) {
    throw new Error(`Tar entry name is too long: ${file.name}`);
  }

  const header = Buffer.alloc(TAR_BLOCK_SIZE, 0);

  header.write(file.name, 0, 100, "utf8");
  writeOctal(header, 0o644, 100, 8);
  writeOctal(header, 0, 108, 8);
  writeOctal(header, 0, 116, 8);
  writeOctal(header, file.content.length, 124, 12);
  writeOctal(header, Math.floor(Date.now() / 1000), 136, 12);
  header.fill(" ", 148, 156);
  header.write("0", 156, 1, "ascii");
  header.write("ustar", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");

  let checksum = 0;

  for (const byte of header) {
    checksum += byte;
  }

  const checksumValue = checksum.toString(8).padStart(6, "0").slice(-6);
  header.write(`${checksumValue}\0 `, 148, 8, "ascii");

  return header;
};

const padToTarBlock = (content: Buffer) => {
  const remainder = content.length % TAR_BLOCK_SIZE;

  if (remainder === 0) {
    return Buffer.alloc(0);
  }

  return Buffer.alloc(TAR_BLOCK_SIZE - remainder, 0);
};

export const createTgzArchive = (files: TarFile[]) => {
  const chunks = files.flatMap((file) => [
    buildHeader(file),
    file.content,
    padToTarBlock(file.content),
  ]);

  chunks.push(Buffer.alloc(TAR_BLOCK_SIZE * 2, 0));

  return gzipSync(Buffer.concat(chunks));
};
