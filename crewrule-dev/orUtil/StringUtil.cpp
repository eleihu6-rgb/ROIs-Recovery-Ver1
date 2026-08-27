#include <stdlib.h>
#include <string.h>
#include <map>
#include <iostream>
#include <stdio.h>
#include <iostream>
#include <sstream>
#include "StringUtil.h"
#include <string_view>

using namespace std;

static std::vector<std::string_view> split(const std::string_view& str, const char delim) {
	std::vector<std::string_view> result;
	size_t start = 0;
	size_t end = str.find(delim);

	while (end != std::string_view::npos) {
		result.push_back(str.substr(start, end - start));
		start = end + 1;
		end = str.find(delim, start);
	}

	result.push_back(str.substr(start));
	return result;
}


//将char* 解析为str列表
void split(const char * input, char delim, vector<string> &result) {

	if (input == NULL) {
		return;
	}
	std::stringstream ss(input);

	while (ss.good())
	{
		string substr;
		getline(ss, substr, delim);
		result.push_back(substr);
	}
}

//将char* 解析为str列表
void split(const char * input, char delim, std::set<string> &result) {

	if (input == NULL) {
		return;
	}
	std::stringstream ss(input);

	while (ss.good())
	{
		string substr;
		getline(ss, substr, delim);
		result.insert(substr);
	}
}

/*
* 字符串拆成map，字符串格式：key1[:value1][delim]key2[:value2]，例如：A320|B777，A320:1|B777:2
* "A320|B777" -> (A320,1),(B777,1)
* "A320:2|B777:3" -> (A320,2),(B777,3)
*/
void split(const char * input, char delim, std::map<string, int> &map) {
	if (input == NULL) {
		return;
	}

	std::string_view sv = input;
	auto keyValues = split(input, delim);
	for (auto& keyValue : keyValues) {
		if (keyValue.empty()) {
			continue;
		}
		auto pair = split(keyValue, ':');
		if (pair.size() < 2) {
			map.insert(std::make_pair(pair[0], 1));
		}
		else {
			map.insert(std::make_pair(pair[0], atoi(pair[1].data())));
		}
	}
}

struct splitCacheItem {
	string str;
	char delim;
	vector<string> result;
};
static map< string, splitCacheItem > g_splitCache; // str -> vector
void splitWithCache(string str, char delim, vector<string>& result) {
	vector<string> * tmp = splitWithCachePtr(str, delim);
	result.insert(result.end(), tmp->begin(), tmp->end());
}

const vector<string>& splitWithCache(string str, char delim) {
	vector<string> * tmp = splitWithCachePtr(str, delim);
	return *tmp;
}


vector<string>* splitWithCachePtr(string str, char delim) {
	if (g_splitCache.find(str) != g_splitCache.end()) {
		splitCacheItem& item = g_splitCache[str];
		if (item.delim == delim) {
			return &item.result;
		}
	}
	splitCacheItem item;
	split(str.c_str(), delim, item.result);
	item.str = str;
	item.delim = delim;
	g_splitCache[str] = item;
	return &(g_splitCache[str].result);
}

//str是否int
bool isDigitStr(const char * str, std::size_t len) {
	std::size_t i = 0;
	bool isDigit = true;
	for (i = 0; i < len; i++) {
		if (str[i] == '\0') {
			break;
		}
		if (str[i] > '9' || str[i] < '0') {
			isDigit = false;
			break;
		}
	}
	return isDigit & (i > 0);
}

//true: float or int, false: other
bool isNumberStr(const char * str, std::size_t len) {
	std::size_t i = 0;
	bool isDigit = true;
	std::size_t dotCount = 0;
	for (i = 0; i < len; i++) {
		if (str[i] == '\0') {
			break;
		}
		if (str[i] == '.') {
			dotCount++;
		}
		else if (str[i] > '9' || str[i] < '0') {
			isDigit = false;
			break;
		}
	}
	return isDigit && (i > 0) && (dotCount <= 1);
}

int strToInt(string str, int defaultVal) {
	if (!isNumberStr(str.c_str(), str.length())) {
		return defaultVal;
	}
	return stoi(str);
}

string llToStr(const long long value) {
	stringstream ss;
	ss << value;
	return ss.str();
}

string trim(const string& str)
{
	string::size_type pos = str.find_first_not_of(' ');
	if (pos == string::npos)
	{
		pos = 0;
	}
	string::size_type pos2 = str.find_last_not_of(' ');
	if (pos2 != string::npos)
	{
		return str.substr(pos, pos2 - pos + 1);
	}
	return str.substr(pos);
}

int split(const string& str, vector<string>& ret_, string sep)
{
	if (str.empty())
	{
		return 0;
	}
	if (str == "*") {
		string a = str;
	}

	string tmp;
	string::size_type pos_begin = str.find_first_not_of(sep);
	string::size_type comma_pos = 0;

	while (pos_begin != string::npos)
	{
		comma_pos = str.find(sep, pos_begin);
		if (comma_pos != string::npos)
		{
			tmp = str.substr(pos_begin, comma_pos - pos_begin);
			pos_begin = comma_pos + sep.length();
		}
		else
		{
			tmp = str.substr(pos_begin);
			pos_begin = comma_pos;
		}

		if (!tmp.empty())
		{
			ret_.push_back(tmp);
			tmp.clear();
		}
	}
	return 0;
}

string replace(const string& str, const string& src, const string& dest)
{
	string ret;

	string::size_type pos_begin = 0;
	string::size_type pos = str.find(src);
	while (pos != string::npos)
	{
		//cout << "replacexxx:" << pos_begin << " " << pos << "\n";
		ret.append(str.data() + pos_begin, pos - pos_begin);
		ret += dest;
		pos_begin = pos + 1;
		pos = str.find(src, pos_begin);
	}
	if (pos_begin < str.length())
	{
		ret.append(str.begin() + pos_begin, str.end());
	}
	return ret;
}

bool isEndsWith(std::string const & value, std::string const & ending)
{
	if (ending.size() > value.size()) return false;
	return std::equal(ending.rbegin(), ending.rend(), value.rbegin());
}

bool isEndsWith(std::string const & value, const char* endStr)
{
	string ending = endStr;
	if (ending.size() > value.size()) return false;
	return std::equal(ending.rbegin(), ending.rend(), value.rbegin());
}

void strToupper(char* buf, int size) {
	int i = 0;
	if (!buf)
		return;

	for (i = 0; i < size; i++) {
		buf[i] = toupper(buf[i]);
	}
}

string strToUpper(string str) {
	std::size_t i = 0;
	int bufsize = (int)str.length() * 2 + 2;
	char * buf = new char[bufsize];
	memset(buf, 0, bufsize);
	for (i = 0; i < str.size(); i++) {
		buf[i] = toupper(str.at(i));
	}
	string result = buf;
	delete[] buf;
	buf = NULL;
	return result;
}
string strToLower(string str) {
	std::size_t i = 0;
	int bufsize = (int)str.length() * 2 + 2;
	char * buf = new char[bufsize];
	memset(buf, 0, bufsize);
	for (i = 0; i < str.size(); i++) {
		buf[i] = tolower(str.at(i));
	}
	string result = buf;
	delete[] buf;
	buf = NULL;
	return result;
}
string toUpper(string s) {
	return strToUpper(s);
}
string toLower(string s) {
	return strToLower(s);
}


// 在字符串左侧补足指定字符至指定总宽度
std::string padLeft(const std::string& str, const size_t totalWidth, const char fillChar) {
	size_t currentWidth = str.size();
	if (currentWidth >= totalWidth) return str; // 如果当前宽度已经足够，直接返回原字符串
	return std::string(totalWidth - currentWidth, fillChar) + str; // 在前面补足零
}
