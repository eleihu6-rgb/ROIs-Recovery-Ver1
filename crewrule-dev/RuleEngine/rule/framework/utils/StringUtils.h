#ifndef _NEWRULEENGINE_STRINGUTILS_H_
#define _NEWRULEENGINE_STRINGUTILS_H_

#include <string>
#include <set>
#include <unordered_set>
#include <vector>

#include "./internal/Format.h"

using namespace std;

class StringUtils {

public:
	//字符串转化成整数
	static int stoi(const string& str, const int defaultValue);

	//字符串转化成整数
	static long stol(const string& str, const long defaultValue);

	//字符串转化成整数
	static long long stoll(const string& str, const long long defaultValue);

	//字符串转化成单精度
	static float stof(const string& str, const float defaultValue);

	//字符串转化成双精度
	static double stod(const string& str, const double defaultValue);

	//整数转化成字符串。若isNa为true，则整数最小值或最大值变成 NA(Not Applicable不适用)
	static string itos(const int value, const bool isNa = false);

	//长整数转化成字符串。若isNa为true，则长整数最小值或最大值变成 NA(Not Applicable不适用)
	static string ltos(const long value, const bool isNa = false);

	//64位整数转化成字符串。若isNa为true，则64位整数最小值或最大值变成 NA(Not Applicable不适用)
	static string lltos(const long long value, const bool isNa = false);

	//单精度转化成字符串
	static string ftos(const float value);

	//双精度转化成字符串
	static string dtos(const double value);

	//判断str是否整数
	static bool isDigit(const char * str, int len);
	
	//判断str是否整数或小数
	static bool isNumber(const char * str, int len);

	/**
	* 字符串格式化，举例：
	* int a = 1;
	* double b = 2.02233;
	* string c = "hello";
	* char* d = "world";
	* string str = StringUtils::Format("test {0}, test 1{1}, test2 {2}, test3 {3}, test4{{4}", a, b, c, d);
	* 或者 string str = StringUtils::Format("test {0:a}, test 1{1:b}, test2 {2:c}, test3 {3:c}, test4{{4}", a, b, c, d);
	* 输出str：test 1, test 12.02233, test2 hello, test3 world, test4{4}
	* 备注：字符串 {{ 表示 {
	*/
	template <typename... Args>
	static std::string Format(const std::string& format, Args&&... args) {
		return util::Format(format, args...);
	}

	//!(A|B|C) 转换成 A|B|C, result: 返回结果，返回值：true-合法，false-不合法
	static bool unwrapExcludedText(const std::string& excludedText, std::string& result);

	//统计子串substr，在str中出现支持（提高性能，假设：子串之间不会重叠）
	static size_t Count(const std::string& str, const std::string& substr);
public:
	//是否存在交集
	static bool Intersect(const std::vector<string>& v1, const std::vector<string>& v2);
	static bool Intersect(const std::set<string>& v1, const std::set<string>& v2);

	static bool Intersect(std::vector<string>& result, const std::vector<string>& v1, const std::vector<string>& v2);
	static bool Intersect(std::set<string>& result, const std::set<string>& v1, const std::set<string>& v2);

public:
	template<class T>
	static string Join(const std::vector<T>& list, const string& delim) {
		stringstream ss;
		for (std::size_t i = 0; i < list.size(); i++) {
			ss << list[i];
			if (i < list.size() - 1)
				ss << delim;
		}
		return ss.str();
	}

	template<class T>
	static string Join(const std::set<T>& list, const string& delim) {
		stringstream ss;
		size_t i = 0;
		for (auto& value : list) {
			ss << value;
			if (i < list.size() - 1)
				ss << delim;
			i++;
		}
		return ss.str();
	}

	template<class T>
	static string Join(const std::unordered_set<T>& list, const string& delim) {
		stringstream ss;
		size_t i = 0;
		for (auto& value : list) {
			ss << value;
			if (i < list.size() - 1)
				ss << delim;
			i++;
		}
		return ss.str();
	}
};

#endif //_NEWRULEENGINE_STRINGUTILS_H_