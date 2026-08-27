#include <cstdio>

//compress file
//level: 0 ~ 6, level=0 will be no compress, level=6 is most compress 
int compressFile(FILE *source, FILE *dest, int level);
int compressFile(const char *source, const char *dest, int level);

//decompress file
int decompressFile(FILE *source, FILE *dest);
int decompressFile(const char * source, const char * dest);