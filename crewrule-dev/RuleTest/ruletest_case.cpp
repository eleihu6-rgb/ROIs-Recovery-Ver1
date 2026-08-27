
#include <iostream>
#include <fstream>
#include "ruletest_case.h"
#include "StringUtil.h"

using namespace std;

void ruleTestCase::reset() {
	this->caseName = "";
	this->ptnSegStr.clear();
	this->ruleParams.clear();
}

void ruleTestCase::print() {
	cout << "\n----\n" << "Case:" << this->caseName << endl;
	for (auto& it : this->ruleParams) {
		cout << it.first << "=" << it.second << endl;
	}
	cout << endl;
	for (auto& segStr : this->ptnSegStr) {
		cout << segStr << endl;
	}
	cout << "\n";

}
//
//格式化：转大写，移除空格，移除'_'
std::string ruleTestCase::formatKey(std::string str) {
	str = toUpper(str);
	str = replace(str, "_", "");
	str = replace(str, " ", "");
	return str;
}
//
//兼容大小写，兼容空格分词或不分词，兼容下划线分词或不分词
//key识别效果 MAXPG == MAX PG == MAX_PG == max pg
std::string ruleTestCase::getValue(std::string key) {
	key = formatKey(key);
	return this->ruleParams[key];
}
//return true: value=1 or =Y or =true
bool ruleTestCase::getBoolValue(std::string key) {
	string val = getValue(key);
	val = strToUpper(val);
	return val == "Y" || val == "TRUE" || val == "1";
}
//
//兼容大小写，兼容空格分词或不分词，兼容下划线分词或不分词
//key识别效果 MAXPG == MAX PG == MAX_PG == max pg
void ruleTestCase::setValue(std::string key, std::string value) {
	key = formatKey(key);
	this->ruleParams[key] = value;
}
//
vector<ruleTestCase> loadRuleTestCase(string file) {
	vector<ruleTestCase> result;
	ifstream input(file);
	string line;

	string currentCase;
	bool isPtnLineStart = false;//标记：同一case内，是否已经开始进入 ptn/seg 段落
	ruleTestCase item;

	while (getline(input, line)) {
		//cout << "test: " << line << endl;

		//skip comment
		if (line.length() > 0 && line.at(0) == '#') {
			continue;
		}
		//遇到 [xxx]，则发现新 case
		//解析case name
		//每次新 case重新初始化为 isPtnLineStart=false，以区分case内 rule param和 ptn
		//每次新 case清空item中上一case数据
		if (line.length() > 0 && line.at(0) == '[') {
			if (item.caseName != "comments" && item.ptnSegStr.size() > 0) {
				result.push_back(item); //每一段解析过程更新item对象数值，并复制副本到result
			}
			item.reset();
			item.caseName = line.substr(1, line.length() - 2);
			isPtnLineStart = false; 
		}
		//skip comments paragraph
		if (toLower(item.caseName) == "comments") {
			item.caseName = "comments";
			continue;
		}
		vector<string> raw;
		split(line, raw, "=");
		if (raw.size() == 2 && toLower(raw[0]) != "pairing") {
			item.setValue(raw[0], raw[1]);
		}
		//pairing lines start
		if (raw.size() > 0 && toLower(raw[0]) == "pairing") {
			isPtnLineStart = true;
		}
		//pairing segs
		//空行表 duty end
		if (isPtnLineStart) {
			if (raw.size() > 0 && toLower(raw[0]) == "pairing") {
				continue;// skip line 'pairing='
			}
			item.ptnSegStr.push_back(line);
		}

	}
	//
	//末尾case因没有后续 [xxx]行，无法触发收集逻辑，单独处理
	if (item.ptnSegStr.size() > 0) {
		result.push_back(item);
	}

	return result;
}
