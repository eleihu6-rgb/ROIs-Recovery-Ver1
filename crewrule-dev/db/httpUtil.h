#ifndef HTTP_UTIL_H
#define HTTP_UTIL_H

#include <string>

int readFileWithAlloc(const char* filepath, char** pBuf, int* pSize);

//http
int sendHttpReq(std::string url, std::string& token, const char * contentType, char* inputBuf, int inputLen, const char* outputFile);
int sendHttpReq2(std::string url, std::string& token, const char * contentType, char* inputBuf, int inputLen, char* outputBuf, int& outputLen);

#endif//HTTP_UTIL_H