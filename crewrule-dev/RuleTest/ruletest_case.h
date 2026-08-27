#ifndef RULE_TEST_CASE_H
#define RULE_TEST_CASE_H

#include <map>
#include <string>
#include <vector>

/*
1. caseName: 名称，通常包含法规号、目标参数、期望违规与否，如 2003_maxPgHours_legal
2. ruleParams: 法规参数
3. ptnSegStr: ptn内 seg string，空行表 duty end
*/
class ruleTestCase {
public:
	std::string caseName;
	std::vector<std::string> ptnSegStr;
	//
	void reset();
	void print();
	//
	//兼容大小写，兼容空格分词或不分词，兼容下划线分词或不分词
	//key识别效果 MAXPG == MAX PG == MAX_PG == max pg
	std::string getValue(std::string key);
	bool getBoolValue(std::string key);
	void setValue(std::string key, std::string value);
	//格式化：转大写，移除空格，移除'_'
	std::string formatKey(std::string str);
private:
	std::map<std::string, std::string> ruleParams;
};
//
//读取case文件，每个case形成一个ruleTestCase对象
std::vector<ruleTestCase> loadRuleTestCase(std::string file);

#endif//RULE_TEST_CASE_H
