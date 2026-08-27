#include <fstream>
#include <iostream>
#include <sstream>
#include <time.h>
#include <string.h>
#include <algorithm>
//#include <comdef.h>
#include "csv_reader.h"
#include "UtilFunc.h"
#include "../OrLog.h"
#include "Log/Logger.h"

//#pragma comment(lib, "comsuppw.lib")

int dbgCount = 0;
long long dbgCreateInstance = 0;
long long dbgFromCsv = 0;
long long dbgPush_back = 0;
long long dbgReadFile = 0;
long long dbgTestTimer = 0;

//hex char --> int, eg:'1'->1, 'F'->15
static int hexToInt(char ch) {
	if (ch <= '9' && ch >= '0')
		return ch - '0';
	else if (ch <= 'F' && ch >= 'A')
		return ch - 'A' + 10;
	else if (ch <= 'f' && ch >= 'a')
		return ch - 'a' + 10;
	else
		return -1;
}
//reverse escape, eg: '%5E' --> '^'
static char deEscape(char h, char l) {
	int ih = hexToInt(h);
	int il = hexToInt(l);
	return ih * 16 + il;
}
static void deEscape(char * input, int startIndex, int endIndex, char * output) {

	int j = 0;
	for (int i = startIndex; i < endIndex; i++) {
		char c = input[i];
		if (c != '%') {
			output[j] = c;
			j++;
		}
		else {
			char next1 = input[i + 1];
			char next2 = input[i + 2];
			char ch = (char)deEscape(next1, next2);
			output[j] = ch;
			j++;
			i += 2; //skip next1/next2
		}
	}
}

string csvReader::readLine(ifstream& in) {

	spliter.reset();
	char * buf = spliter.getBuf();
	in.getline(buf, SPLITER_BUF_SIZE - 1, '\n');
	if (strnlen(buf, SPLITER_BUF_SIZE) == 0) {
		return "";
	}
	return buf;
}

//可以读取中文
//string csvReader::readLine_wf(wifstream& in) {
//
//	spliter.reset();
//
//	wstring tmpLine;
//	getline(in, tmpLine);
//	
//	_bstr_t t = tmpLine.c_str();
//	char* buf = (char*)t;
//	spliter.setBuf(buf);
//
//	return buf;
//}

//从line解析tableName，存入this->table
void csvReader::parseTableName(string& line) {

	int index1 = (int)strnlen(TableSeparator, 100);
	int index2 = (int)line.substr(index1).find_first_of("("); //若table行有 size信息
	if (index2 == -1)
		index2 = (int)line.substr(index1).find_first_of(":"); //若table行无 size信息
	if (index2 == -1)
		index2 = (int)line.substr(index1).length();           //若table分隔行没有':'
	string originTableName = trim(line.substr(index1, index2));
	table = getParserName(originTableName);
	//COF data: CREW/CREW_RANK/CREW_FLEET/CREW_BASE/CREW_QUAL
	vector<string> suffixList = { "(COF)", "(COMMUTE)", "(LEADIN)", "(ALL)"};
	for (string suffix : suffixList) {
		if (line.find(suffix) != string::npos) {
			table = table + suffix;
		}
	}
	Logger::getRuleLogger()->info("parse csv: {} start", table);

	parser = getParser(table);
	if (parser.get() == NULL || !parser->isAvailable()) {
		Logger::getRuleLogger()->error("ERROR: table {} is not supported", table);
		return;
	}

	headers.clear();
	int index3 = (int)line.find(":");
	string headerStr = line.substr(index3 + 1);
	for (string suffix : suffixList) {
		if (headerStr.find(suffix) != -1) {
			headerStr = headerStr.substr(headerStr.find(suffix) + suffix.length());
		}
	}
	split(headerStr, ',', headers);
	parser->init(headers);

	if (table == "Base") {
		bool isForV2 = find(headers.begin(), headers.end(), "filiale") != headers.end();
		if (isForV2) {
			version = 3;
		}
		else {
			version = 2;
		}
	}

}

void csvReader::parserLine(string& line) {
	parserLine(line.c_str());

}
void csvReader::parserLine(const char* line) {

	//line for table values
	if (parser.get() == NULL || !parser->isAvailable()) {
		return;
	}
	void* data = parser->createInstance();
	for (std::size_t i = 0; i < headers.size(); i++) {
		char * value = spliter.getNextWord();
		if (!value) {
			Logger::getRuleLogger()->error("parser fail, header={} line=", headers[i], line);
			break;
		}
		long long n1 = getTimestampNano(); ///TEST
		parser->fromCsv(headers, (int)i, value, data);
		long long n2 = getTimestampNano(); ///TEST
		dbgFromCsv += (n2 - n1); ///TEST
	}
	datas[table].push_back(data);

	//dbg
	dbgCount++;
	//if (dbgCount % 10000 == 9999) cout << ".";
}

//读取csv文件，存入 reader.datas
void csvReader::readMutiTableCsv(string filepath) {

	int dbgCount = 0;

	string table;
	string originTableName;
	shared_ptr<csvParser> parser;
	vector<string> headers;

	long long dbgCreateInstance = 0;
	long long dbgFromCsv = 0;
	long long dbgPush_back = 0;
	long long dbgReadFile = 0;

	time_t t0 = time(0);
	long long nA = getTimestampNano();
	ifstream in(filepath, std::ios::binary); Logger::getRuleLogger()->info("parse csv start");

	csvSpliter spliter('^'); //delim: ^

	while (in.good()) {
		spliter.reset();

		string line = readLine(in);
		if (line.empty()) {
			//skip empty line
		}
		//line for table header: init table & headers
		else if (line.substr(0, strnlen(TableSeparator, 100)) == TableSeparator) {
			parseTableName(line);
		}
		else {
			parserLine(line);
		}
	}

	in.close();

	time_t t1 = time(0);
	long long nB = getTimestampNano();

	Logger::getRuleLogger()->info("");
	Logger::getRuleLogger()->info("\ntotal={}   dbgFromCsv={} ",
		(nB - nA) / 1000000, dbgFromCsv / 1000000);
	Logger::getRuleLogger()->info("TEST mandayParser.fromCsv() total={}", dbgTestTimer / 1000000);

}

//void csvReader::readMutiTableCsv(string filepath) {
//
//	int dbgCount = 0;
//
//	string table;
//	string originTableName;
//	shared_ptr<csvParser> parser;
//	vector<string> headers;
//
//	long long dbgCreateInstance = 0;
//	long long dbgFromCsv = 0;
//	long long dbgPush_back = 0;
//	long long dbgReadFile = 0;
//
//	//可以读取中文
//	std::wifstream in(filepath);
//	in.imbue(std::locale("zh_CN.UTF-8"));
//
//	time_t t0 = time(0);
//	long long nA = getTimestampNano();
//	Logger::getRuleLogger()->info("parse csv start");
//	
//	csvSpliter spliter('^'); //delim: ^
//	
//	while (in.good()) {
//		spliter.reset();
//	
//		string line = readLine_wf(in);
//		if (line.empty()) {
//			//skip empty line
//		}
//		//line for table header: init table & headers
//		else if (line.substr(0, strnlen(TableSeparator, 100)) == TableSeparator) {
//			parseTableName(line);
//		}
//		else {
//			parserLine(line);
//		}
//	}
//	
//	in.close();
//	
//	time_t t1 = time(0);
//	long long nB = getTimestampNano();
//	
//	Logger::getRuleLogger()->info("");
//	Logger::getRuleLogger()->info("\ntotal={}   dbgFromCsv={} ",
//		(nB - nA) / 1000000, dbgFromCsv / 1000000);
//	Logger::getRuleLogger()->info("TEST mandayParser.fromCsv() total={}", dbgTestTimer / 1000000);
//
//}


//mantis#2937, read csv file by memMap
//CSV解析：MemoryMap方式加快文件读取
//void csvReader::readMutiTableCsvByMemMap(string filepath) {
//
//	int dbgCount = 0;
//
//	string table;
//	string originTableName;
//	shared_ptr<csvParser> parser;
//	vector<string> headers;
//
//	long long dbgCreateInstance = 0;
//	long long dbgFromCsv = 0;
//	long long dbgPush_back = 0;
//	long long dbgReadFile = 0;
//
//	time_t t0 = time(0);
//	long long nA = getTimestampNano();
//	Logger::getRuleLogger()->info("parse csv start");
//	//csvSpliter spliter('^'); //delim: ^
//
//	MemoryMapped memMap(filepath);
//	long long size = memMap.size();
//	const unsigned char * buf = memMap.getData();
//	const unsigned char * lineBeg = buf;
//	const unsigned char * lineEnd = buf;
//
//	while (lineBeg - buf < size && lineEnd - buf < size) {
//		//find line beg
//		if (lineEnd != buf)
//			lineBeg = lineEnd + 1;
//		while (lineBeg - buf < size && (*lineBeg == '\r' || *lineBeg == '\n')) {
//			lineBeg++;
//		}
//		if (lineBeg - buf >= size) {
//			break;
//		}
//		//find line end
//		lineEnd = lineBeg;
//		while (lineEnd - buf < size && (*lineEnd != '\r' && *lineEnd != '\n')) {
//			lineEnd++;
//		}
//
//		spliter.reset();
//		if (lineBeg == lineEnd) {
//			//skip empty line
//		}
//		//line for table header: init table & headers
//		//else if (line.substr(0, strnlen(TableSeparator, 100)) == TableSeparator) {
//		else if (0 == strncmp((char*)lineBeg, TableSeparator, lineEnd - lineBeg)) {
//			string line((const char*)lineBeg, lineEnd - lineBeg);
//			parseTableName(line);
//		}
//		else {
//			memcpy(spliter.getBuf(), lineBeg, lineEnd - lineBeg);
//			string line((char*)lineBeg, lineEnd - lineBeg);
//			parserLine(line);
//		}
//	}
//
//	memMap.close();
//
//	time_t t1 = time(0);
//	long long nB = getTimestampNano();
//
//	Logger::getRuleLogger()->info("");
//	Logger::getRuleLogger()->info("total={}   dbgFromCsv={} ",
//		(nB - nA) / 1000000, dbgFromCsv / 1000000);
//	Logger::getRuleLogger()->info("TEST mandayParser.fromCsv() total={}", dbgTestTimer / 1000000);
//
//}

//读取csv文件中特定数据段，数据段名tableName，放入OUTPUT型参数result中
void csvReader::readSingleTableFromCsv(string filepath, string tableName, vector<string>& result) {

	int dbgCount = 0;

	bool isTargetTable = false;

	long long dbgCreateInstance = 0;
	long long dbgFromCsv = 0;
	long long dbgPush_back = 0;
	long long dbgReadFile = 0;

	time_t t0 = time(0);
	long long nA = getTimestampNano();
	ifstream in(filepath, std::ios::binary); Logger::getRuleLogger()->info("parse csv start");

	csvSpliter spliter('^'); //delim: ^

	while (in.good()) {
		spliter.reset();

		string line = readLine(in);
		if (line.empty()) {
			//skip empty line
		}
		//line for table header: init table & headers
		else if (line.substr(0, strnlen(TableSeparator, 100)) == TableSeparator) {
			if (line.substr(strnlen(TableSeparator, 100)).find(tableName) == 0) {
				isTargetTable = true;
				
			}
			else {
				isTargetTable = false;
			}
		}
		else {
			if (isTargetTable)
				result.push_back(line);
		}
	}

	in.close();

	time_t t1 = time(0);
	long long nB = getTimestampNano();

	Logger::getRuleLogger()->info("");
	Logger::getRuleLogger()->info("\ntotal={}   dbgFromCsv={} ",
		(nB - nA) / 1000000, dbgFromCsv / 1000000);
	Logger::getRuleLogger()->info("TEST mandayParser.fromCsv() total={}", dbgTestTimer / 1000000);

}

//写csv文件
void csvReader::write(ofstream& outfile, string tableName, vector<void*>& list, shared_ptr<csvParser> parser) {
	if (list.size() == 0) {
		return;
	}
	outfile << "------" << tableName << "(" << list.size() << "):";
	for (std::size_t i = 0; i < parser->getDefaultHeaders().size(); i++) {
		if (i > 0)
			outfile << ",";
		outfile << parser->getDefaultHeaders()[i];
	}
	outfile << "\n";
	for (std::size_t i = 0; i < list.size(); i++) {
		string line = parser->toCsv(parser->getDefaultHeaders(), list[i]);
		outfile << line << "\n";
	}
	outfile << std::flush;
}

//清理datas数据
void csvReader::clear() {
	map<string, vector<void*>>::iterator it;
	for (it = datas.begin(); it != datas.end(); it++) {
		shared_ptr<csvParser> parser = this->getParser(it->first);
		for (std::size_t i = 0; i < it->second.size(); i++) {
			parser->deleteInstance(it->second[i]);
		}
	}
}

int csvSpliter::count() {
	int wordCount = 0;
	for (int i = 0; i < SPLITER_BUF_SIZE; i++) {
		if (buf[i] == '\0')
			break;
		if (buf[i] == delim)
			wordCount++;
	}
	return wordCount;
}

void csvSpliter::reset() {
	index = 0;
	memset(word, 0, sizeof(word));
	memset(buf, 0, sizeof(buf));
}

char * csvSpliter::getBuf() {
	return buf;
}

//void csvSpliter::setBuf(char* inputChar) {
//	strcpy_s(buf, strlen(inputChar)+1, inputChar);
//}

char * csvSpliter::getNextWord() {
	memset(this->word, 0, sizeof(word));
	if (index >= sizeof(buf))
		return NULL;

	//20180705 ain, mantis#3585, 针对特殊字符转义逻辑'^'-->'%5E'
	//find next word
	int nextDelimtIndex = index;
	for (nextDelimtIndex = index; nextDelimtIndex < sizeof(buf); nextDelimtIndex++) {
		if (buf[nextDelimtIndex] == '\0')
			break;
		if (buf[nextDelimtIndex] == this->delim && (nextDelimtIndex == 0 || buf[nextDelimtIndex-1] != '\\'))
			break;
	}

	memset(word, 0, sizeof(word));
	//memcpy(word, buf + index, nextDelimtIndex - index);
	//20180705 ain, mantis#3585, de-escape: '%5E' --> '^'
	deEscape(buf, index, nextDelimtIndex, word);
	index = nextDelimtIndex + 1;
	return word;
}
csvSpliter::csvSpliter(char delim) : delim(delim) {

}


//读取csv文件 attribute表，以实现先初始化 Attribute效果
void csvReader::readCsvAttribute(string filepath) {
	ifstream in(filepath, std::ios::binary);
	while (in.good()) {
		string line = readLine(in);
		//line for table header: init table & headers
		if (line.substr(0, strnlen(TableSeparator, 100)) == TableSeparator) {
			parseTableName(line);
		}
		else {
			const vector<string> attribNames = { "Attribute", "TagCategory", "TagGroup", "TagFlight", "TagDuty", "TagPairing" , "TagFlightComposition"};
			if (std::find(attribNames.begin(), attribNames.end(), table) != attribNames.end())
				parserLine(line);
		}
	}
	in.close();
}