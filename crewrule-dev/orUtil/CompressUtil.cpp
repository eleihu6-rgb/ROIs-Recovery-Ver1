#include "CompressUtil.h"
#include <cstdio>
#include <cstring>
#include <cassert>
#include "zlib.h"
#include "ErrorCodeDef.h"

//将zlib err转为util err
int zlibErrorToErrorCode(int ret)
{
	switch (ret) {
	case Z_STREAM_ERROR:
		return ERR_INVALID_COMPRESS_LEVEL;
	case Z_DATA_ERROR:
		return ERR_INVALID_COMPRESS_DATA;
	case Z_MEM_ERROR:
		return ERR_OUT_OF_MEM;
	case Z_VERSION_ERROR:
		return ERR_INVALID_ZLIB_VERSION;
	default:
		return ret;
	}
}

#define CHUNK 16384

//compress file
//level: 0 ~ 6, level=0 will be no compress, level=6 is most compress 
int compressFile(const char *source, const char *dest, int level) {

	int ret = 0;
	int len = 0;
	unsigned have = 0;
	unsigned char buf[CHUNK] = { 0 };
	FILE * src = 0;
	gzFile dst = 0;

	src = fopen(source, "rb");
	dst = gzopen(dest, "wb");

	do {
		memset(buf, 0, CHUNK);
		memset(buf, 0, CHUNK);
		len = (int)fread(buf, 1, CHUNK, src);
		gzwrite(dst, buf, len);
	} while (len > 0);

	fclose(src);
	gzclose(dst);
	return 0;
}
//compress file
//level: 0 ~ 6, level=0 will be no compress, level=6 is most compress 
int compressFile(FILE *source, FILE *dest, int level) {

	int ret, flush;
	unsigned have;
	z_stream strm;
	unsigned char in[CHUNK];
	unsigned char out[CHUNK];

	/* allocate deflate state */
	strm.zalloc = Z_NULL;
	strm.zfree = Z_NULL;
	strm.opaque = Z_NULL;
	ret = deflateInit(&strm, level);
	if (ret != Z_OK)
		return ret;

	/* compress until end of file */
	do {

		strm.avail_in = (uInt)fread(in, 1, CHUNK, source);
		if (ferror(source)) {
			(void)deflateEnd(&strm);
			return Z_ERRNO;
		}
		flush = feof(source) ? Z_FINISH : Z_NO_FLUSH;
		strm.next_in = in;

		/* run deflate() on input until output buffer not full, finish
		compression if all of source has been read in */
		do {

			strm.avail_out = CHUNK;
			strm.next_out = out;

			ret = deflate(&strm, flush);    /* no bad return value */
			assert(ret != Z_STREAM_ERROR);  /* state not clobbered */

			have = CHUNK - strm.avail_out;
			if (fwrite(out, 1, have, dest) != have || ferror(dest)) {
				(void)deflateEnd(&strm);
				return Z_ERRNO;
			}

		} while (strm.avail_out == 0);
		assert(strm.avail_in == 0);     /* all input will be used */

		/* done when last data in file processed */
	} while (flush != Z_FINISH);
	assert(ret == Z_STREAM_END);        /* stream will be complete */

	/* clean up and return */
	(void)deflateEnd(&strm);
	return Z_OK;
}
//decompress file
int decompressFile(FILE *source, FILE *dest) {

	int ret = 0;
	unsigned have = 0;
	z_stream strm;
	unsigned char in[CHUNK] = { 0 };
	unsigned char out[CHUNK] = { 0 };

	/* allocate inflate state */
	strm.zalloc = Z_NULL;
	strm.zfree = Z_NULL;
	strm.opaque = Z_NULL;
	strm.avail_in = 0;
	strm.next_in = Z_NULL;
	ret = inflateInit2(&strm, 16 + MAX_WBITS);
	if (ret != Z_OK)
		return ret;


	/* decompress until deflate stream ends or end of file */
	do {

		strm.avail_in = (uInt)fread(in, 1, CHUNK, source);
		if (ferror(source)) {
			(void)inflateEnd(&strm);
			return Z_ERRNO;
		}
		if (strm.avail_in == 0)
			break;
		strm.next_in = in;

		/* run inflate() on input until output buffer not full */
		do {

			strm.avail_out = CHUNK;
			strm.next_out = out;


			ret = inflate(&strm, Z_NO_FLUSH);
			assert(ret != Z_STREAM_ERROR);  /* state not clobbered */
			switch (ret) {
			case Z_NEED_DICT:
				ret = Z_DATA_ERROR;     /* and fall through */
			case Z_DATA_ERROR:
			case Z_MEM_ERROR:
				(void)inflateEnd(&strm);
				return ret;
			}


			have = CHUNK - strm.avail_out;
			if (fwrite(out, 1, have, dest) != have || ferror(dest)) {
				(void)inflateEnd(&strm);
				return Z_ERRNO;
			}
		} while (strm.avail_out == 0);
		/* done when inflate() says it's done */
	} while (ret != Z_STREAM_END);

	/* clean up and return */
	(void)inflateEnd(&strm);
	return zlibErrorToErrorCode(ret == Z_STREAM_END ? Z_OK : Z_DATA_ERROR);
}



//decompress by filename
int decompressFile(const char * source, const char * dest) {
	int ret = 0;
	FILE * input = fopen(source, "rb");
	FILE * output = fopen(dest, "w+b");
	if (!input || !output) {
		ret = ERR_FILE_OPEN_FAIL;
		goto CLEANUP;
	}

	ret = decompressFile(input, output);
CLEANUP:
	if (input)
		fclose(input);
	if (output)
		fclose(output);
	return ret;
}