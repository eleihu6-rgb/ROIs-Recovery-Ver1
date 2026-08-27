#include <stdio.h>
#include <stdlib.h>
#include <vector>
#include <fstream>

#include <mutex>
#include <time.h>
#include <string>
#include "CrewDB.h"
#include <iostream>
#include "CrewDBUtil.h"



//#include "orUtil.h"

using namespace std;

#ifdef WIN32
#include "base64.h"
#include "aes.h"
#include "UtilFunc.h"
#include "StringUtil.h"
#else
#include <UtilFunc.h>
#include <StringUtil.h>
#include <aes.h>
#include <base64.h>
#endif

//#define byte unsigned char

//加密password
//例如"PICREW" --> "ENC(Xqyzkt6WNvGsMCotsr0ZseA==)"
//步骤
//   PICREW --> aes加密(aes/ecb/pkcs5padding) 
//   44 3a ed ab 58 ae 8a 24 01 e0 4b 28 32 d6 9f 28 --> base64解码
//   qyzkt6WNvGsMCotsr0ZseA== --> 添加首字母
//   Xqyzkt6WNvGsMCotsr0ZseA== --> 添加enc()封装
//std::string encryptPassword(std::string input) {
//	const int AES_LEN = 16;
//	char key[16] = "iROS_P36_201708";
//	char plain[1024] = { 0 };
//	char encBuf[1024] = { 0 };
//	char base64Buf[2048] = { 0 };
//	char result[2048] = { 0 };
//
//	int plainLen = (int)input.length();
//	int aesLen = (plainLen - plainLen % AES_LEN) + AES_LEN;
//	int paddingLen = aesLen - plainLen;
//	int ecbRound = aesLen / AES_LEN;
//
//	//aes decrypt
//	strncpy(plain, input.c_str(), 1024);
//	plain[aesLen - 1] = paddingLen;
//	for (int i = 0; i < ecbRound; i++) {
//		AES_ECB_encrypt((byte*)plain + AES_LEN*i, (byte*)key, (byte*)encBuf + AES_LEN*i, AES_LEN);
//	}
//	//base64 encode
//	int encLen = Base64encode(base64Buf, encBuf, aesLen);
//	//添加首字母和Enc()前缀
//	strncpy(result, "ENC(", sizeof(result));
//	strncat(result, "X", sizeof(result));
//	strncat(result, base64Buf, sizeof(result));
//	strncat(result, ")", sizeof(result));
//
//	return result;
//}

//解密password
//例如"ENC(Xqyzkt6WNvGsMCotsr0ZseA==)"  --> "PICREW"
//步骤
//   去除enc()封装 --> Xqyzkt6WNvGsMCotsr0ZseA==
//   忽略首字母    --> qyzkt6WNvGsMCotsr0ZseA==
//   base64解码   --> 44 3a ed ab 58 ae 8a 24 01 e0 4b 28 32 d6 9f 28
//   aes解密(aes/ecb/pkcs5padding) --> PICREW
//string decryptPassword(string input) {
//	const int AES_LEN = 16;
//	char key[16] = "iROS_P36_201708";
//	char encBuf[1024] = { 0 };
//	char decBuf[1024] = { 0 };
//
//	if (input.find("ENC(") != 0) {
//		return input;
//	}
//	if (input.length() > sizeof(encBuf) * 3 / 4) {
//		Logger::getRuleLogger()->error("decodePassword fail, input too long");
//	}
//
//	//skip prefix 'ENC(', and skip first char
//	//int offsetStart = strlen("ENC(") + 1;
//	int offsetStart = (int)strlen("ENC(") ;
//	//skip last ')'
//	string base64Str = input.substr(offsetStart, input.length() - offsetStart - 1);
//	//base64 decode
//	int encLen = Base64decode(encBuf, base64Str.c_str());
//	//aes decrypt
//	int ecbRound = encLen / AES_LEN;
//	for (int i = 0; i < ecbRound; i++) {
//		AES_ECB_decrypt((byte*)encBuf + AES_LEN*i, (byte*)key, (byte*)decBuf + AES_LEN*i, AES_LEN);
//	}
//	//remove pkcs5padding
//	encLen = encLen - decBuf[encLen - 1];
//	decBuf[encLen] = 0;
//	//to string
//	return decBuf;
//}

//AES_CBC 解密
//1 base64 decode 
//2 aes_cbc decrypt 
//3 remove pkcs5padding
void decrypt(string& input, string& output) {
	char* decodedBuffer = NULL;

	decodedBuffer = (char*)malloc(strlen(input.c_str()) + 1);
	int len = Base64decode(decodedBuffer, input.c_str());

	if (len < 0) {
		printf("Base64 decoding failed.\n");
	}
	else {
		decodedBuffer[len] = '\0';
	}

	unsigned char key[] = "1111222233334444";
	unsigned char iv[16] = { 1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8 };
	unsigned char decrypted[1024];

	uint8_t* data = reinterpret_cast<uint8_t*>(const_cast<char*>(decodedBuffer));
	size_t length = len;

	AES_CBC_decrypt_buffer(decrypted, data, (uint32_t)length, key, iv);

	output = string((char*)decrypted, length);
	int paddingSize = output[output.length() - 1];
	if (paddingSize >= 1 && paddingSize <= 16) {
		output = output.substr(0, output.length() - paddingSize);
	}

	free(decodedBuffer);
}

//aes_cbc加密
string encrypt(string input) {
	const uint8_t key[] = "1111222233334444";
	const uint8_t iv[] = { 1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8 };
	const int BLOCKLEN = 16;

	// Convert string to byte array
	uint8_t* input_bytes = reinterpret_cast<uint8_t*>(const_cast<char*>(input.c_str()));
	uint32_t length = (uint32_t)input.length();

	// Calculate the length with padding
	uint32_t length_with_padding = (length + BLOCKLEN - 1) / BLOCKLEN * BLOCKLEN;

	// Create output buffer
	uint8_t* output = new uint8_t[length_with_padding];

	// Add PKCS#7 padding
	uint8_t pad_value = length_with_padding - length;
	for (uint32_t i = length; i < length_with_padding; ++i) {
		input_bytes[i] = pad_value;
	}

	// Encrypt
	AES_CBC_encrypt_buffer(output, input_bytes, length_with_padding, key, iv);

	// Convert encrypted byte array to Base64 string
	char* base64_encoded = new char[2 * length_with_padding];
	Base64encode(base64_encoded, reinterpret_cast<char*>(output), length_with_padding);
	string output_base64 = string(base64_encoded);

	delete[] output;
	delete[] base64_encoded;

	return output_base64;
}

//从RuleServiceConfig.txt读取数据源配置
int loadRuleSrvConfig(DATA_SOURCE_CONFIG& config) {
	ifstream fis("RuleServiceConfig.txt");
	//读取配置文件 Database_connections.txt
	if (fis.is_open()) {
		char buf[1024] = { 0 };
		vector<string> list;
		while (!fis.eof())
		{
			fis.getline(buf, sizeof(buf) - 1);
			list.push_back(buf);
		}
		fis.close();

		//先判断sourceType=db/server
		config.dataSourceType = "db"; //default
		for (std::size_t i = 0; i < list.size(); i++) {
			int index = (int)list[i].find_first_of("=");
			string name = list[i].substr(0, index);
			string value = list[i].substr(index+1);
			if (name == "data_source")
				config.dataSourceType = strToLower(value);
		}
		//
		for (std::size_t i = 0; i < list.size(); i++) {
			int index = (int)list[i].find_first_of("=");
			string name = list[i].substr(0, index);
			string value = list[i].substr(index + 1);
			if (name == "DatabaseURL" && config.dataSourceType == "db")
				config.url = value;
			else if (name == "data_source_server" && config.dataSourceType == "server")
				config.url = strToLower(value);
			else if (name == "DatabaseUsername")
				config.user = value;
			else if (name == "DatabasePassword")
				config.password = value;
		}
		fis.close();
		return SUCCESS;
	}
	else {
		return ERR_FILE_OPEN_FAIL;
	}
}

//从Database_connection.txt读取数据源配置
int loadDatabaseConnectionConfig(DATA_SOURCE_CONFIG& config) {
	ifstream fis("Database_connection.txt");
	//读取配置文件 Database_connections.txt
	if (fis.is_open()) {
		//旧格式读取db配置
		fis >> config.url;
		fis >> config.user;
		fis >> config.password;
		//新格式带'='配置行读取配置项
		fis.clear();
		fis.seekg(0, ios::beg);
		char buf[1024] = { 0 };
		vector<string> list;
		while (!fis.eof())
		{
			fis.getline(buf, sizeof(buf) - 1);
			list.push_back(buf);
		}
		fis.close();
		//先判断sourceType=db/server
		config.dataSourceType = "db"; //default
		for (std::size_t i = 0; i < list.size(); i++) {
			vector<string> raw;
			split(list[i], '=', raw);
			if (raw[0] == "data_source") {
				vector<string> temp_dataSourceType;
				split(raw[1], '\r', temp_dataSourceType);
				config.dataSourceType = strToLower(temp_dataSourceType[0]);
			}
			else if (raw[0] == "data_source_server" && config.dataSourceType == "server") {
				vector<string> temp_url;
				split(raw[1], '\r', temp_url);
				// config.url = strToLower(temp_url[0]);
				config.url = temp_url[0];
			}
		}
		fis.close();
		return SUCCESS;
	}
	else {
		return ERR_FILE_OPEN_FAIL;
	}
}
