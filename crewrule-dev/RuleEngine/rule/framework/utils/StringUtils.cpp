#include "StringUtils.h"

#include<sstream>
#include <cctype> 
#include <climits>

//字符串转化成整数
int StringUtils::stoi(const string& str, const int defaultValue) {
	return str.empty() ? defaultValue : std::stoi(str);
}

//字符串转化成整数
long StringUtils::stol(const string& str, const long defaultValue) {
	return str.empty() ? defaultValue : std::stol(str);
}

//字符串转化成整数
long long StringUtils::stoll(const string& str, const long long defaultValue) {
	return str.empty() ? defaultValue : std::stoll(str);
}

//字符串转化成单精度
float StringUtils::stof(const string& str, const float defaultValue) {
	return str.empty() ? defaultValue : std::stof(str);
}

//字符串转化成双精度
double StringUtils::stod(const string& str, const double defaultValue) {
	return str.empty() ? defaultValue : std::stod(str);
}

//整数转化成字符串
string StringUtils::itos(const int value, const bool isNa) {
	if (isNa && (value == INT_MIN || value == INT_MAX)) {
		return "NA";
	}
	stringstream ss;
	ss << value;
	return ss.str();
}

//长整数转化成字符串
string StringUtils::ltos(const long value, const bool isNa) {
	if (isNa && (value == LONG_MIN || value == LONG_MAX)) {
		return "NA";
	}
	stringstream ss;
	ss << value;
	return ss.str();
}

//64位整数转化成字符串
string StringUtils::lltos(const long long value, const bool isNa) {
	if (isNa && (value == LLONG_MAX || value == LLONG_MIN)) {
		return "NA";
	}
	stringstream ss;
	ss << value;
	return ss.str();
}

//单精度转化成字符串
string StringUtils::ftos(const float value) {
	stringstream ss;
	ss << value;
	return ss.str();
}

//双精度转化成字符串
string StringUtils::dtos(const double value) {
	stringstream ss;
	ss << value;
	return ss.str();
}

//str是否int
bool StringUtils::isDigit(const char * str, int len) {
	int i = 0;
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
	return isDigit && (i > 0);
}

//true: float or int, false: other
bool StringUtils::isNumber(const char * str, int len) {
	int i = 0;
	bool isDigit = true;
	int dotCount = 0;
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

bool StringUtils::unwrapExcludedText(const std::string& excludedText, std::string& result) {
	result = excludedText;
	if (excludedText.length() < 3) {
		return false;
	}
	stringstream ss;
	int i = 0;
	char firstChar = 0, secordChar = 0, lastChar = 0;
	for (auto ch : excludedText) {
		if (std::iscntrl(ch)) {
			continue;
		}
		
		ss << ch;
		if (i == 0) {
			firstChar = ch;
		}
		else if (i == 1) {
			secordChar = ch;
		}
		lastChar = ch;
		i++;
	}
	if (firstChar == '!' && secordChar == '(' && lastChar == ')') {
		std::string tmp = ss.str();
		result = tmp.substr(2, tmp.size() - 3);
		return true;
	}
	return false;
}

size_t StringUtils::Count(const std::string& str, const std::string& substr) {
	size_t count = 0;
	size_t pos = str.find(substr);
	while (pos != std::string::npos) {
		count++;
		pos = str.find(substr, pos + substr.length());
	}
	return count;
}

bool StringUtils::Intersect(const std::vector<string>& v1, const std::vector<string>& v2) {
	std::vector<string> result;
	return Intersect(result, v1, v2);
}

bool StringUtils::Intersect(const std::set<string>& v1, const std::set<string>& v2) {
	std::set<string> result;
	return Intersect(result, v1, v2);
}

bool StringUtils::Intersect(std::vector<string>& result, const std::vector<string>& v1, const std::vector<string>& v2) {
	std::vector<string> tmpV1 = v1;
	std::vector<string> tmpV2 = v2;

	//移除空字符串元素
	//std::copy_if(v1.begin(), v1.end(), std::back_inserter(tmpV1),
	//	[](const std::string& str) { return!str.empty(); });
	//std::copy_if(v2.begin(), v2.end(), std::back_inserter(tmpV2),
	//	[](const std::string& str) { return!str.empty(); });

	std::sort(tmpV1.begin(), tmpV1.end());
	std::sort(tmpV2.begin(), tmpV2.end());
	std::set_intersection(tmpV1.begin(), tmpV1.end(), tmpV2.begin(), tmpV2.end(), std::back_inserter(result));
	return !result.empty();
}

bool StringUtils::Intersect(std::set<string>& result, const std::set<string>& v1, const std::set<string>& v2) {
	std::set<string> tmpV1 = v1;
	std::set<string> tmpV2 = v2;

	//移除空字符串元素
	//std::copy_if(v1.begin(), v1.end(), std::back_inserter(tmpV1),
	//	[](const std::string& str) { return!str.empty(); });
	//std::copy_if(v2.begin(), v2.end(), std::back_inserter(tmpV2),
	//	[](const std::string& str) { return!str.empty(); });

	std::set_intersection(tmpV1.begin(), tmpV1.end(), tmpV2.begin(), tmpV2.end(), std::inserter(result, result.begin()));
	return !result.empty();
}